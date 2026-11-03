import { NextResponse, type NextRequest } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { RentalError } from "@/lib/rentals/store";

/**
 * ตัวห่อของทุกเส้นใต้ `/api/rentals/**` — อ่าน body · ผู้ทำมาจาก session (ไม่เชื่อ client) ·
 * `RentalError` = ข้อความที่ผู้ใช้อ่านได้พร้อมสถานะของมัน
 *
 * `proxy.ts` กันคำสั่งเขียนของคนที่ยังไม่ล็อกอินไว้แล้ว
 */
export async function handle<T>(
  request: NextRequest,
  run: (body: Record<string, unknown>, actor: string) => Promise<T>,
) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(await run(body, await getActorEmployeeId()));
  } catch (err) {
    if (err instanceof RentalError) return NextResponse.json({ error: err.message }, { status: err.status });
    return fail(err);
  }
}
