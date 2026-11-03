import type { NextRequest } from "next/server";

import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getRoomStays, updateRoom } from "@/lib/rentals/store";

import { handle } from "../../_respond";

export const dynamic = "force-dynamic";

/** `GET /api/rentals/rooms/{id}` — ประวัติการเข้าพักทั้งหมดของห้อง (ใหม่ก่อน) · `proxy.ts` ไม่กัน GET จึงตรวจล็อกอินเอง */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/rentals/rooms/[id]">) {
  try {
    if (!(await readSessionUser())) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const { id } = await ctx.params;
    return ok(await getRoomStays(id));
  } catch (err) {
    return fail(err);
  }
}

/** `PATCH /api/rentals/rooms/{id}` — `action`: `edit` (ค่าตั้งต้น) · `cancel` · `reopen` */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/rentals/rooms/[id]">) {
  const { id } = await ctx.params;
  return handle(request, (body, actor) => updateRoom(id, body, actor));
}
