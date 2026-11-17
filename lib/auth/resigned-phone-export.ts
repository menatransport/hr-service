/**
 * ใครได้เบอร์โทรของคนพ้นสภาพในไฟล์ Excel หน้าทะเบียน พจส. (`POST /api/drivers/export`)
 *
 * เบอร์ของคนพ้นสภาพเป็นข้อมูลส่วนบุคคล — ปกติล้างทิ้งก่อนออกจากเซิร์ฟเวอร์ (`withPersonalRule`)
 * เปิดให้เฉพาะสองคนนี้ (ณรงค์กรณ์ 17 พ.ย. 2569) · คนอื่นกด Excel ได้เหมือนเดิมแต่ช่องเบอร์ว่าง
 *
 * session ไม่มีอีเมล (NCAC ไม่ส่งมา) มีแค่ `username` ซึ่งคือส่วนหน้า @ ของอีเมลบริษัท
 * → เทียบได้ทั้งแบบเต็มและแบบส่วนหน้า @
 */
export const RESIGNED_PHONE_EXPORT_EMAILS = [
  "putthachart.n@menatransport.co.th",
  "kanokwan.s@menatransport.co.th",
] as const;

const ALLOWED = new Set(
  RESIGNED_PHONE_EXPORT_EMAILS.flatMap((email) => [email, email.split("@")[0]]),
);

export function canExportResignedPhone(user: { username?: string | null } | null | undefined): boolean {
  const username = user?.username?.trim().toLowerCase();
  return Boolean(username) && ALLOWED.has(username!);
}
