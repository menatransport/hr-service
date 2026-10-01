import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { todayInBangkok } from "@/lib/record-case-flow";
import { getDriver } from "@/app/recruitment/_lib/drivers/registry";
import { toWorkDto } from "@/app/recruitment/_lib/drivers/api";

/**
 * `GET /api/drivers/{drivercode}/work?from=YYYY-MM-DD&to=YYYY-MM-DD`
 * — สถานะการทำงานรายวันและจำนวนวันทำงานรายเดือนของ พจส. หนึ่งคน
 *
 * แยกจาก `GET /api/drivers/{drivercode}` เพราะเป็นข้อมูลก้อนใหญ่ที่คนเรียกประวัติส่วนใหญ่
 * ไม่ต้องใช้ · ไม่ส่งช่วงวันที่ = 12 เดือนล่าสุดถึงวันนี้ · ช่วงยาวสุด 3 ปี
 *
 * รวมสองแหล่ง: ATMS (`Boom_ETL`) เป็นหลักเพราะผูกกับค่าแรง · ที่ฝ่ายบุคคลกรอกเอง
 * (`trainee_daily`) ใช้เฉพาะวันที่ ATMS ไม่มี — ทุกแถวบอก `source` ว่ามาจากไหน
 */

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366 * 3;

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const today = todayInBangkok();
    const q = request.nextUrl.searchParams;
    const to = q.get("to") || today;
    const from = q.get("from") || `${Number(to.slice(0, 4)) - 1}${to.slice(4, 8)}01`;

    if (!ISO.test(from) || !ISO.test(to)) return badRequest("from / to ต้องอยู่ในรูป YYYY-MM-DD");
    if (from > to) return badRequest("from ต้องไม่อยู่หลัง to");
    if (dayNumber(to) - dayNumber(from) > MAX_DAYS) return badRequest("ช่วงวันที่ยาวเกิน 3 ปี");

    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);
    const driver = await getDriver(drivercode);

    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    const res = ok(toWorkDto(driver, from, to));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}
