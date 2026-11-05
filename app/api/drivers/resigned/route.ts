import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getResignedDriverList } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `GET /api/drivers/resigned` — แถวแท็บ “พ้นสภาพแล้ว” ของตารางทะเบียน (รูปเดียวกับ `getDriverList()`)
 * · หน้าทะเบียนส่งมาแค่คนปัจจุบัน แท็บนี้โหลดตอนกดครั้งแรก (5 พ.ย. 2569)
 *
 * `proxy.ts` ไม่กัน `GET` ให้ — ตรวจล็อกอินเองเหมือน `/api/drivers/picker`
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    const res = ok(await getResignedDriverList());
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}
