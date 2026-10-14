import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateClassification, classify, KIND_LABEL, type ItemKind } from "@/lib/payroll/classify";
import { CURRENT_PERIOD } from "@/lib/payroll/period";
import type { ParsedFile } from "@/lib/payroll/parse";
import { CATEGORY_ORDER, INTAKE_ITEMS, itemsByCategory } from "@/lib/payroll/registry";
import { runChecks, TIGERSOFT_PENDING, validateRuleColumns, WAITING_OWNER, type CheckResult } from "@/lib/payroll/rules";
import { buildAllTemplates } from "@/lib/payroll/template-export";
import { DAY_CODES, hasDayGrid, templateOf } from "@/lib/payroll/template-spec";

/**
 * ไฟล์สมมติของรายการหนึ่ง: หัวคอลัมน์ครบตามสเปก มีหนึ่งแถวที่ทุกช่องว่าง — ใช้ลองเรียกกฎ
 * ดูว่ากฎของรายการนั้นพูดอะไรได้บ้าง · ถ้ารายการมีตารางรายวัน ใส่รหัสวันที่ยังไม่ยืนยัน
 * ความหมายลงช่องวันที่ 1 เพื่อให้กฎที่รอฝ่ายจัดส่งโผล่ออกมาด้วย
 *
 * ใช้ที่เดียว (ด้านล่าง) จึงไม่ export
 */
function emptyProfileOf(itemId: string): ParsedFile {
  const columns = templateOf(itemId)?.columns ?? [];
  const letter = (i: number) => String.fromCharCode(65 + i);
  const row: Record<string, string> = {};
  const pendingDay = DAY_CODES.find((d) => !d.meaning)?.code;
  if (hasDayGrid(columns) && pendingDay) row[letter(columns.indexOf("1"))] = pendingDay;
  return {
    profile: {
      fileName: `${itemId}.xlsx`,
      sheetName: "probe",
      sheetCount: 1,
      headerRow: 1,
      totalRows: 1,
      columns: columns.map((header, i) => ({
        letter: letter(i),
        header,
        type: "text",
        state: "ok",
        valid: 0,
        mismatch: 0,
        empty: 1,
        distinct: 0,
        samples: [],
      })),
    },
    rows: [row],
    rowNumbers: [2],
  };
}

/** กฎที่รายการนี้ยังตัดสินไม่ได้ และคนที่เรารออยู่ — อ่านจากที่เดียวกับที่กฎใช้ ไม่เขียนซ้ำมือ */
function waitingOn(itemId: string, probe: CheckResult[]): string[] {
  const out: string[] = [];
  const spec = templateOf(itemId);
  if (spec && !spec.confirmed) out.push("ฝ่ายเจ้าของข้อมูล (แบบฟอร์มร่าง)");
  if (probe.some((r) => r.id === "daycode.meaning-pending")) out.push("ฝ่ายจัดส่ง (รหัสวัน)");
  if (probe.some((r) => r.id === "money.effect-pending")) out.push(WAITING_OWNER[itemId] ?? "ฝ่ายเจ้าของข้อมูล");
  if (TIGERSOFT_PENDING[itemId]) out.push("HR C&B (Tiger Soft)");
  return out;
}

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

  /* กฎที่อ้างคอลัมน์ต้องอ้างคอลัมน์ที่มีจริงในสเปก — สะกดเพี้ยนตัวเดียว กฎจะเงียบไปเฉย ๆ
     โดยไม่มีใครรู้ ซึ่งอันตรายกว่ากฎที่ดังผิด */
  problems.push(...validateRuleColumns());

  /* ทุกรายการต้องมีกฎที่ตรวจจริง (active) อย่างน้อยหนึ่งข้อ — รายการที่ไม่มีเลยคือรายการที่
     ด่าน 1 ปล่อยผ่านทุกอย่าง ซึ่งอ่านจากหน้าจอไม่ออกว่าเป็นเพราะไฟล์ดีหรือเพราะไม่มีกฎ
     (ลองกับไฟล์สมมติที่ว่างทุกช่อง: กฎของรายการต้องพูดอะไรสักอย่างที่ไม่ใช่แค่ "ไฟล์เปล่า") */
  const probes = new Map<string, CheckResult[]>();
  for (const item of INTAKE_ITEMS) {
    const probe = runChecks(item.id, emptyProfileOf(item.id));
    probes.set(item.id, probe);
    if (!probe.some((r) => r.status === "active")) problems.push(`#${item.id} ไม่มีกฎตรวจเลย`);
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

  console.log("\nกฎต่อรายการ: ตรวจจริง = กฎที่บล็อก/เตือนได้ทันที · รอยืนยัน = ขึ้นบนจอแต่ยังไม่บล็อก");
  for (const item of INTAKE_ITEMS) {
    const probe = probes.get(item.id)!;
    const active = probe.filter((r) => r.status === "active").length;
    const waiting = waitingOn(item.id, probe);
    /* ฟอร์มร่างคือกฎ "ขาดคอลัมน์" ที่ยังบังคับไม่ได้ — ไฟล์สมมติครบทุกช่องจึงไม่เห็น ต้องนับเพิ่มเอง */
    const draft = templateOf(item.id)?.confirmed === false ? 1 : 0;
    const pending = probe.filter((r) => r.status === "pending").length + draft;
    console.log(
      `  #${item.id} ตรวจจริง ${active} · รอยืนยัน ${pending}` + (waiting.length ? ` ← รอ ${waiting.join(", ")}` : ""),
    );
  }

  const { file, name } = await buildAllTemplates(CURRENT_PERIOD);
  const outDir = process.argv[2] ?? join(process.cwd(), ".verify");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, name);
  writeFileSync(out, Buffer.from(file));
  console.log(`\nสร้างแบบฟอร์มทั้งชุด ${(file.byteLength / 1024).toFixed(0)} KB → ${out}`);
  console.log("ตรวจผ่านทุกข้อ ✓");
}

void main();
