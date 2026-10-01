import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { StorageError } from "@/lib/s3";
import { RecruitmentError } from "@/app/recruitment/_lib/questions";
import { HrDocumentError } from "@/app/recruitment/_lib/hr-document-records-store";
import type { HrActor } from "@/app/recruitment/_lib/hr-document-records";

/**
 * ของใช้ร่วมของทุกเส้นใต้ `/api/recruitment`
 *
 * แยกออกมาด้วยเหตุผลเดียวกับ `app/api/record-cases/_lib.ts` — ทุกเส้นต้องรู้ว่า
 * ใครเป็นคนทำ และต้องแปลง `RecruitmentError` (ข้อมูลที่กรอกมาไม่ผ่าน) เป็น 400
 * ไม่ใช่ 500 ผู้ใช้จะได้เห็นว่าต้องแก้อะไร แทนข้อความ “เกิดข้อผิดพลาด”
 */

/**
 * ผู้แก้ไขคลังคำถาม / ผู้เปลี่ยนสถานะใบสมัคร — **มาจาก session เท่านั้น**
 * (กฎเดียวกับ `actor()` ของบันทึกเคส: ไม่งั้นใครยิง API ตรงก็ลงชื่อเป็นคนอื่นได้)
 */
export async function editor(): Promise<string | null> {
  const user = await readSessionUser();
  if (!user) return null;
  return user.name || user.employeeId;
}

/**
 * ผู้ทำรายการแบบเต็ม (รหัสพนักงาน + ชื่อ) — ใช้กับจุดที่ต้องเก็บ `HrActor` ลงฐาน
 * (เอกสาร HR ที่ทำเอกสารในใบสมัคร) ต่างจาก `editor()` ที่คืนแค่ชื่อสำหรับลงไทม์ไลน์ทั่วไป
 * ที่ไม่มีที่เก็บรหัสพนักงานแยก
 */
export async function hrActor(): Promise<HrActor | null> {
  const user = await readSessionUser();
  if (!user) return null;
  return { employeeId: user.employeeId, name: user.name || user.employeeId };
}

export const unauthorized = () =>
  NextResponse.json(
    { error: "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง" },
    { status: 401 },
  );

export function failRecruitment(err: unknown) {
  if (err instanceof RecruitmentError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  /* `HrDocumentError` คือสองกรณีที่ตอบ 400 เดียวไม่พอ — ไม่พบใบสมัคร (404) และ
     บันทึกชนกันจาก optimistic concurrency (409) ดูรายละเอียดที่นิยามคลาส */
  if (err instanceof HrDocumentError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  /* ที่เก็บไฟล์ S3 ล่ม/ตั้งค่าไม่ครบ — ส่งข้อความจริงกลับไป ไม่ใช่ 500 เปล่า ๆ */
  if (err instanceof StorageError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return fail(err);
}

export async function readBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

/**
 * ที่มาของคำขอ สำหรับเก็บเป็นหลักฐานความยินยอม
 *
 * `x-forwarded-for` มาจาก proxy ปลอมได้ แต่เก็บไว้ก็ยังดีกว่าไม่มีอะไรเลย —
 * PDPA ต้องการหลักฐานว่าใครยินยอมเมื่อไหร่ ไม่ได้ต้องการ IP ที่พิสูจน์ตัวตนได้
 */
export function clientMeta(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0].trim() || "ไม่ทราบ",
    userAgent: request.headers.get("user-agent") ?? "ไม่ทราบ",
  };
}
