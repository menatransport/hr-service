import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { actor, failRecord, unauthorized } from "@/app/api/record-cases/_lib";
import { createRecordCase, listRecordCases } from "@/lib/record-cases";

/**
 * `GET /api/record-cases` — รายการบันทึกเคสทั้งหมด (ใหม่สุดก่อน)
 * `POST /api/record-cases` — บันทึกเคสใหม่ สถานะเริ่มที่ “รอดำเนินการ” เสมอ
 *
 * หน้าจอปกติอ่านผ่าน server component แล้ว `router.refresh()` — `GET` เส้นนี้
 * มีไว้ให้เครื่องมือภายนอก/สคริปต์ตรวจข้อมูลใช้ ไม่ใช่ทางหลักของหน้าเว็บ
 */

export async function GET() {
  try {
    return ok(await listRecordCases());
  } catch (err) {
    return failRecord(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const who = await actor();
    if (!who) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    /* ผู้บันทึกไม่ได้มาจาก body — ถึงจะส่งมาก็ถูกทิ้ง (ดูเหตุผลที่ `actor()`) */
    return ok(
      await createRecordCase(
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
