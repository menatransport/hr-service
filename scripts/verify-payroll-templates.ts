import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { validateClassification, classify, KIND_LABEL, type ItemKind } from "@/lib/payroll/classify";
import { columnRole, validateNormalization } from "@/lib/payroll/normalize";
import { CURRENT_PERIOD } from "@/lib/payroll/period";
import type { ParsedFile } from "@/lib/payroll/parse";
import { CATEGORY_ORDER, INTAKE_ITEMS, itemsByCategory } from "@/lib/payroll/registry";
import { runChecks, TIGERSOFT_PENDING, validateRuleColumns, WAITING_OWNER, type CheckResult } from "@/lib/payroll/rules";
import { buildAllTemplates } from "@/lib/payroll/template-export";
import { MONEY_COLUMNS, postedColumns } from "@/lib/payroll/classify";
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
  /* ⚠️ letter(i) ใช้ได้แค่ A–Z (26 คอลัมน์แรก) — ที่นี่เขียนแค่ช่องวันที่ 1 กับ 2 ซึ่งอยู่ต้น ๆ ของฟอร์มอยู่แล้ว
     ถ้าฟอร์มไหนมีวันที่ 1 เลยคอลัมน์ Z ต้องเปลี่ยนเป็นตัวอักษรคอลัมน์แบบ Excel (AA, AB …) */
  if (hasDayGrid(columns)) {
    if (pendingDay) row[letter(columns.indexOf("1"))] = pendingDay;
    row[letter(columns.indexOf("2"))] = "ZZZ-ไม่มีในชุดรหัส";
  }
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

/**
 * ผลที่ไฟล์ทดลองของรายการนี้ **ต้อง** ทำให้ออกมา — อ่านจากข้อมูลที่กฎใช้ ไม่เขียนรายชื่อรายการด้วยมือ
 * ถ้ากฎข้อไหนหายไปจากเส้นทางของรายการนั้น สคริปต์ต้องล้ม ไม่ใช่เงียบ
 */
function expectedIds(itemId: string): string[] {
  const columns = templateOf(itemId)?.columns ?? [];
  const want = ["payee.blank"];
  if (postedColumns(itemId).length) want.push("money.all-blank");
  if (hasDayGrid(columns)) {
    want.push("daycode.unknown");
    if (DAY_CODES.some((d) => !d.meaning)) want.push("daycode.meaning-pending");
  }
  if (Object.values(MONEY_COLUMNS[itemId] ?? {}).includes("รอยืนยัน")) want.push("money.effect-pending");
  if (TIGERSOFT_PENDING[itemId]) want.push("tigersoft.shape-pending");
  return want;
}

/** กฎที่รายการนี้ยังตัดสินไม่ได้ และคนที่เรารออยู่ — อ่านจากที่เดียวกับที่กฎใช้ ไม่เขียนซ้ำมือ */
function waitingOn(itemId: string, probe: CheckResult[]): string[] {
  const out: string[] = [];
  const spec = templateOf(itemId);
  if (spec && !spec.confirmed) out.push("ฝ่ายเจ้าของข้อมูล (ไฟล์จริงเพื่อยืนยันแบบฟอร์ม)");
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
  /* ทุกคอลัมน์ของทุกฟอร์มต้องแปลงเป็นรูปมาตรฐานได้ — ช่องที่แปลงไม่ได้คือข้อมูลที่
     จะหายเงียบ ๆ ตอนรวมตารางข้ามฝ่าย ไม่ใช่แค่เรื่องความเรียบร้อย */
  problems.push(...validateNormalization());

  /* ลองเรียกกฎของทุกรายการกับไฟล์สมมติที่ว่างทุกช่อง แล้วเช็กว่ากฎที่รายการนั้น **ควรมี**
     (อ่านจากข้อมูล: ตารางรายวัน · ช่องรอยืนยัน · ตาราง Tiger Soft · ช่องเงิน) ส่งผลออกมาครบ —
     รายการที่กฎหายไปจะดูเหมือนไฟล์สะอาดบนหน้าจอ ซึ่งแยกไม่ออก
     ข้อจำกัด: นี่ตรวจว่ากฎ "ยังต่อสายอยู่" ไม่ได้ตรวจว่าเนื้อกฎถูก (เนื้อกฎอยู่ใน rules.test.ts) */
  const probes = new Map<string, CheckResult[]>();
  for (const item of INTAKE_ITEMS) {
    const probe = runChecks(item.id, emptyProfileOf(item.id));
    probes.set(item.id, probe);
    const got = new Set(probe.map((r) => r.id));
    for (const id of expectedIds(item.id)) {
      if (!got.has(id)) problems.push(`#${item.id} กฎ ${id} ควรทำงานกับไฟล์ทดลองว่าง แต่ไม่ออกมา — กฎนี้อาจหลุดจากรายการ`);
    }
  }

  for (const p of problems) console.log("✗", p);
  if (problems.length) {
    console.log(`\nไม่ผ่าน ${problems.length} ข้อ`);
    process.exit(1);
  }

  const kinds: Record<ItemKind, number> = { ฐาน: 0, เพิ่ม: 0, หัก: 0, ผสม: 0, รอยืนยัน: 0 };
  {
    /* สรุปว่ารูปมาตรฐานครอบคลุมแค่ไหน — ตัวเลขนี้คือสิ่งที่บอกได้ว่า "รวมตารางได้จริง" */
    let dims = 0;
    let measures = 0;
    let days = 0;
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const item of INTAKE_ITEMS) {
      for (const header of templateOf(item.id)?.columns ?? []) {
        const role = columnRole(item.id, header);
        if (role?.role === "มิติ") {
          dims += 1;
          names.add(header);
          keys.add(role.key);
        } else if (role?.role === "ค่าที่วัด") measures += 1;
        else if (role?.role === "รายวัน") days += 1;
      }
    }
    console.log(
      `รูปมาตรฐาน: ${dims + measures + days} ช่องใน 25 ฟอร์ม แปลงได้ครบ — ` +
        `ช่องมิติ ${dims} ช่องจาก ${names.size} ชื่อ ยุบเหลือ ${keys.size} ชื่อมาตรฐาน · ` +
        `ช่องที่วัด ${measures} ช่อง · ช่องรายวัน ${days} ช่อง\n`,
    );
  }

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

  console.log("\nรายการที่ยังตัดสินไม่ได้ และรอใคร (ตัวเลขในวงเล็บ = กี่ข้อที่พบจากไฟล์ทดลองว่าง ไม่ใช่จำนวนกฎ)");
  for (const item of INTAKE_ITEMS) {
    const probe = probes.get(item.id)!;
    const waiting = waitingOn(item.id, probe);
    const draft = templateOf(item.id)?.confirmed === false;
    const head = `  #${item.id}  ` + (waiting.length ? `รอ ${waiting.join(", ")}` : "ไม่มีเรื่องค้าง");
    const note = draft ? " · ⚠ ฟอร์มร่าง: ยังไม่ได้บังคับตรวจคอลัมน์เลย" : "";
    console.log(`${head}${note}  (พบจากไฟล์ทดลองว่าง ${probe.length} ข้อ)`);
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
