import { forbidden, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenuStrict } from "@/lib/menu-permissions";
import { EXIT_INTERVIEW_MENU } from "@/app/recruitment/_lib/exit-interview/types";

/**
 * ด่าน Exit Interview — สิทธิ์ย่อย `exit-interview` (ค่าเริ่มต้นไม่เห็น · เปิดให้ HRD + Process Excellence)
 * **ล้มเหลวแล้วปฏิเสธ** ต่างจาก `registryWriteDenied()` เพราะมีรายได้และความเห็นต่อหัวหน้า
 *
 * คืน `null` = ผ่าน · คืน response 401/403 = ส่งกลับไปเลย
 */
export async function exitInterviewDenied() {
  if (!(await readSessionUser())) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
  if (await canAccessMenuStrict(EXIT_INTERVIEW_MENU)) return null;
  return forbidden("Exit Interview เปิดได้เฉพาะ HRD และ Process Excellence");
}
