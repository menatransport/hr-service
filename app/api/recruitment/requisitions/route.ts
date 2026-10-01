import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { readBody, unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { readSessionUser } from "@/lib/auth/session";
import {
  createRequisitions,
  listRequisitions,
} from "@/app/recruitment/_lib/requisitions/store";

/**
 * `GET  /api/recruitment/requisitions` — คำขอสรรหาทั้งหมด (สูงสุด 500 ใบล่าสุด)
 * `POST /api/recruitment/requisitions` — แจ้งอัตราใหม่ · `headcount > 1` สร้างหลายใบ
 *
 * **ผู้แจ้งมาจาก session เท่านั้น ไม่รับจาก body** — ประวัติของคำขอเป็นหลักฐาน
 * ว่าใครขออัตรานี้ ถ้ารับจาก body ก็ลงชื่อเป็นคนอื่นได้ (กฎเดียวกับทั้งระบบ)
 */

export async function GET() {
  try {
    if (!(await readSessionUser())) return unauthorized();
    return ok(await listRequisitions());
  } catch (err) {
    return failRequisition(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized();

    const body = await readBody(request);
    const created = await createRequisitions(body as never, {
      employeeId: user.employeeId,
      name: user.name || user.employeeId,
    });
    return ok(created);
  } catch (err) {
    return failRequisition(err);
  }
}
