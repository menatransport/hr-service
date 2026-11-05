import type { NextRequest } from "next/server";

import { PeriodError, readPeriod } from "@/app/api/_lib/period";
import { badRequest, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { listApplicationsForApi } from "@/app/recruitment/_lib/applications";

/**
 * `GET /api/recruitment/applications?year=&month=` — ใบสมัคร (ใหม่สุดก่อน) พร้อมคำตอบในฟอร์ม
 *
 * ไม่ส่งช่วง = ทุกใบ · `?year=2026` / `?year=2569&month=10` / `?month=2026-10`
 * = **ทุกใบ** ที่ส่งเข้ามาในช่วงนั้นตามเวลาไทย (ดู `readPeriod()`)
 * · แต่ละแถว = `ApplicationSummary` + ข้อมูลชุดเดียวกับไฟล์ Excel หน้าผู้สมัคร (`listApplicationsForApi()`)
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    if (!(await editor())) return unauthorized();
    const period = readPeriod(request.nextUrl.searchParams);
    const res = ok(await listApplicationsForApi(period ?? undefined));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    if (err instanceof PeriodError) return badRequest(err.message);
    return failRecruitment(err);
  }
}
