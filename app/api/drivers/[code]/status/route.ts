import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { DriverRegistryError, setDriverStatus } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `PUT /api/drivers/{drivercode}/status` — บันทึกสถานะการจ้างของ พจส.
 *
 * ```
 * { "status": "resigned", "resignDate": "2026-09-16",
 *   "reasonCode": "P4", "exitType": "vol", "note": "" }
 * { "status": "active" }
 * ```
 *
 * เขียนลง `hr_service.master_driver` เท่านั้น — **ไม่แตะ `Boom_ETL` และไม่แตะ
 * ฟิลด์ `active` ที่ ETL เป็นเจ้าของ** ค่าที่กดไปอยู่ที่ `statusOverride`
 * แล้วทับตอนอ่าน (ดู `lib/drivers/registry.ts`)
 *
 * ผู้บันทึกมาจาก session ฝั่งเซิร์ฟเวอร์เสมอ **ไม่รับจาก client** — ไม่งั้นใครยิง
 * API ตรงก็อ้างเป็นคนอื่นได้
 */

/** กันหมายเหตุยาวผิดปกติ — ช่องนี้ไว้เขียนบริบทสั้น ๆ ไม่ใช่เก็บรายงานทั้งฉบับ */
const MAX_NOTE = 500;

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/status">,
) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      resignDate?: unknown;
      reasonCode?: unknown;
      exitType?: unknown;
      note?: unknown;
      confirm?: unknown;
    } | null;

    if (!body) return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");

    const status = body.status;
    if (status !== "active" && status !== "resigned") {
      return badRequest("สถานะต้องเป็น active หรือ resigned เท่านั้น");
    }

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_NOTE) return badRequest(`หมายเหตุยาวเกิน ${MAX_NOTE} ตัวอักษร`);

    const driver = await setDriverStatus(
      drivercode,
      {
        status,
        resignDate: typeof body.resignDate === "string" ? body.resignDate : undefined,
        reasonCode: typeof body.reasonCode === "string" ? body.reasonCode : undefined,
        exitType: typeof body.exitType === "string" ? body.exitType : undefined,
        note,
        confirmWorking: body.confirm === true,
      },
      await getActorEmployeeId(),
    );

    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    return ok({
      active: driver.active,
      statusOverride: driver.statusOverride,
      resignation: driver.resignation,
    });
  } catch (err) {
    // ข้อมูลที่กรอกไม่ผ่านเกณฑ์ = ความผิดของคำขอ ไม่ใช่ของเซิร์ฟเวอร์
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
