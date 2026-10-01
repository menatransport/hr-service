import { NextResponse, type NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failRecruitment, hrActor, unauthorized } from "@/app/api/recruitment/_lib";
import { getHrDocumentPrint } from "@/app/recruitment/_lib/hr-document-records-store";

/**
 * `GET /api/recruitment/applications/[id]/hr-documents/prints/[printId]` — ใบพิมพ์
 * เดียวแบบเต็ม (มี `fill`) · ต้องเป็นของใบสมัคร `[id]` นี้จริง ไม่งั้นถือว่าไม่พบ
 * (ท่าเดียวกับ `GET /api/drivers/[code]/documents/[fileId]`)
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; printId: string }> },
) {
  try {
    if (!(await hrActor())) return unauthorized();

    const { id, printId } = await params;
    const print = await getHrDocumentPrint(id, printId);
    if (!print) {
      return NextResponse.json({ error: "ไม่พบใบพิมพ์ที่ระบุ" }, { status: 404 });
    }
    return ok(print);
  } catch (err) {
    return failRecruitment(err);
  }
}
