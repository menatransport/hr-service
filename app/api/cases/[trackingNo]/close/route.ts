import type { NextRequest } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { buildDirectory, toHrCase } from "@/lib/ncac/adapt";
import { closeComplaint, getComplaint, listUsers } from "@/lib/ncac/client";

/**
 * `POST /api/cases/{trackingNo}/close` — ปิดเคสหลังอนุมัติครบ
 *
 * ผู้ปิดเคสมาจาก session (ไม่ใช่ body) — รหัสนี้ลงใน `complaint_logs` ซึ่งมี FK
 * ไป `users.employee_id` รหัสที่ไม่มีจริงจะทำให้ทั้ง transaction ล้ม
 */
export async function POST(
  _request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]/close">,
) {
  try {
    const { trackingNo } = await ctx.params;
    const id = decodeURIComponent(trackingNo);

    await closeComplaint(id, await getActorEmployeeId());

    const [complaint, users] = await Promise.all([
      getComplaint(id),
      listUsers().catch(() => []),
    ]);
    return ok(toHrCase(complaint, buildDirectory(users)));
  } catch (err) {
    return fail(err);
  }
}
