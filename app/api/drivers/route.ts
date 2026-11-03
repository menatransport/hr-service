import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { addDriverManually, DriverRegistryError, type ManualDriverInput } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `POST /api/drivers` — เพิ่ม พจร. เข้าทะเบียน (ปุ่ม “เพิ่ม พจร.” บนหน้าทะเบียน)
 *
 * ```
 * { "drivercode": "690800", "driverName": "สมชาย ใจดี", "branch": "2", "startDate": "2026-11-03", "phone": "0812345678" }
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

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");

    const drivercode = await addDriverManually(body as ManualDriverInput, user.name || user.employeeId);
    return ok({ drivercode });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
