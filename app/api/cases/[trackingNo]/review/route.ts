import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { buildDirectory, toHrCase } from "@/lib/ncac/adapt";
import { getComplaint, listUsers, reviewComplaint } from "@/lib/ncac/client";
import type { ReviewAction } from "@/lib/ncac/types";

/**
 * `POST /api/cases/{trackingNo}/review` — อนุมัติ / ปฏิเสธแผนแก้ไข
 *
 * ระบบเดิมบังคับให้ใส่หมายเหตุทุกครั้ง กฎนี้ถูกยกมาไว้ที่นี่ด้วย
 * เพื่อไม่ให้เลี่ยงได้ด้วยการยิง API ตรง
 *
 * **ผู้ตรวจสอบมาจากคุกกี้ session เท่านั้น** ไม่ใช่จาก body — ชื่อคนอนุมัติถูกบันทึก
 * ลง `complaint_reviews` / `complaint_logs` ของ NCAC ถ้าเชื่อค่าที่ client ส่งมา
 * ใครยิง API ตรงก็อนุมัติในนามคนอื่นได้
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]/review">,
) {
  try {
    const { trackingNo } = await ctx.params;
    const id = decodeURIComponent(trackingNo);
    const body = (await request.json()) as {
      action?: string;
      remark?: string;
    };

    const action = body.action as ReviewAction | undefined;
    if (action !== "approve" && action !== "reject") {
      return badRequest("action ต้องเป็น approve หรือ reject");
    }
    if (!body.remark?.trim()) return badRequest("ต้องระบุหมายเหตุ");

    const reviewer = await getActorEmployeeId();
    await reviewComplaint(id, action, reviewer, body.remark.trim());

    const [complaint, users] = await Promise.all([
      getComplaint(id),
      listUsers().catch(() => []),
    ]);
    return ok(toHrCase(complaint, buildDirectory(users)));
  } catch (err) {
    return fail(err);
  }
}
