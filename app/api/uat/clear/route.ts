import { ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { clearUatData, previewUatClear } from "@/lib/uat-store";

import { failUat } from "../_fail";

/**
 * `GET /api/uat/clear` — จำนวนที่จะถูกล้าง (ให้กล่องยืนยันบอกก่อนกด)
 * `POST /api/uat/clear` — ล้างจริง (สำรองลง `uat_trash` ก่อน) คืนจำนวนที่ล้าง
 */
export async function GET() {
  try {
    if (!(await readSessionUser())) return unauthorized("ต้องเข้าสู่ระบบก่อน");
    return ok(await previewUatClear());
  } catch (err) {
    return failUat(err);
  }
}

export async function POST() {
  try {
    return ok(await clearUatData());
  } catch (err) {
    return failUat(err);
  }
}
