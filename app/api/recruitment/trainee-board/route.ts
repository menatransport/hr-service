import type { NextRequest } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { getTraineeBoard } from "@/app/recruitment/_lib/drivers/trainee-board";
import { getVehicleOptions } from "@/app/recruitment/_lib/requisitions/options";

/**
 * `GET /api/recruitment/trainee-board?m=YYYY-MM&codes=a,b` — ตารางฝึกงานรายวันของเดือนนั้น + รายชื่อรถ
 * · `codes` = คนในแท็บ training (ไม่ส่ง = คัดจาก `ฝ` ของเดือนแบบเดิม)
 * · หน้าติดตามพนักงานใหม่ (แท็บ training) ยิงเฉพาะตอนกดเปิดตาราง ไม่โหลดทุกครั้งที่เข้าหน้า
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) return unauthorized();
    const params = request.nextUrl.searchParams;
    const month = params.get("m") ?? "";
    const codes = params.has("codes") ? (params.get("codes") ?? "").split(",").filter(Boolean) : undefined;
    const [board, vehicles] = await Promise.all([getTraineeBoard(month, codes), getVehicleOptions()]);
    return ok({ board, vehicles });
  } catch (err) {
    return fail(err);
  }
}
