import { canExportResignedPhone } from "./resigned-phone-export";
import { canAccessMenuStrict } from "../menu-permissions";

/** สิทธิ์ย่อยที่ `/desk/permissions` — เปิดเบอร์คนพ้นสภาพให้ทั้งฝ่าย/แผนก (Bew 25 พ.ย. 2569 · ฝ่าย HOD) */
export const RESIGNED_PHONE_MENU = "resigned-phone";

/**
 * ได้เบอร์โทรคนพ้นสภาพไหม — อีเมลใน `canExportResignedPhone()` หรือสิทธิ์ย่อย `resigned-phone`
 * · ข้อมูลส่วนบุคคล จึงเช็คสิทธิ์แบบ fail-closed (`canAccessMenuStrict`)
 */
export async function canSeeResignedPhone(user: { username?: string | null } | null | undefined): Promise<boolean> {
  if (!user) return false;
  return canExportResignedPhone(user) || (await canAccessMenuStrict(RESIGNED_PHONE_MENU));
}
