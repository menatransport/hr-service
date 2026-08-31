import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failCategory } from "@/app/api/record-categories/_lib";
import { createRecordCategory, listRecordCategories } from "@/lib/record-categories";

/**
 * `GET  /api/record-categories` — รายการประเภทเคสทั้งหมด (เรียงตามลำดับที่สร้าง)
 * `POST /api/record-categories` — เพิ่มประเภทใหม่ `{ label }`
 *
 * เขียนได้เฉพาะคนที่ล็อกอินอยู่แล้ว — `proxy.ts` ตอบ 401 ให้ทุกคำสั่งเขียนใต้ `/api/**`
 * อยู่ก่อนแล้ว ไม่ต้องเช็กซ้ำที่นี่ · ไม่ต้องรู้ว่าใครเป็นคนทำเพราะประเภทเคสเป็น
 * master data ไม่ใช่เอกสารที่ต้องมีประวัติผู้แก้เหมือนตัวเคส
 */

export async function GET() {
  try {
    return ok(await listRecordCategories());
  } catch (err) {
    return failCategory(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(await createRecordCategory(body.label));
  } catch (err) {
    return failCategory(err);
  }
}
