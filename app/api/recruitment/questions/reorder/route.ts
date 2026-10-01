import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { reorderQuestions } from "@/app/recruitment/_lib/questions";

/**
 * `POST /api/recruitment/questions/reorder` — จัดลำดับคำถามใหม่หลังลากวาง
 *
 * รับ `{ ids: string[] }` ของทั้งหมวดตามลำดับที่ต้องการ แล้วเขียน `order`
 * ใหม่ทีเดียวด้วย `bulkWrite` — ยิงทีละข้อจะทำให้ลำดับพังกลางทางถ้าเน็ตหลุด
 */

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const body = await readBody(request);
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((v): v is string => typeof v === "string")
      : [];

    return ok(await reorderQuestions(ids, who));
  } catch (err) {
    return failRecruitment(err);
  }
}
