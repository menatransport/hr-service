import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { deleteQuestion, updateQuestion } from "@/app/recruitment/_lib/questions";

/**
 * `PATCH  /api/recruitment/questions/[id]` — แก้คำถามหนึ่งข้อ
 * `DELETE /api/recruitment/questions/[id]` — ลบคำถามออกจากคลัง
 *
 * `key` ที่ส่งมากับ `PATCH` **ถูกทิ้งเสมอ** — คำตอบเก่าอ้างกุญแจนี้อยู่
 * (ดูเหตุผลเต็มที่หัวไฟล์ `lib/recruitment/questions.ts`)
 *
 * การลบถูกปฏิเสธเมื่อเป็นคำถามหลักของระบบ หรือมีคำถามอื่นตั้งเงื่อนไขอ้างข้อนี้อยู่
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    const { id } = await params;
    return ok(await updateQuestion(id, await readBody(request), who));
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;
    await deleteQuestion(id);
    return ok({ deleted: true });
  } catch (err) {
    return failRecruitment(err);
  }
}
