import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { createReason, getResignMaster } from "@/app/recruitment/_lib/resign-reasons/store";

/**
 * `GET  /api/recruitment/resign-reasons` — Reason Code Master ทั้งชุด (หมวด + รหัส รวมที่ปิดใช้)
 * `POST /api/recruitment/resign-reasons` — เพิ่มรหัสใหม่ · ไม่ส่ง `code` = ได้เลขถัดไปของหมวด
 *
 * ผู้ใช้สามที่: หน้าตั้งค่า · ฟอร์มพ้นสภาพในทะเบียน พจส. · ฟอร์มขอสรรหา
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await getResignMaster());
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    return ok(await createReason(await readBody(request), who));
  } catch (err) {
    return failRecruitment(err);
  }
}
