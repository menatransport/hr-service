import { NextResponse, type NextRequest } from "next/server";

import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { revokeApiKey } from "@/lib/auth/api-keys";

/** `DELETE /api/api-keys/{id}` — ยกเลิก key ของตัวเอง (ไม่ลบแถว เก็บ `revokedAt`) */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const { id } = await ctx.params;
    if (!(await revokeApiKey(user.employeeId, id))) {
      return NextResponse.json({ error: "ไม่พบ key นี้ หรือถูกยกเลิกไปแล้ว" }, { status: 404 });
    }
    return ok({ revoked: true });
  } catch (err) {
    return fail(err);
  }
}
