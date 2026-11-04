import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { editor, unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { RequisitionError } from "@/app/recruitment/_lib/requisitions/store";
import { getJourney } from "@/app/recruitment/_lib/requisitions/onboarding-store";

/** `GET …/[id]/journey` — ข้อมูลเต็มของ พจส.ใหม่หนึ่งคน สำหรับ dialog บนหน้าติดตามพนักงานใหม่ */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;
    const journey = await getJourney(id);
    if (!journey) throw new RequisitionError("ไม่พบคำขอที่ระบุ");
    return ok(journey);
  } catch (err) {
    return failRequisition(err);
  }
}
