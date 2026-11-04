import { ok } from "@/app/api/_lib/respond";
import { unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { getRequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";

/**
 * `GET /api/recruitment/requisitions/options` — ตัวเลือกของฟอร์มขออัตรา
 * · หน้าผู้สมัครโหลดตอนกดปุ่มเพิ่มอัตราบนการ์ดรอสรรหาเท่านั้น (ATMS หนัก ไม่ลากมาทุกครั้งที่เปิดหน้า)
 */
export async function GET() {
  try {
    if (!(await readSessionUser())) return unauthorized();
    return ok(await getRequisitionOptions());
  } catch (err) {
    return failRequisition(err);
  }
}
