import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { canPassIntake, HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { lockPeriod, listPeriods, openPeriod } from "@/lib/payroll/periods";

/**
 * รอบจ่ายที่เปิด/ปิด
 *
 * - `GET /api/payroll/periods` — รายการสถานะทุกรอบ (ใครที่ล็อกอินแล้วก็ดูได้
 *   เพราะหน้าจอทุกฝ่ายต้องรู้ว่ารอบไหนส่งของได้ · ไม่มีข้อมูลเงินในนี้)
 * - `POST /api/payroll/periods` body `{ period, action: "open" | "lock", note? }`
 *   — **เฉพาะค่าจ้างและสวัสดิการ** เพราะ "รอบไหนเปิด" คือการตัดสินใจของคนทำเงินเดือน
 *
 * เส้นนี้คือสิ่งที่ทำให้ **เปิดรอบใหม่ได้โดยไม่ต้อง deploy** — ของเดิมรอบที่เปิดอยู่
 * เป็นค่าคงที่ในโค้ด ทุกเดือนต้องแก้โค้ดก่อน ฝ่ายถึงจะส่งของเข้ารอบใหม่ได้
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET() {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }
    return ok({ periods: await listPeriods() });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const identity = await getDeskIdentity();
    if (!canPassIntake(identity)) {
      return forbidden(
        `เปิด/ปิดรอบได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${identity.department || "หน่วยงานที่ไม่ระบุ"}`,
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const period = typeof body.period === "string" ? body.period.trim() : "";
    if (!PERIOD_RE.test(period)) {
      return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-10");
    }
    const note = typeof body.note === "string" ? body.note : undefined;

    if (body.action === "open") {
      return ok({ period: await openPeriod(period, identity.name, note) });
    }
    if (body.action === "lock") {
      return ok({ period: await lockPeriod(period, identity.name, note) });
    }
    return badRequest('ระบุ action เป็น "open" หรือ "lock"');
  } catch (err) {
    return fail(err);
  }
}
