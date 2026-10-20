import { NextResponse } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { getVehicleDetail } from "@/app/recruitment/_lib/requisitions/vehicle-detail";

/**
 * `GET /api/recruitment/vehicles/[code]` — รายละเอียดรถหนึ่งคัน (เลขรถหรือทะเบียน)
 * · dialog ในขั้นยานยนต์ยิงเฉพาะตอนกดเปิด ไม่โหลดทุกครั้งที่เข้าหน้า
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (!(await readSessionUser())) return unauthorized();
    const { code } = await params;
    const detail = await getVehicleDetail(decodeURIComponent(code));
    if (!detail) return NextResponse.json({ error: "ไม่พบรถคันนี้ในทะเบียนรถ" }, { status: 404 });
    return ok(detail);
  } catch (err) {
    return fail(err);
  }
}
