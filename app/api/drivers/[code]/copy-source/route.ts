import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getDriverCopySource } from "@/app/recruitment/_lib/drivers/registry";
import { registryWriteDenied } from "@/app/api/drivers/_lib/guard";

/**
 * `GET /api/drivers/{drivercode}/copy-source` — ปุ่ม “ตรวจสอบ” ในกล่องเพิ่มพนักงาน: ข้อมูลของรหัสเดิม
 * ที่จะคัดลอกไปรหัสใหม่ (คนย้ายประเภท = ปิดรหัสเก่า เปิดรหัสใหม่) · รูปตอบดู `DriverCopySource`
 *
 * **มีข้อมูลส่วนบุคคลของคนพ้นสภาพ** (ที่ `GET /api/drivers/{drivercode}` ล้างทิ้ง) — จึงเปิดเฉพาะคนที่
 * เพิ่มพนักงานได้ (`registryWriteDenied`) และไม่ให้แคช
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    if (!(await readSessionUser())) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const denied = await registryWriteDenied();
    if (denied) return denied;

    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);
    const source = await getDriverCopySource(drivercode);
    if (!source) return NextResponse.json({ error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` }, { status: 404 });

    const res = ok(source);
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}
