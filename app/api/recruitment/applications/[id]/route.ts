import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import {
  getApplicationWithRegistry,
  updateApplicationWithRegistry,
} from "@/app/recruitment/_lib/drivers/application-registry";
import { todayInBangkok } from "@/app/recruitment/_lib/drivers/registry";
import { exitTrainee } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { syncRequisitionForApplication } from "@/app/recruitment/_lib/requisitions/store";
import { EXIT_REASON_NOTE_MAX, OTHER_EXIT_REASON, normalizeStatus, traineeExitOf } from "@/app/recruitment/_lib/types";
import { CANCEL_REASONS, type CancelReason } from "@/app/recruitment/_lib/requisitions/types";

/**
 * `GET   /api/recruitment/applications/[id]` — ใบสมัครเต็มใบพร้อมคำตอบทุกข้อ
 * `PATCH /api/recruitment/applications/[id]` — จัดการผู้สมัคร: สถานะ ผู้ติดต่อกลับ
 *   แผน/วัน/ผลการสัมภาษณ์ เหตุผลออก และบันทึกภายใน — ในคำขอเดียว
 *
 * ผู้แก้ไขมาจาก session เสมอ ไม่รับจาก body — ไทม์ไลน์เป็นหลักฐานว่าใครตัดสินใจ
 * อะไร ถ้ารับจาก body ก็อ้างเป็นคนอื่นได้
 *
 * ใบที่ผูกรหัส พจส. แล้ว: บัตร/ใบขับขี่/บัญชีอ่านและเขียนที่ทะเบียน (`application-registry.ts`)
 *
 * `traineeExit: { kind, dateISO, reason }` คู่กับ `status: "cancelled"` = ฝึก 1-2 วันออก
 * (ใบต้องอยู่สถานะ “ฝึกงาน”) → `exitTrainee()` ลงรายวัน + ผลสิ้นสุด RC + ทะเบียน ก่อนยกเลิกใบ
 * · เหตุผลของใบถูกตั้งที่นี่ = อื่นๆ “<หัวข้อ>: <เหตุผล>” (Bew 21 พ.ย. 2569)
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;
    const application = await getApplicationWithRegistry(id);
    if (!application) return ok(null);
    return ok(application);
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const { id } = await params;
    const { requisitionCancelReason, traineeExit, ...body } = await readBody(request);
    /* ยกเลิกใบที่ผูก JR — ส่งเหตุผลมา = ยกเลิก JR ไปด้วย · ไม่ส่ง = คืน JR กลับไปสรรหา (Bew 12 พ.ย. 2569) */
    const cancelRequisition = requisitionCancelReason
      ? CANCEL_REASONS.find((r) => r.value === requisitionCancelReason)?.value
      : undefined;
    if (requisitionCancelReason && !cancelRequisition) return badRequest("เหตุผลที่ยกเลิก JR ไม่ถูกต้อง");

    if (traineeExit !== undefined) {
      const input = (traineeExit ?? {}) as { kind?: unknown; dateISO?: unknown; reason?: unknown };
      const exit = traineeExitOf(input.kind);
      const dateISO = typeof input.dateISO === "string" ? input.dateISO.trim() : "";
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (!exit) return badRequest("ประเภทการพ้นสภาพไม่ถูกต้อง");
      if (body.status !== "cancelled") return badRequest("ฝึก 1-2 วันออก ต้องคู่กับการยกเลิกใบสมัคร");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || dateISO > todayInBangkok())
        return badRequest("วันที่ออกไม่ถูกต้อง (ล่วงหน้าไม่ได้)");
      if (!reason) return badRequest("ระบุรายละเอียดที่ออก");
      const current = await getApplicationWithRegistry(id);
      if (!current) return badRequest("ไม่พบใบสมัคร");
      if (normalizeStatus(current.status) !== "training") return badRequest("ฝึก 1-2 วันออก ใช้ได้กับคนที่อยู่สถานะฝึกงานเท่านั้น");

      await exitTrainee(id, { kind: exit.value, dateISO, reason }, who);
      body.exitReason = OTHER_EXIT_REASON;
      body.exitReasonNote = `${exit.label}: ${reason}`.slice(0, EXIT_REASON_NOTE_MAX);
    }

    const application = await updateApplicationWithRegistry(id, body, who);

    /* คำขอสรรหาที่ผูกใบนี้ไว้ต้องเดินตามสถานะใบสมัคร — เริ่มฝึกงาน = อัตราปิด ·
       ยกเลิก = ปลดการผูกแล้วเปิดรับใหม่ · ทำที่นี่จุดเดียว ไม่คำนวณตอนอ่าน
       ไม่งั้นการเปลี่ยนสถานะจะไม่ถูกบันทึกลงประวัติของคำขอ
       **ไม่โยน error ต่อ** — ดูเหตุผลใน `syncRequisitionForApplication()` */
    await syncRequisitionForApplication(id, application.status, who, cancelRequisition as CancelReason | undefined);

    return ok(application);
  } catch (err) {
    return failRecruitment(err);
  }
}
