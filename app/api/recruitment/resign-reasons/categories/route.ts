import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { createCategory } from "@/app/recruitment/_lib/resign-reasons/store";

/** `POST /api/recruitment/resign-reasons/categories` — เพิ่มหมวดใหญ่ (อักษรนำ + ชื่อ + ประเภทการออก) */
export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();
    return ok(await createCategory(await readBody(request), who));
  } catch (err) {
    return failRecruitment(err);
  }
}
