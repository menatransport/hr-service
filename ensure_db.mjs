/**
 * เทียบดัชนีบน MongoDB จริงกับที่ประกาศไว้ใน `lib/db/registry.mjs`
 *
 *   node ensure_db.mjs           → **อ่านอย่างเดียว** รายงาน missing / extra / conflict
 *                                  exit 1 เมื่อมี missing หรือ conflict · extra อย่างเดียวยัง exit 0
 *   node ensure_db.mjs --apply   → สร้างเฉพาะดัชนีที่ขาด (ไม่แตะ conflict · **ไม่ลบอะไรเลย**)
 *
 * ไม่แตะคอลเลกชัน `external` (เช่น `newyear-survey` ของ ncacdb) และไม่แตะ `Boom_ETL`
 * ไม่พิมพ์ค่าในเอกสารหรือ `MONGO_URI` — พิมพ์แค่ชื่อคอลเลกชัน/ดัชนี/คีย์
 */
import { MongoClient } from "mongodb";

import { hrDbName, loadEnv } from "./db_env.mjs";
import { applyMissingIndexes, diffIndexes } from "./lib/db/ensure.mjs";

const apply = process.argv.includes("--apply");
const env = loadEnv();
if (!env.MONGO_URI) {
  console.error("ยังไม่ได้ตั้งค่า MONGO_URI ใน .env.local");
  process.exit(1);
}

const dbName = hrDbName(env);
const fmtKey = (key) => JSON.stringify(key);

const client = new MongoClient(env.MONGO_URI, {
  serverSelectionTimeoutMS: 15_000,
  appName: "hr-service-ensure",
});

let exitCode = 0;
try {
  await client.connect();
  const db = client.db(dbName);
  const diff = await diffIndexes(db);

  console.log(`database "${dbName}" — ${apply ? "--apply (สร้างเฉพาะตัวที่ขาด)" : "dry-run อ่านอย่างเดียว"}\n`);

  let missing = 0;
  let extra = 0;
  let conflicts = 0;
  for (const c of diff.collections) {
    missing += c.missing.length;
    extra += c.extra.length;
    conflicts += c.conflicts.length;
    const status = !c.exists
      ? "ยังไม่มีคอลเลกชัน"
      : c.missing.length || c.conflicts.length
        ? "ต่าง"
        : "ตรง";
    console.log(`${status.padEnd(6)} ${c.name} (${c.key}) — ตรง ${c.ok.length}`);
    for (const m of c.missing) console.log(`         + ขาด     ${m.name} ${fmtKey(m.key)}`);
    for (const x of c.extra) console.log(`         ? เกิน     ${x.name} ${fmtKey(x.key)} (ไม่ได้ประกาศ — ไม่ลบให้)`);
    for (const k of c.conflicts)
      console.log(
        `         ! ชนกัน   ${k.declared.name} ${fmtKey(k.declared.key)} ↔ ของจริง ${k.live.name} ${fmtKey(k.live.key)} — ${k.reason}`,
      );
  }

  console.log("");
  for (const e of diff.external)
    console.log(`ข้าม    ${e.name} — external (ระบบอื่นเป็นเจ้าของ)${e.exists ? "" : " · ยังไม่มีบนฐาน"}`);
  if (diff.unregistered.length)
    console.log(`ไม่อยู่ในทะเบียน: ${diff.unregistered.join(", ")}`);

  console.log(
    `\nสรุป: ขาด ${missing} · เกิน ${extra} · ชนกัน ${conflicts} · (\`_id_\` ไม่นับ — Mongo สร้างให้เองทุกคอลเลกชัน)`,
  );

  if (apply) {
    if (!missing) console.log("ไม่มีดัชนีที่ขาด — ไม่ได้สร้างอะไร");
    else
      for (const done of await applyMissingIndexes(db, diff))
        console.log(`สร้างแล้ว ${done.name}: ${done.created.join(", ")}`);
    if (conflicts) console.log("conflict ไม่ถูกแตะ — ต้องแก้เองทีละตัว");
  }

  if ((!apply && missing) || conflicts) exitCode = 1;
} catch (err) {
  console.error("ตรวจไม่สำเร็จ —", err instanceof Error ? err.message : String(err));
  exitCode = 1;
} finally {
  await client.close();
}
process.exit(exitCode);
