import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { buildTraineeReport } from "@/app/recruitment/_lib/drivers/trainee-report";

/**
 * `GET /api/recruitment/trainee-report?date=YYYY-MM-DD` — ข้อความรายงานสถานะฝึกงานประจำวัน (RC Alert)
 * พร้อมคัดลอกส่งไลน์ · ปุ่มคัดลอกบนหน้าผู้สมัคร (กรองฝึกงาน) ยิงตอนเปิดกล่อง/เปลี่ยนวัน
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) return unauthorized();
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest("วันที่ไม่ถูกต้อง");
    return ok({ date, text: await buildTraineeReport(date) });
  } catch (err) {
    return fail(err);
  }
}
