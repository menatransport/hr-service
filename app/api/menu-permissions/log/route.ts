import { NextResponse, type NextRequest } from "next/server";

import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenu, listMenuPermissionLog } from "@/lib/menu-permissions";

/**
 * `GET /api/menu-permissions/log?limit=` — ประวัติการเปลี่ยนสิทธิ์เมนู ใหม่สุดก่อน (สูงสุด 500)
 * มีชื่อคนแก้อยู่ในแถว — `proxy.ts` ไม่กั้น `GET` จึงเช็กล็อกอินเองที่นี่
 */
export async function GET(request: NextRequest) {
  if (!(await readSessionUser())) return unauthorized("กรุณาเข้าสู่ระบบก่อน");
  if (!(await canAccessMenu("permissions"))) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูประวัติสิทธิ์" }, { status: 403 });
  }
  try {
    const limit = Number(request.nextUrl.searchParams.get("limit")) || 200;
    return ok(await listMenuPermissionLog(limit));
  } catch (err) {
    return fail(err);
  }
}
