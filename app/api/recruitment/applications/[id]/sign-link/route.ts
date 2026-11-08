import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failRecruitment, hrActor, readBody, unauthorized } from "@/app/api/recruitment/_lib";
import {
  createSignLink,
  getSignLinkState,
  revokeSignLink,
} from "@/app/recruitment/_lib/sign-link-store";

/**
 * ลิงก์ให้ผู้สมัครเซ็นเอง (กล่องทำเอกสาร → “ลิงก์ให้ผู้สมัครเซ็น”) — กติกาที่ `sign-links.ts`
 *
 * - `GET` ลิงก์ที่ใช้ได้อยู่ (ถ้ามี) + ฉบับที่ผู้สมัครเซ็นแล้ว
 * - `POST { docs }` สร้างลิงก์ใหม่ (ลิงก์เก่าใช้ไม่ได้ทันที) — ต้องบันทึกเอกสารก่อน
 * - `DELETE` ยกเลิกลิงก์
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    if (!(await hrActor())) return unauthorized();
    return ok(await getSignLinkState((await params).id));
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const actor = await hrActor();
    if (!actor) return unauthorized();
    return ok(await createSignLink((await params).id, await readBody(request), actor));
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    if (!(await hrActor())) return unauthorized();
    return ok(await revokeSignLink((await params).id));
  } catch (err) {
    return failRecruitment(err);
  }
}
