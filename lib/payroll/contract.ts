import { effectOf, PAYEE_COLUMN, DEFAULT_PAYEE_COLUMN } from "./classify";
import { columnRole } from "./normalize";
import {
  CATEGORY_ORDER,
  INTAKE_ITEMS,
  MERGE_COLUMN,
  RETIRED_ITEMS,
} from "./registry";
import { DAY_CODES, templateOf } from "./template-spec";

/**
 * "สัญญา" ของการรับข้อมูลเงินเดือน — ภาพรวมทุกเงื่อนไขที่ฝ่ายอื่นมองเห็น เขียนเป็น
 * ข้อความบรรทัดเดียวจบต่อหนึ่งเรื่อง เพื่อ **ให้การเปลี่ยนเงื่อนไขกลายเป็น diff ที่คนรีวิวเห็น**
 *
 * ## ทำไมต้องมี
 *
 * เงื่อนไขพวกนี้กระจายอยู่ 5 ไฟล์ (ทะเบียน · ผังคอลัมน์ · ทิศทางเงิน · รหัสวัน · ฟอร์มรวม)
 * การแก้บรรทัดเดียวในไฟล์ใดไฟล์หนึ่งเปลี่ยนสิ่งที่ฝ่ายอื่นต้องทำทันที — เช่น เพิ่มคอลัมน์
 * ในฟอร์ม หรือเปลี่ยนทิศทางเงินจาก "รอยืนยัน" เป็น "หัก" · ถ้าไม่มีที่รวม การรีวิวจะเห็น
 * แค่ "แก้ไฟล์ classify.ts 1 บรรทัด" โดยไม่เห็นว่ามันแปลว่าอะไรกับคนที่ใช้งานจริง
 *
 * `npm test` เทียบผลของฟังก์ชันนี้กับไฟล์ `contract.snapshot.txt` ที่ commit ไว้ —
 * เปลี่ยนเงื่อนไขแล้วเทสต์จะล้มพร้อมบอกว่าบรรทัดไหนเปลี่ยน ต้องตั้งใจอัปเดต snapshot
 * ถึงจะผ่าน (`npm run snapshot:payroll`) ซึ่งเป็นจังหวะที่คนรีวิวได้เห็นผลกระทบ
 */
export function contractLines(): string[] {
  const lines: string[] = [];

  lines.push(`รายการที่ต้องส่ง ${INTAKE_ITEMS.length} รายการ`);
  for (const item of INTAKE_ITEMS) {
    const spec = templateOf(item.id);
    const payee = PAYEE_COLUMN[item.id] ?? DEFAULT_PAYEE_COLUMN;
    const money = (spec?.columns ?? [])
      .map((c) => ({ c, e: effectOf(item.id, c) }))
      .filter((x) => x.e)
      .map((x) => `${x.c}=${x.e}`)
      .join(",");
    lines.push(
      `#${item.id} | ${item.owner} | ${item.category} | ส่งภายในวันที่ ${item.dueDay} | ` +
        `${spec?.confirmed ? "ฟอร์มยืนยันแล้ว" : "ฟอร์มร่าง"} | ${spec?.columns.length ?? 0} คอลัมน์ | ` +
        `เงินเข้า ${payee} | ${money || "ไม่มีช่องตัวเลข"}`,
    );
    lines.push(`#${item.id} คอลัมน์: ${(spec?.columns ?? []).join(" | ")}`);
  }

  lines.push(`ลำดับหมวด: ${CATEGORY_ORDER.join(" > ")}`);

  for (const [id, merge] of Object.entries(MERGE_COLUMN)) {
    lines.push(`ฟอร์มรวม #${id} แยกด้วยช่อง ${merge.column} = ${merge.values.join(" / ")}`);
  }
  for (const retired of RETIRED_ITEMS) {
    lines.push(`ปลดระวาง #${retired.id} (${retired.title}) รวมเข้า #${retired.mergedInto} ตั้งแต่รอบ ${retired.since}`);
  }

  for (const day of DAY_CODES) {
    const meaning = day.meaning ? `ยืนยันแล้ว: ${day.meaning}` : "ยังไม่ยืนยัน";
    lines.push(`รหัสวัน ${day.code} — ${meaning}`);
  }

  /* ช่องที่แปลงเป็นชื่อมาตรฐานไม่ได้ต้องไม่มี — ถ้ามีจะโผล่ใน snapshot ให้เห็นทันที */
  const orphans: string[] = [];
  for (const item of INTAKE_ITEMS) {
    for (const column of templateOf(item.id)?.columns ?? []) {
      if (!columnRole(item.id, column)) orphans.push(`#${item.id}/${column}`);
    }
  }
  lines.push(`ช่องที่ยังไม่มีชื่อมาตรฐาน: ${orphans.length ? orphans.join(", ") : "ไม่มี"}`);

  return lines;
}

export const contractText = (): string => `${contractLines().join("\n")}\n`;
