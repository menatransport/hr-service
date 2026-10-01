import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import {
  DriverRegistryError,
  setDriverIdCardExpiry,
} from "@/app/recruitment/_lib/drivers/registry";

/**
 * `PUT /api/drivers/{drivercode}/id-card-expiry` — บันทึกวันหมดอายุบัตรประชาชน
 *
 * ```
 * { "dateISO": "2031-04-18" }   ← บันทึก
 * { "dateISO": "" }             ← ลบวันที่ที่กรอกไว้ทิ้ง
 * ```
 *
 * **ไม่มีปลายทางคู่ขนานสำหรับใบขับขี่โดยตั้งใจ** — วันหมดอายุใบขับขี่มาจาก
 * `Boom_ETL.main_driver` ซึ่ง sync ทับทุกรอบ ต้องไปแก้ที่ระบบต้นทาง
 * (เหตุผลเต็มอยู่ที่ `setDriverIdCardExpiry()`)
 *
 * ผู้บันทึกมาจาก session ฝั่งเซิร์ฟเวอร์เสมอ **ไม่รับจาก client** — กติกาเดียวกับ
 * ทุก route ที่เขียนลงทะเบียนประวัติ
 */
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/id-card-expiry">,
) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const body = (await request.json().catch(() => null)) as { dateISO?: unknown } | null;
    if (!body) return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");

    if (typeof body.dateISO !== "string") return badRequest("ต้องส่ง dateISO มาเป็นข้อความ");

    const driver = await setDriverIdCardExpiry(
      drivercode,
      body.dateISO,
      await getActorEmployeeId(),
    );

    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    return ok({
      idCardExpiryISO: driver.idCardExpiryISO,
      idCardDaysLeft: driver.idCardDaysLeft,
    });
  } catch (err) {
    // วันที่อ่านไม่ออก = ความผิดของคำขอ ไม่ใช่ของเซิร์ฟเวอร์
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
