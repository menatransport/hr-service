import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { exitInterviewDenied } from "@/app/api/drivers/_lib/exit-guard";
import {
  ExitInterviewError,
  getExitInterview,
  saveExitInterview,
  type SaveInput,
} from "@/app/recruitment/_lib/exit-interview/store";

/**
 * `GET /api/drivers/{drivercode}/exit-interview` — ข้อมูลอ้างอิงจากทะเบียน + คำตอบ + สถานะ
 * `PUT` — บันทึกทั้งชุด `{ reference, contacts, outcome, wave1, wave2, income, safetyFlag, codes: { primary, secondary } }`
 * แล้วซิงก์รหัสสาเหตุลง `master_driver.resignation` (ดู `saveExitInterview()`)
 *
 * สิทธิ์ `exit-interview` แบบ fail-closed · ผู้บันทึกมาจาก session เสมอ
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorOf(err: unknown) {
  if (err instanceof ExitInterviewError)
    return err.status === 404 ? NextResponse.json({ error: err.message }, { status: 404 }) : badRequest(err.message);
  return fail(err);
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/drivers/[code]/exit-interview">) {
  try {
    const denied = await exitInterviewDenied();
    if (denied) return denied;
    const { code } = await ctx.params;
    const res = ok(await getExitInterview(decodeURIComponent(code)));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return errorOf(err);
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/drivers/[code]/exit-interview">) {
  try {
    const denied = await exitInterviewDenied();
    if (denied) return denied;
    const { code } = await ctx.params;
    const body = (await request.json().catch(() => null)) as SaveInput | null;
    if (!body || typeof body !== "object") return badRequest("อ่านข้อมูลที่ส่งมาไม่ได้");
    return ok(await saveExitInterview(decodeURIComponent(code), body, await getActorEmployeeId()));
  } catch (err) {
    return errorOf(err);
  }
}
