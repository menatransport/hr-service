import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { reorderDocSlots } from "@/app/recruitment/_lib/doc-slots";

/**
 * `POST /api/recruitment/doc-slots/reorder` — จัดลำดับเอกสารใหม่หลังลากวาง
 * รับ `{ ids: string[] }` ทั้งชุดตามลำดับที่ต้องการ (ทรงเดียวกับ `questions/reorder`)
 */

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const body = await readBody(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((v): v is string => typeof v === "string")
      : [];

    return ok(await reorderDocSlots(ids, who));
  } catch (err) {
    return failRecruitment(err);
  }
}
