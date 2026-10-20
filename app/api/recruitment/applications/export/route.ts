import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { exportApplicationForms } from "@/app/recruitment/_lib/applications";

/**
 * `POST /api/recruitment/applications/export` — คำตอบในฟอร์มสมัครของใบที่ขอ
 * สำหรับชีต “ข้อมูลใบสมัคร” ในไฟล์ Excel หน้าผู้สมัคร
 *
 * ```
 * { "ids": ["66f…", "66e…"] }   // ลำดับไม่มีผล — หน้าจอเรียงเองตามตาราง
 * ```
 *
 * `POST` เพราะ id 500 ใบยาวเกิน query string · ตอบเป็นข้อความที่แปลงแล้ว (`exportApplicationForms()`)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 2_000;

export async function POST(request: NextRequest) {
  try {
    if (!(await editor())) return unauthorized();

    const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((v): v is string => typeof v === "string") : [];
    if (!ids.length) return badRequest("ไม่มีใบสมัครให้ส่งออก");
    if (ids.length > MAX_IDS) return badRequest("ใบสมัครมากเกินไป");

    return ok(await exportApplicationForms(ids));
  } catch (err) {
    return failRecruitment(err);
  }
}
