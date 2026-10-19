import { hrCol } from "@/lib/db";

/**
 * บันทึกประวัติยืนยัน/ปลดคู่ลง `partner_driver_link_events` — **ต่อท้ายอย่างเดียว ไม่เคยแก้/ลบ**
 *
 * ปลดคู่คือการลบแถวใน `partner_driver_links` ถ้าไม่จดไว้ที่นี่ จะไม่เหลือร่องรอยว่าเคยผูกกับใครและใครปลด
 * · เขียนไม่สำเร็จต้องไม่ทำให้การยืนยัน/ปลดคู่ล้ม (ข้อมูลหลักบันทึกไปแล้ว) — จึงลง log ของเซิร์ฟเวอร์แทน
 */
export async function writeLinkEvent(event: Record<string, unknown>): Promise<void> {
  try {
    const at = typeof event.at === "string" ? new Date(event.at) : new Date();
    await (await hrCol("partnerDriverLinkEvents")).insertOne({ ...event, at });
  } catch (err) {
    console.warn("[driver-links] จดประวัติไม่สำเร็จ —", err, JSON.stringify(event));
  }
}
