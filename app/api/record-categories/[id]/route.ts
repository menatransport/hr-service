import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failCategory } from "@/app/api/record-categories/_lib";
import { deleteRecordCategory, updateRecordCategory } from "@/lib/record-categories";

/**
 * `PUT    /api/record-categories/{id}` — แก้ไขชื่อประเภท `{ label }`
 * `DELETE /api/record-categories/{id}` — ลบประเภทนี้ (เคสเก่าที่อ้างถึงอยู่ไม่ถูกแก้ตาม —
 * ดูเหตุผลที่ `lib/record-categories.ts`)
 */

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(await updateRecordCategory(id, body.label));
  } catch (err) {
    return failCategory(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await deleteRecordCategory(id);
    return ok({ ok: true });
  } catch (err) {
    return failCategory(err);
  }
}
