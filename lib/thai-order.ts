/**
 * เรียงข้อความแบบไทย — `Collator` สร้างครั้งเดียวแล้วใช้ซ้ำ
 *
 * `a.localeCompare(b, "th", …)` เตรียมกติกาภาษาใหม่ทุกครั้งที่เทียบ — เรียง 1,000 แถววัดได้ ~40 ms
 * ต่อรอบ เทียบกับ ~1.6 ms ของ `Collator` ตัวเดียว (ลำดับที่ได้เหมือนกันทุกตัว · 5 พ.ย. 2569)
 * ตารางที่เรียง/นับตัวเลือกใหม่ทุกครั้งที่พิมพ์ค้นหาหรือกดตัวกรองจึงหน่วงชัด
 */
const THAI = new Intl.Collator("th");
const THAI_NUMERIC = new Intl.Collator("th", { numeric: true });

/** = `a.localeCompare(b, "th")` */
export const thaiCompare = THAI.compare;

/** = `a.localeCompare(b, "th", { numeric: true })` — ตัวเลขในข้อความเรียงตามค่า (JR2611-2 ก่อน JR2611-10) */
export const thaiNumericCompare = THAI_NUMERIC.compare;
