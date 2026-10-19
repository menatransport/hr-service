import type { Db } from "mongodb"

/**
 * ล็อคงวดเงินเดือน — งวดที่ approved/locked แล้ว ห้ามแก้ข้อมูลต้นทางทุกชนิด
 * (ค่าเที่ยว/วันทำงาน/รับ-หักอื่น/ปรับปรุง/งวดเงินเดือน) ต้องตีกลับหรือปลดล็อคก่อน
 * ใช้: const locked = await monthClosed(db, month); if (locked) return NextResponse.json(closedError(month), { status: 423 })
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function monthClosed(db: Db | any, month: string): Promise<boolean> {
  if (!/^\d{4}-\d{2}$/.test(month)) return false
  const doc = await db.collection("month_status").findOne({ month }, { projection: { phase: 1 } })
  if (doc?.phase === "approved" || doc?.phase === "locked") return true
  // chain lock: งวดถัดไปงวดใดอนุมัติ/ปิดแล้ว → งวดนี้แก้ไม่ได้ด้วย
  // (โซ่หนี้ยกยอด carryIn/carryOut + ledger ตัดยอดแล้ว — แก้ย้อนหลังทำเลขที่อนุมัติแล้วเพี้ยน)
  const later = await db.collection("month_status").findOne(
    { month: { $gt: month }, phase: { $in: ["approved", "locked"] } }, { projection: { month: 1 } })
  return !!later
}

export const closedError = (month: string) => ({
  error: `งวด ${month} แก้ไขไม่ได้ — งวดนี้หรืองวดถัดไปอนุมัติ/ปิดแล้ว (โซ่หนี้ยกยอดล็อคย้อนหลังอัตโนมัติ ต้องปลดล็อคจากงวดล่าสุดก่อน)`,
})
