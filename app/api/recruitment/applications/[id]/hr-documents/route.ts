import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  failRecruitment,
  hrActor,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import {
  getHrDocumentState,
  saveHrDocument,
} from "@/app/recruitment/_lib/hr-document-records-store";

/**
 * `GET /api/recruitment/applications/[id]/hr-documents` — ค่าที่บันทึกไว้ล่าสุด
 *   (ถ้ามี) พร้อมประวัติการพิมพ์ (ไม่มี `fill` ต่อรายการ — ขอทีละใบผ่านเส้น `prints/[printId]`)
 * `PUT  /api/recruitment/applications/[id]/hr-documents` — บันทึกค่าที่กรอกทับ
 *   (optimistic concurrency ผ่าน `revision` — ดูรายละเอียดที่ `saveHrDocument()`)
 *
 * ผู้ทำรายการมาจาก session เสมอ ไม่รับจาก body (กฎเดียวกับทั้งระบบ)
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await hrActor())) return unauthorized();
    const { id } = await params;
    return ok(await getHrDocumentState(id));
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await hrActor();
    if (!actor) return unauthorized();

    const { id } = await params;
    const body = await readBody(request);
    return ok(await saveHrDocument(id, body, actor));
  } catch (err) {
    return failRecruitment(err);
  }
}
