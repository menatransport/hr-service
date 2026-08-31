import { NextResponse } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { RecordCaseError } from "@/lib/record-cases";
import type { RecordActor } from "@/lib/record-case-flow";

/**
 * ของใช้ร่วมของทุกเส้นใต้ `/api/record-cases`
 *
 * แยกออกมาเพราะทั้งสามเส้นต้องการสองอย่างเดียวกัน: รู้ว่าใครเป็นคนทำ
 * และแปลง `RecordCaseError` (ข้อมูลที่ผู้ใช้กรอกไม่ผ่าน) ให้เป็น 400
 * ไม่ใช่ 500 — ผู้ใช้จะได้เห็นว่าต้องแก้อะไร แทนข้อความ “เกิดข้อผิดพลาด”
 */

/**
 * ผู้ทำรายการ — **มาจาก session เท่านั้น ห้ามรับจาก body**
 * (กฎเดียวกับ `getActorEmployeeId()` ของฝั่งคำร้อง: ไม่งั้นใครยิง API ตรง
 * ก็ลงชื่อเป็นคนอื่นในประวัติการเปลี่ยนสถานะได้)
 *
 * `null` = ยังไม่ล็อกอิน ซึ่งตามปกติ `proxy.ts` กันไว้ก่อนถึงตรงนี้แล้ว
 */
export async function actor(): Promise<(RecordActor & { department: string }) | null> {
  const user = await readSessionUser();
  if (!user) return null;
  return {
    employeeId: user.employeeId,
    name: user.name || user.employeeId,
    department: user.department || "—",
  };
}

export const unauthorized = () =>
  NextResponse.json(
    { error: "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง" },
    { status: 401 },
  );

export function failRecord(err: unknown) {
  if (err instanceof RecordCaseError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return fail(err);
}
