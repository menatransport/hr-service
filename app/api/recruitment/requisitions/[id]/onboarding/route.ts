import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { editor, readBody, unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { RequisitionError } from "@/app/recruitment/_lib/requisitions/store";
import { getRcForm, updateOnboardingSection } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import type { OnboardingPatch } from "@/app/recruitment/_lib/requisitions/onboarding";

/** `GET …/[id]/onboarding` — ส่วน RC + คำแนะนำ สำหรับกล่อง “ข้อมูล RC” บนหน้าผู้สมัคร */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;
    const form = await getRcForm(id);
    if (!form) throw new RequisitionError("ไม่พบคำขอที่ระบุ");
    return ok(form);
  } catch (err) {
    return failRequisition(err);
  }
}

/**
 * `PATCH /api/recruitment/requisitions/[id]/onboarding` — บันทึกข้อมูล Onboarding **ทีละฝ่าย**
 * body `{ section: "rc" | "ka" | "er" | "hrd" | "fleet" | "handover", values: {…}, drivercode? }`
 *
 * แยกจาก `PATCH …/[id]` เพราะคืนค่าคนละรูป (แถว Onboarding เต็ม ไม่ใช่แถวคำขอ) และไม่แตะ
 * สถานะคำขอเลย · ผู้บันทึกมาจาก session เสมอ — ลงประวัติของคำขอว่าฝ่ายไหนแก้อะไร
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const { id } = await params;
    const body = (await readBody(request)) as unknown as OnboardingPatch;
    return ok(await updateOnboardingSection(id, body, who));
  } catch (err) {
    return failRequisition(err);
  }
}
