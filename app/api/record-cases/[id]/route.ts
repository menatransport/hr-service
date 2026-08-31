import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { actor, failRecord, unauthorized } from "@/app/api/record-cases/_lib";
import { changeRecordStatus, getRecordCase, updateRecordCase } from "@/lib/record-cases";

/**
 * `GET   /api/record-cases/{id}` — อ่านเคสเดียว
 * `PATCH /api/record-cases/{id}` — เปลี่ยนสถานะ (`{ status, note? }`)
 * `PUT   /api/record-cases/{id}` — แก้ไขเนื้อเคส (ทุกฟิลด์เหมือนตอนสร้าง **ยกเว้นสถานะ**)
 *
 * **แยกสองกริยาโดยตั้งใจ** — `PATCH` ขยับสถานะอย่างเดียว · `PUT` แก้เนื้ออย่างเดียว
 * ปนกันเมื่อไหร่จะมีเส้นที่เปลี่ยนสถานะโดยไม่ผ่าน `changeRecordStatus()` ทันที
 *
 * **การเปลี่ยนสถานะกับการลงประวัติเป็นเรื่องเดียวกัน** — ไม่มีเส้นไหนเปลี่ยน
 * สถานะโดยไม่ลงประวัติ และไม่มีเส้นไหนลงประวัติเองได้ (ดู `changeRecordStatus()`)
 * การแก้ไขก็ลงประวัติเช่นกัน (`kind: "edit"`) ·
 * ใครเป็นคนทำมาจาก session ไม่ใช่จาก body
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return ok(await getRecordCase(id));
  } catch (err) {
    return failRecord(err);
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const who = await actor();
    if (!who) return unauthorized();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    /* `status` ที่ติดมากับ body ถูกทิ้งเสมอ — ทางเปลี่ยนสถานะมีเส้นเดียวคือ `PATCH` */
    return ok(
      await updateRecordCase(
        id,
        {
          title: body.title,
          detail: body.detail,
          occurredOn: body.occurredOn,
          departmentId: body.departmentId,
          category: body.category,
          involved: body.involved,
          remark: body.remark,
          warnings: body.warnings,
          attachments: body.attachments,
        },
        who,
      ),
    );
  } catch (err) {
    return failRecord(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const who = await actor();
    if (!who) return unauthorized();

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    return ok(await changeRecordStatus(id, body.status, body.note, who));
  } catch (err) {
    return failRecord(err);
  }
}
