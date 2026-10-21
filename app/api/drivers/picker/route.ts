import { fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getDriverPicks } from "@/app/recruitment/_lib/drivers/registry";

/**
 * `GET /api/drivers/picker` — รายชื่อ พจส. (รหัส ชื่อ แพล้นท์ ลูกค้า) จากทะเบียนประวัติ
 * สำหรับช่องเลือก “ผู้เกี่ยวข้อง” ในฟอร์มบันทึกเคส · ไม่มีข้อมูลส่วนบุคคล (เบอร์/เลขบัตร)
 *
 * `proxy.ts` ไม่กัน `GET` ให้ — ตรวจล็อกอินเองเหมือน `/api/drivers/export`
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    return ok(await getDriverPicks());
  } catch (err) {
    return fail(err);
  }
}
