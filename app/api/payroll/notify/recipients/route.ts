import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { canPassIntake, HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import {
  clearSavedRecipients,
  RecipientInputError,
  saveRecipients,
} from "@/lib/payroll/notify-recipients";
import { OWNER_ORDER, type IntakeOwner } from "@/lib/payroll/registry";

/**
 * ผู้รับเมลแจ้งฝ่ายที่ HR บันทึกไว้ใช้ข้ามรอบ
 *
 * - `PUT /api/payroll/notify/recipients` body `{ owner, to, cc }` — บันทึก/ทับของเดิม
 * - `DELETE /api/payroll/notify/recipients?owner=<ฝ่าย>` — ลบ กลับไปใช้สมุดรายชื่อ
 *
 * **สิทธิ์เดียวกับเส้นร่างอีเมล** (`canPassIntake`) เพราะคนที่ส่งเมลแจ้งฝ่ายคือ HR
 * และค่าที่บันทึกตรงนี้กำหนดว่าเมลรอบต่อ ๆ ไปจะถูกส่งถึงใคร — ถ้าใครก็แก้ได้
 * คนนอกจะเปลี่ยนปลายทางของเมลที่ HR เป็นคนกดส่งได้โดยที่ HR ไม่รู้ตัว
 *
 * `proxy.ts` กัน method ที่เขียนไว้ให้แล้ว แต่ยังต้องเช็ก session ที่นี่เองเพราะ
 * proxy ตรวจแค่ว่ามีคุกกี้ ไม่ได้ตรวจว่าเป็นหน่วยงานไหน
 */

const ownerOf = (value: unknown): IntakeOwner | null =>
  typeof value === "string" && (OWNER_ORDER as string[]).includes(value)
    ? (value as IntakeOwner)
    : null;

async function gate() {
  const me = await readSessionUser();
  if (!me) return { error: unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง") };

  const identity = await getDeskIdentity();
  if (!canPassIntake(identity)) {
    return {
      error: forbidden(
        `บันทึกผู้รับได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${identity.department || "หน่วยงานที่ไม่ระบุ"}`,
      ),
    };
  }
  return { by: identity.name };
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await gate();
    if (guard.error) return guard.error;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const owner = ownerOf(body.owner);
    if (!owner) {
      return badRequest(`ไม่รู้จักฝ่าย “${String(body.owner ?? "")}” — ต้องเป็นหนึ่งใน ${OWNER_ORDER.join(" / ")}`);
    }

    const saved = await saveRecipients({
      owner,
      to: typeof body.to === "string" ? body.to : "",
      cc: typeof body.cc === "string" ? body.cc : "",
      by: guard.by,
    });
    return ok({ saved });
  } catch (err) {
    /* ค่าที่กรอกมาไม่ผ่าน = คนกรอกแก้เองได้ → 400 · ฐานข้อมูลล้ม = 500 ตามปกติ */
    if (err instanceof RecipientInputError) return badRequest(err.message);
    return fail(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = await gate();
    if (guard.error) return guard.error;

    const owner = ownerOf(request.nextUrl.searchParams.get("owner"));
    if (!owner) return badRequest("ระบุ owner เป็นชื่อฝ่ายในทะเบียน");

    await clearSavedRecipients(owner);
    return ok({ cleared: owner });
  } catch (err) {
    return fail(err);
  }
}
