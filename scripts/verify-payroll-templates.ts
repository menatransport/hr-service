import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateClassification, classify, KIND_LABEL, type ItemKind } from "@/lib/payroll/classify";
import { CURRENT_PERIOD } from "@/lib/payroll/period";
import { CATEGORY_ORDER, INTAKE_ITEMS, itemsByCategory } from "@/lib/payroll/registry";
import { buildAllTemplates } from "@/lib/payroll/template-export";
import { templateOf } from "@/lib/payroll/template-spec";

/**
 * ตรวจทะเบียน + สเปกคอลัมน์ + การจัดประเภท แล้วสร้างแบบฟอร์มทั้งชุดจริง
 *
 * `npx tsx --tsconfig tsconfig.json scripts/verify-payroll-templates.ts [outDir]`
 *
 * รันก่อน commit ทุกครั้งที่แตะ `lib/payroll/registry.ts` `template-spec.ts` หรือ
 * `classify.ts` — สามไฟล์นี้อ้างถึงกันด้วยชื่อช่องเป็นข้อความ สะกดเพี้ยนตัวเดียว
 * tsc จับไม่ได้ แต่สคริปต์นี้จับได้ และผลคือเงินลงผิดช่อง
 */
async function main() {
  const problems = validateClassification();
  for (const item of INTAKE_ITEMS) {
    if (!templateOf(item.id)) problems.push(`#${item.id} ไม่มีสเปกคอลัมน์`);
  }
  for (const p of problems) console.log("✗", p);
  if (problems.length) {
    console.log(`\nไม่ผ่าน ${problems.length} ข้อ`);
    process.exit(1);
  }

  const kinds: Record<ItemKind, number> = { ฐาน: 0, เพิ่ม: 0, หัก: 0, ผสม: 0, รอยืนยัน: 0 };
  console.log("หมวด → รายการ (ประเภทเงิน)");
  for (const category of CATEGORY_ORDER) {
    const rows = itemsByCategory(category).map((item) => {
      const cls = classify(item.id)!;
      kinds[cls.kind] += 1;
      return `#${item.id} ${cls.kind}`;
    });
    console.log(`  ${category.padEnd(22)} ${rows.join(" · ")}`);
  }
  console.log(
    "\nประเภทเงิน: " +
      (Object.keys(kinds) as ItemKind[]).map((k) => `${KIND_LABEL[k]} ${kinds[k]}`).join(" · "),
  );

  const { file, name } = await buildAllTemplates(CURRENT_PERIOD);
  const outDir = process.argv[2] ?? join(process.cwd(), ".verify");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, name);
  writeFileSync(out, Buffer.from(file));
  console.log(`\nสร้างแบบฟอร์มทั้งชุด ${(file.byteLength / 1024).toFixed(0)} KB → ${out}`);
  console.log("ตรวจผ่านทุกข้อ ✓");
}

void main();
