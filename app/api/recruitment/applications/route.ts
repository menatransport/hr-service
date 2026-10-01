import { ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { listApplications } from "@/app/recruitment/_lib/applications";

/**
 * `GET /api/recruitment/applications` — รายการใบสมัคร (ใหม่สุดก่อน)
 *
 * คืนรูปย่อเท่านั้น (`ApplicationSummary`) ตารางแอดมินแสดงไม่กี่คอลัมน์
 * จึงไม่มีเหตุผลจะลากคำตอบทั้งใบและเลขบัตรของทุกคนข้ามเน็ตมา —
 * คำตอบเต็มดึงตอนเปิดดูรายคนผ่าน server component ของหน้าแอดมิน
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!(await editor())) return unauthorized();
    return ok(await listApplications());
  } catch (err) {
    return failRecruitment(err);
  }
}
