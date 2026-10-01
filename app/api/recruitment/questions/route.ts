import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { createQuestion, listQuestions } from "@/app/recruitment/_lib/questions";

/**
 * `GET  /api/recruitment/questions` — คลังคำถามทั้งหมด รวมข้อที่ปิดใช้
 * `POST /api/recruitment/questions` — เพิ่มคำถามใหม่ (ต่อท้ายหมวดเสมอ)
 *
 * ทั้งสองเส้นสำหรับหน้าแอดมิน · ฟอร์มสาธารณะอ่านจาก
 * `/api/recruitment/public/questions` ซึ่งกรองเฉพาะข้อที่เปิดใช้ให้แล้ว
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listQuestions());
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    return ok(await createQuestion(await readBody(request), who));
  } catch (err) {
    return failRecruitment(err);
  }
}
