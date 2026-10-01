import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { createDocSlot, listDocSlots } from "@/app/recruitment/_lib/doc-slots";

/**
 * `GET  /api/recruitment/doc-slots` — คลังเอกสารแนบทั้งหมด รวมช่องที่ซ่อน
 * `POST /api/recruitment/doc-slots` — เพิ่มเอกสารใหม่ (ต่อท้ายเสมอ) คืนรายการทั้งชุด
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listDocSlots());
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    return ok(await createDocSlot(await readBody(request), who));
  } catch (err) {
    return failRecruitment(err);
  }
}
