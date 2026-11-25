import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { canExportResignedPhone } from "@/lib/auth/resigned-phone-export";
import { exitInterviewDenied } from "@/app/api/drivers/_lib/exit-guard";
import { getDataLogRows } from "@/app/recruitment/_lib/exit-interview/store";

/**
 * `POST /api/drivers/exit-interviews/export` `{ codes: [...] }` — แถว DataLog (47 คอลัมน์ตามไฟล์ต้นฉบับ)
 * ของคนพ้นสภาพที่เห็นอยู่ในตาราง · สิทธิ์ `exit-interview` แบบ fail-closed
 * · เบอร์โทรตามกติกาเดียวกับ `/api/drivers/resigned` (`canExportResignedPhone()`)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CODES = 5_000;

export async function POST(request: NextRequest) {
  try {
    const denied = await exitInterviewDenied();
    if (denied) return denied;
    const user = await readSessionUser();
    const body = (await request.json().catch(() => null)) as { codes?: unknown } | null;
    const codes = Array.isArray(body?.codes) ? body.codes.filter((c): c is string => typeof c === "string") : [];
    if (!codes.length) return badRequest("ไม่มีรายชื่อให้ส่งออก");
    if (codes.length > MAX_CODES) return badRequest("รายชื่อมากเกินไป");
    return ok(await getDataLogRows(codes, Boolean(user && canExportResignedPhone(user))));
  } catch (err) {
    return fail(err);
  }
}
