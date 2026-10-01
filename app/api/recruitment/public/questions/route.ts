import { ok } from "@/app/api/_lib/respond";
import { failRecruitment } from "@/app/api/recruitment/_lib";
import { listActiveQuestions } from "@/app/recruitment/_lib/questions";

/**
 * `GET /api/recruitment/public/questions` — ชุดคำถามที่เปิดใช้อยู่
 *
 * **เปิดสาธารณะ** ฟอร์มสมัครอ่านจากเส้นนี้ตอนผู้สมัครกดยินยอมเสร็จ ·
 * คืนเฉพาะข้อที่ `active` และไม่มีข้อมูลของผู้สมัครคนไหนอยู่ในนั้นเลย
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await listActiveQuestions());
  } catch (err) {
    return failRecruitment(err);
  }
}
