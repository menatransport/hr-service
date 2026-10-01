import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { deleteDocSlot, updateDocSlot } from "@/app/recruitment/_lib/doc-slots";

/**
 * `PATCH  /api/recruitment/doc-slots/[id]` — แก้ชื่อ คำอธิบาย แสดง/บังคับ ของเอกสารหนึ่งช่อง
 * `DELETE /api/recruitment/doc-slots/[id]` — ลบออกจากคลัง (ช่องหลักของระบบลบไม่ได้)
 *
 * ทั้งสองเส้นคืนรายการทั้งชุด · ซ่อนแล้วเซิร์ฟเวอร์ปรับเป็นไม่บังคับให้เอง
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    const { id } = await params;
    return ok(await updateDocSlot(id, await readBody(request), who));
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
    return ok(await deleteDocSlot(id));
  } catch (err) {
    return failRecruitment(err);
  }
}
