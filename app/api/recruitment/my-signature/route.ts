import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failRecruitment, readBody, unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import type { MySignature } from "@/app/recruitment/_lib/hr-signatures";
import {
  deleteStaffSignature,
  getStaffSignature,
  saveStaffSignature,
} from "@/app/recruitment/_lib/staff-signature-store";

/**
 * ลายเซ็นของฉัน — ช่องเซ็นฝั่งเจ้าหน้าที่ในกล่องทำเอกสาร (8 พ.ย. 2569)
 *
 * - `GET` ชื่อ/ตำแหน่งจาก session + ลายเซ็นที่บันทึกไว้ (`image: null` = ยังไม่มี)
 * - `PUT { image }` บันทึก/เปลี่ยนลายเซ็น (data URL ภาพ ไม่เกิน `MAX_SIGNATURE_CHARS`)
 * - `DELETE` ลบลายเซ็น — เอกสารที่เซ็นไปแล้วไม่เปลี่ยน (เก็บสำเนารูปของตัวเอง)
 *
 * เจ้าของลายเซ็นมาจาก session เสมอ ไม่รับรหัสพนักงานจาก body
 */

export const dynamic = "force-dynamic";

async function me() {
  const user = await readSessionUser();
  if (!user) return null;
  return { employeeId: user.employeeId, name: user.name || user.employeeId, position: user.position };
}

export async function GET() {
  try {
    const user = await me();
    if (!user) return unauthorized();
    const saved = await getStaffSignature(user.employeeId);
    return ok<MySignature>({ ...user, image: saved?.image ?? null, updatedAt: saved?.updatedAt ?? null });
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await me();
    if (!user) return unauthorized();
    const saved = await saveStaffSignature(user.employeeId, user.name, await readBody(request));
    return ok<MySignature>({ ...user, ...saved });
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function DELETE() {
  try {
    const user = await me();
    if (!user) return unauthorized();
    await deleteStaffSignature(user.employeeId);
    return ok<MySignature>({ ...user, image: null, updatedAt: null });
  } catch (err) {
    return failRecruitment(err);
  }
}
