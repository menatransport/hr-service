import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { partnerSummaryFor } from "@/lib/payroll/partner/load";
import { periodFromCode } from "@/lib/payroll/period";
import { ownerScope } from "@/lib/payroll/scope";

/**
 * ยอดรถร่วมของรอบ — `GET /api/payroll/summary/partner?period=2026-09` · **อ่านอย่างเดียว**
 *
 * ผลของ `payroll-engine.ts` ของระบบรถร่วม (`mena_partner.payroll_entries`) แปลงเป็นแถวมาตรฐาน
 * แล้วสรุปเป็นยอดรวม + รายสัญญา — ไม่คำนวณเงินใหม่ (ดู `lib/payroll/partner/adapter.ts`)
 *
 * - **ต้องเช็ก session เอง** — `proxy.ts` ปล่อย `GET` ใต้ `/api/**` และผลลัพธ์มีชื่อ/ยอดเงินรายคน
 * - **เฉพาะคนที่เห็นทุกฝ่าย (HR ค่าจ้างและสวัสดิการ)** — ยอดเงินของผู้รับจ้างไม่ใช่ของฝ่ายใด
 *   ฝ่ายที่ส่งไฟล์จึงไม่มีเหตุให้เห็น
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }
    const identity = await getDeskIdentity();
    if (!ownerScope(identity).all) {
      return forbidden(`ยอดรถร่วมเปิดให้เฉพาะ${HR_DEPARTMENT_LABEL}`);
    }

    const period = periodFromCode(request.nextUrl.searchParams.get("period"));
    if (!period) return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");

    return ok(await partnerSummaryFor(period));
  } catch (err) {
    return fail(err);
  }
}
