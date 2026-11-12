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
import { syncRequisitionForApplication } from "@/app/recruitment/_lib/requisitions/store";
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
    const { requisitionCancelReason, ...body } = await readBody(request);
    /* ยกเลิกใบที่ผูก JR — ส่งเหตุผลมา = ยกเลิก JR ไปด้วย · ไม่ส่ง = คืน JR กลับไปสรรหา (Bew 12 พ.ย. 2569) */
    const cancelRequisition = requisitionCancelReason
      ? CANCEL_REASONS.find((r) => r.value === requisitionCancelReason)?.value
      : undefined;
    if (requisitionCancelReason && !cancelRequisition) return badRequest("เหตุผลที่ยกเลิก JR ไม่ถูกต้อง");
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
