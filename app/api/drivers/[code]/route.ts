import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { getActorEmployeeId, readSessionUser } from "@/lib/auth/session";
import {
  DriverRegistryError,
  getDriverProfile,
  updateDriverProfile,
} from "@/app/recruitment/_lib/drivers/registry";
import { toDriverDto } from "@/app/recruitment/_lib/drivers/api";

/**
 * `GET /api/drivers/{drivercode}` — ประวัติ พจส. หนึ่งคน (เส้นเดียวของทะเบียนรายคน)
 *
 * อ่านผ่าน `getDriverProfile()` ตัวเดียวกับหน้า `/recruitment/admin/drivers/{code}`
 * แล้วแปลงเป็นรูปสาธารณะ `DriverDto` (`_lib/drivers/api.ts`) — ข้อมูลตัวตน การจ้าง
 * ติดต่อ ใบขับขี่/บัตร รถ การพ้นสภาพ สรุปสถานะล่าสุด และรายการเอกสาร
 * · สถานะรายวัน/รายเดือนแยกไปที่ `GET /api/drivers/{drivercode}/work`
 * · คนที่พ้นสภาพแล้ว `contact` `license` `idCard` เป็น `null` (`personalHidden: true`)
 *
 * **บังคับล็อกอินเอง** เพราะ `proxy.ts` ปล่อย `GET` ใต้ `/api/**` ผ่านหมด และเส้นนี้
 * มีข้อมูลส่วนบุคคล · `Cache-Control: private, no-store` กันพร็อกซีระหว่างทางเก็บสำเนา
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);
    const driver = await getDriverProfile(drivercode);

    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    const res = ok(toDriverDto(driver));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}

/**
 * `PATCH /api/drivers/{drivercode}` — แก้ประวัติ ส่งเฉพาะช่องที่เปลี่ยน
 *
 * ```
 * { "phone": "0812345678", "emergencyContactName": "สมใจ ใจดี", "bankAccountNo": "1234567890" }
 * ```
 *
 * ช่องที่แก้ได้และกติกาค่าอยู่ที่ `DRIVER_EDIT_FIELDS` / `normalizeDriverEdit()` · ช่องผิดหรือค่าใช้ไม่ได้
 * = 400 ทั้งก้อน · ผู้แก้มาจาก session เสมอ · ตอบเป็นประวัติแบบเดียวกับ `GET`
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");
    }

    const driver = await updateDriverProfile(
      drivercode,
      body as Record<string, unknown>,
      await getActorEmployeeId(),
    );
    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    const profile = await getDriverProfile(drivercode);
    return ok(profile ? toDriverDto(profile) : null);
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
