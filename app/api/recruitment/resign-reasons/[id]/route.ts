import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { deleteReason, updateReason } from "@/app/recruitment/_lib/resign-reasons/store";

/**
 * `PATCH  /api/recruitment/resign-reasons/[id]` — แก้ข้อความ/หมวด/ประเภทการออก/เปิด-ปิดใช้
 * `DELETE /api/recruitment/resign-reasons/[id]` — ลบรหัส (ระเบียนเก่าเก็บสำเนาป้ายไว้แล้ว)
 *
 * `code` ที่ส่งมากับ `PATCH` ถูกทิ้งเสมอ — รหัสแก้ไม่ได้หลังสร้าง
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    const { id } = await params;
    return ok(await updateReason(id, await readBody(request), who));
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
    await deleteReason(id);
    return ok({ deleted: true });
  } catch (err) {
    return failRecruitment(err);
  }
}
