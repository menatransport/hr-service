import { NextResponse } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { RequisitionError } from "@/app/recruitment/_lib/requisitions/store";

/**
 * ของใช้ร่วมของเส้น `/api/recruitment/requisitions/**`
 *
 * แยกไฟล์ออกมาเพราะ **`route.ts` ของ App Router ส่งออกได้เฉพาะ route handler**
 * กับค่าคอนฟิกเท่านั้น — ใส่ฟังก์ชันอื่นไว้ในนั้นแล้วจะ build ไม่ผ่าน
 *
 * `RequisitionError` = ข้อมูลที่กรอกมาไม่ผ่าน → **400 ไม่ใช่ 500** ผู้ใช้จะได้เห็น
 * ว่าต้องแก้อะไร แทนข้อความ “เกิดข้อผิดพลาด” (ท่าเดียวกับ `failRecruitment()`)
 */
export function failRequisition(err: unknown) {
  if (err instanceof RequisitionError)
    return NextResponse.json({ error: err.message }, { status: 400 });
  return fail(err);
}
