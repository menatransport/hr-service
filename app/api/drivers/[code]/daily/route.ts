import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { DriverRegistryError, setTraineeDaily } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `PUT /api/drivers/{drivercode}/daily` — บันทึกสถานะรายวันที่ฝ่ายบุคคลกรอกเอง
 *
 * ```
 * { "dateISO": "2026-09-21", "code": "ฝ", "note": "" }
 * { "dateISO": "2026-09-21", "code": "" }      ← ลบบันทึกของวันนั้นทิ้ง
 * ```
 *
 * เขียนลง `hr_service.trainee_daily` เท่านั้น — **ไม่แตะ `Boom_ETL`** ที่เป็นต้นทาง
 * ของ ATMS · ของที่กรอกที่นี่คือบันทึกของฝ่ายบุคคล ไม่ใช่การแก้ข้อมูลค่าแรง
 * (เหตุผลเต็มอยู่ที่ `setTraineeDaily()` ใน `_lib/drivers/registry.ts`)
 *
 * **เส้นนี้ยิงถี่กว่าเส้นอื่นในระบบ** — หน้าติดตามฝึกงานยิงหนึ่งครั้งต่อหนึ่งการเลือก
 * ในดรอปดาวน์ จึงตั้งใจให้ทำทีละคนทีละวัน คืน entry เดียวกลับไป ไม่ต้องอ่าน
 * ทะเบียนทั้งชุดกลับมาเหมือน `PUT …/status` (หน้าจอเก็บ state ของตัวเองอยู่แล้ว)
 *
 * ผู้บันทึกมาจาก session ฝั่งเซิร์ฟเวอร์เสมอ **ไม่รับจาก client**
 */

/** หมายเหตุสั้น ๆ พอให้รู้บริบทของวันนั้น ไม่ใช่ที่เขียนรายงาน (เท่ากับเส้น `status`) */
const MAX_NOTE = 500;

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/drivers/[code]/daily">) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const body = (await request.json().catch(() => null)) as {
      dateISO?: unknown;
      code?: unknown;
      note?: unknown;
    } | null;

    if (!body) return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");
    if (typeof body.dateISO !== "string") return badRequest("ต้องระบุวันที่");
    if (typeof body.code !== "string") return badRequest("ต้องระบุรหัสสถานะ");

    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > MAX_NOTE) return badRequest(`หมายเหตุยาวเกิน ${MAX_NOTE} ตัวอักษร`);

    const entry = await setTraineeDaily(
      drivercode,
      { dateISO: body.dateISO, code: body.code, note },
      await getActorEmployeeId(),
    );

    // ลบสำเร็จก็คืน `entry: null` — ต่างจาก 404 ที่แปลว่าไม่มีรหัสนี้ในทะเบียน
    if (!entry && body.code.trim()) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    return ok({ dateISO: body.dateISO, entry });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
