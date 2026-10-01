import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import {
  failRecruitment,
  hrActor,
  readBody,
  unauthorized,
} from "@/app/api/recruitment/_lib";
import { recordHrDocumentPrint } from "@/app/recruitment/_lib/hr-document-records-store";

/**
 * `POST /api/recruitment/applications/[id]/hr-documents/prints` — บันทึกหนึ่งครั้งที่
 * สั่งพิมพ์ พร้อมสำเนาค่าที่อยู่บนกระดาษจริง ณ ตอนนั้น — **บันทึกต่อท้ายเท่านั้น
 * ไม่แก้เอกสารหลัก** (ดู `recordHrDocumentPrint()`)
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await hrActor();
    if (!actor) return unauthorized();

    const { id } = await params;
    const body = await readBody(request);
    return ok(await recordHrDocumentPrint(id, body, actor));
  } catch (err) {
    return failRecruitment(err);
  }
}
