import { NextResponse, type NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { getCriminalRecord } from "@/app/recruitment/_lib/criminal-record";

/**
 * `GET /api/recruitment/criminal-record?name=…&site=…` — ผลตรวจประวัติอาชญากรรมของคนหนึ่งคน
 * จากชีต “สรุปรายชื่อตรวจประวัติ” (Apps Script · ดู `criminal-record.ts`)
 *
 * `site` = ชื่อสาขา ใช้เลือกฝ่ายในชีตที่ลองก่อน · ชีตล่ม/ตอบผิดรูป = 502 พร้อมสาเหตุ (ไม่แกล้งตอบว่าไม่พบ)
 */
export async function GET(request: NextRequest) {
  if (!(await readSessionUser())) return unauthorized();

  const name = request.nextUrl.searchParams.get("name")?.trim() ?? "";
  const site = request.nextUrl.searchParams.get("site")?.trim() ?? "";
  if (!name) return badRequest("กรุณาระบุ name");

  try {
    return ok(await getCriminalRecord(name, site));
  } catch (err) {
    const message =
      err instanceof Error && err.name !== "TimeoutError" && err.name !== "AbortError"
        ? err.message
        : "ชีตตรวจประวัติไม่ตอบภายในเวลา — ลองใหม่อีกครั้ง";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
