import type { NextRequest } from "next/server";

import { PeriodError, readPeriod } from "@/app/api/_lib/period";
import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import {
  addDriverManually,
  DriverRegistryError,
  getDriversForApi,
  type ManualDriverInput,
} from "@/app/recruitment/_lib/drivers/registry";
import { toDriverListItemDto } from "@/app/recruitment/_lib/drivers/api";
import { registryWriteDenied } from "@/app/api/drivers/_lib/guard";

/**
 * `GET /api/drivers?year=&month=` — ทะเบียน พจส. ทั้งหมด (เรียงตามรหัส) · กรองตามวันเริ่มงานได้
 *
 * `?year=2026` ทั้งปี · `?year=2569&month=10` หรือ `?month=2026-10` รายเดือน (ดู `readPeriod()`)
 * แต่ละแถวรูปเดียวกับ `GET /api/drivers/{drivercode}` ไม่มี `documents` · พ้นสภาพแล้วข้อมูลส่วนบุคคลเป็น `null`
 *
 * **บังคับล็อกอินเอง** — `proxy.ts` ปล่อย `GET` ผ่าน และเส้นนี้มีข้อมูลส่วนบุคคลทั้งทะเบียน
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const period = readPeriod(request.nextUrl.searchParams);
    const rows = await getDriversForApi(period);

    const res = ok(rows.map(toDriverListItemDto));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    if (err instanceof PeriodError) return badRequest(err.message);
    return fail(err);
  }
}

/**
 * `POST /api/drivers` — เพิ่ม พจส./พจร. เข้าทะเบียน (ปุ่ม “เพิ่มพนักงาน” บนหน้าทะเบียน)
 *
 * ```
 * { "ownerType": "1", "drivercode": "690800", "driverName": "สมชาย ใจดี", "branch": "2", "startDate": "2026-11-03", "phone": "0812345678", "note": "ย้ายมาจากสาขาบางปะกง" }
 * ```
 *
 * ช่องและกติกาอยู่ที่ `addDriverManually()` · เอกสารอัปโหลดทีหลังบนหน้าประวัติ · ตอบ `{ drivercode }`
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const denied = await registryWriteDenied();
    if (denied) return denied;


    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");

    const drivercode = await addDriverManually(body as ManualDriverInput, user.name || user.employeeId);
    return ok({ drivercode });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
