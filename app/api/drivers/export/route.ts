import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getDriversForExport } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `POST /api/drivers/export` — ทะเบียนเต็มของรหัสที่ขอ สำหรับชีต “ทะเบียนเต็ม” ในไฟล์ Excel หน้าทะเบียน พจส.
 *
 * ```
 * { "codes": ["072025", "092093"] }   // ลำดับ = ลำดับในตารางที่เห็นอยู่
 * ```
 *
 * เป็น `POST` เพราะรหัสทั้งทะเบียน (~1,000 ตัว) ยาวเกิน query string · ตรวจล็อกอินซ้ำเอง (มีเลขบัตร/บัญชี)
 * · พ้นสภาพแล้ว = ข้อมูลส่วนบุคคลถูกล้างตามกติกาเดียวกับหน้าประวัติ (`getDriversForExport()`)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CODES = 5_000;

export async function POST(request: NextRequest) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");

    const body = (await request.json().catch(() => null)) as { codes?: unknown } | null;
    const codes = Array.isArray(body?.codes) ? body.codes.filter((c): c is string => typeof c === "string") : [];
    if (!codes.length) return badRequest("ไม่มีรายชื่อให้ส่งออก");
    if (codes.length > MAX_CODES) return badRequest("รายชื่อมากเกินไป");

    return ok(await getDriversForExport(codes));
  } catch (err) {
    return fail(err);
  }
}
