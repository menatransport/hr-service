import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { deleteCategory, updateCategory } from "@/app/recruitment/_lib/resign-reasons/store";

/**
 * `PATCH  /api/recruitment/resign-reasons/categories/[id]` — แก้ชื่อหมวด / ประเภทการออกตั้งต้น
 * `DELETE /api/recruitment/resign-reasons/categories/[id]` — ลบได้เฉพาะหมวดที่ไม่มีรหัสเหลือ
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    const { id } = await params;
    return ok(await updateCategory(id, await readBody(request), who));
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
    await deleteCategory(id);
    return ok({ deleted: true });
  } catch (err) {
    return failRecruitment(err);
  }
}
