import { writeFileSync } from "node:fs";

import { hrCol } from "@/lib/db";
import { getApplication } from "@/app/recruitment/_lib/applications";
import {
  drivercodeOfApplication,
  moveDocumentsToRegistry,
} from "@/app/recruitment/_lib/drivers/application-registry";
import { REGISTRY_OWNED, SHARED_KEY } from "@/app/recruitment/_lib/drivers/document-sync";
import { getDriver } from "@/app/recruitment/_lib/drivers/registry";

/**
 * ย้ายข้อมูลเอกสารของใบสมัครที่ได้รหัส พจส. แล้วไปทะเบียน — ของเก่าก่อนกติกา “เจ้าของที่เดียว” (8 พ.ย. 2569)
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/move-doc-fields-to-registry.ts          # ดูอย่างเดียว
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/move-doc-fields-to-registry.ts --apply --backup=docs.json  # ย้ายจริง
 *
 * ทะเบียนว่าง = เติมจากใบสมัคร · ทะเบียนมีค่าแล้ว = ทะเบียนชนะ (ใบสมัครแค่ถูกล้าง) · ช่องที่ทะเบียนรับไม่ได้คงไว้ในใบสมัคร
 * · เลขบัตรประชาชนไม่ถูกล้าง (เป็นกุญแจจับคู่) · ทุกการแก้ลงประวัติทะเบียน/ไทม์ไลน์ใบสมัครตามปกติ
 */

const APPLY = process.argv.includes("--apply");
/** `--backup=<ไฟล์>` — เขียน `documents` เดิมของทุกใบที่เข้าเงื่อนไขก่อนแก้ ไว้กู้คืนได้ */
const BACKUP = process.argv.find((a) => a.startsWith("--backup="))?.slice("--backup=".length);
const BY = "ระบบ (ย้ายข้อมูลเอกสารไปทะเบียน)";

const owned = REGISTRY_OWNED.filter((p) => p.doc !== SHARED_KEY);

async function main() {
  const col = await hrCol("applications");
  const rows = await col
    .find(
      { erasedAt: { $in: [null, undefined] }, $or: owned.map((p) => ({ [`documents.${p.doc}`]: { $nin: ["", null] } })) },
      { projection: { _id: 1 } },
    )
    .toArray();

  if (APPLY) {
    if (!BACKUP) throw new Error("ย้ายจริงต้องระบุ --backup=<ไฟล์> ก่อน");
    const full = await col
      .find({ _id: { $in: rows.map((r) => r._id) } }, { projection: { ref: 1, documents: 1 } })
      .toArray();
    writeFileSync(BACKUP, JSON.stringify(full, null, 1), "utf8");
    console.log(`สำรอง documents เดิม ${full.length} ใบ → ${BACKUP}`);
  }

  let linked = 0;
  let fill = 0;
  let clearOnly = 0;
  let conflict = 0;

  for (const row of rows) {
    const id = row._id.toHexString();
    const application = await getApplication(id);
    if (!application || application.erased) continue;
    const code = await drivercodeOfApplication(application);
    if (!code) continue;
    const driver = await getDriver(code);
    if (!driver) continue;
    linked += 1;

    const notes: string[] = [];
    for (const { doc, field } of owned) {
      const own = application.documents[doc].trim();
      if (!own) continue;
      const reg = String(driver[field.from] ?? "").trim();
      if (!reg) {
        fill += 1;
        notes.push(`${field.label}: เติม “${own}”`);
      } else if (reg.replace(/[\s-]/g, "") !== own.replace(/[\s-]/g, "")) {
        conflict += 1;
        notes.push(`${field.label}: ทะเบียน “${reg}” ชนะ (ใบสมัคร “${own}”)`);
      } else clearOnly += 1;
    }

    if (APPLY) {
      const out = await moveDocumentsToRegistry(id, BY);
      if (out?.kept.length) notes.push(`คงไว้ในใบสมัคร: ${out.kept.join(" · ")}`);
    }
    if (notes.length) console.log(`${application.ref} → ${code}\n  ${notes.join("\n  ")}`);
  }

  console.log(
    `\nใบที่มีข้อมูลเอกสาร ${rows.length} · ผูกรหัสแล้ว ${linked} · เติมทะเบียน ${fill} ช่อง · ค่าตรงกัน (ล้างใบสมัคร) ${clearOnly} ช่อง · ไม่ตรง (ทะเบียนชนะ) ${conflict} ช่อง`,
  );
  console.log(APPLY ? "ย้ายแล้ว" : "ยังไม่ได้แก้อะไร — ใส่ --apply เพื่อย้ายจริง");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
