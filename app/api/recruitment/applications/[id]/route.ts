import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  editor,
  failRecruitment,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import {
  getApplication,
  updateApplication,
} from "@/app/recruitment/_lib/applications";
import { syncRequisitionForApplication } from "@/app/recruitment/_lib/requisitions/store";

/**
 * `GET   /api/recruitment/applications/[id]` — ใบสมัครเต็มใบพร้อมคำตอบทุกข้อ
 * `PATCH /api/recruitment/applications/[id]` — จัดการผู้สมัคร: สถานะ ผู้ติดต่อกลับ
 *   แผน/วัน/ผลการสัมภาษณ์ เหตุผลออก และบันทึกภายใน — ในคำขอเดียว
 *
 * ผู้แก้ไขมาจาก session เสมอ ไม่รับจาก body — ไทม์ไลน์เป็นหลักฐานว่าใครตัดสินใจ
 * อะไร ถ้ารับจาก body ก็อ้างเป็นคนอื่นได้
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;
    const application = await getApplication(id);
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
    const body = await readBody(request);
    const application = await updateApplication(id, body, who);

    /* คำขอสรรหาที่ผูกใบนี้ไว้ต้องเดินตามสถานะใบสมัคร — เริ่มฝึกงาน = อัตราปิด ·
       ยกเลิก = ปลดการผูกแล้วเปิดรับใหม่ · ทำที่นี่จุดเดียว ไม่คำนวณตอนอ่าน
       ไม่งั้นการเปลี่ยนสถานะจะไม่ถูกบันทึกลงประวัติของคำขอ
       **ไม่โยน error ต่อ** — ดูเหตุผลใน `syncRequisitionForApplication()` */
    await syncRequisitionForApplication(id, application.status, who);

    return ok(application);
  } catch (err) {
    return failRecruitment(err);
  }
}
