/**
 * ลิงก์ไฟล์บน S3 ของระบบ — **ไฟล์กลาง import ได้ทั้ง server และ client** (ไม่มี SDK)
 * ตัวที่คุยกับ S3 จริงอยู่ที่ `lib/s3.ts` (ฝั่งเซิร์ฟเวอร์เท่านั้น)
 *
 * ทุกไฟล์ของ Mass Recruitment อยู่ใต้ `mass-image/` และ **เป็น private ทั้งหมด**
 * (1 ต.ค. 2026 — เลิกเก็บไฟล์ใน MongoDB และเลิกเปิดลิงก์สาธารณะ) ไล่ตามรหัสได้ทุกไฟล์:
 *
 * ```
 * mass-image/
 * ├─ drivers/{drivercode}/avatar/{เวลา}-{สุ่ม}.jpg
 * ├─ drivers/{drivercode}/documents/{docType}/{เวลา}-{สุ่ม}.jpg
 * ├─ applications/{เลขใบสมัคร}/{slotId}/{เวลา}-{สุ่ม}.jpg
 * └─ applications/_drafts/{draftId}/{slotId}/…   ← ผู้สมัครอัประหว่างกรอก ยังไม่กดส่ง
 * ```
 *
 * สิ่งที่เก็บในฐานคือ **ลิงก์ของระบบเอง** `/api/media/{key}` ไม่ใช่ลิงก์ของ bucket —
 * route นั้นตรวจสิทธิ์แล้วเด้ง (302) ไปลิงก์ presigned อายุสั้น ช่อง `url` / `photoUrl`
 * เดิมทุกช่องจึงใช้ใน `<img src>` ได้ตรง ๆ เหมือนเดิม และลิงก์ในฐานไม่มีวันหมดอายุ
 *
 * อายุการเก็บ (ดู `media-retention.ts`):
 * - `_drafts/` — ลบอัตโนมัติโดย lifecycle ของ bucket เมื่อครบ 1 วัน (`setup_media_lifecycle.mjs`)
 * - ผู้สมัครกดยกเลิกเอง — ลบทั้งโฟลเดอร์ใบสมัครทันที (`cancelApplication()`)
 * - พจส. พ้นสภาพครบ 1 เดือน — ลบรูปและเอกสารทั้งโฟลเดอร์ (cron วันละครั้ง)
 */

export const MEDIA_ROOT = "mass-image";

const MEDIA_ROUTE = "/api/media/";

/** prefix ของไฟล์ร่างผู้สมัคร — เปิดดูได้โดยไม่ล็อกอิน (ผู้สมัครต้องเห็นรูปที่เพิ่งอัป) */
export const DRAFT_PREFIX = `${MEDIA_ROOT}/applications/_drafts/`;

/** key → ลิงก์ที่เก็บลงฐาน */
export function mediaUrl(key: string): string {
  return `${MEDIA_ROUTE}${key}`;
}

/** ลิงก์ในฐาน → key · ลิงก์ที่ไม่ใช่ของ `mass-image/` (เช่น Spaces สาธารณะสมัยก่อน) = `null` */
export function mediaKeyOf(url: string | null | undefined): string | null {
  if (!url?.startsWith(MEDIA_ROUTE)) return null;
  const key = url.slice(MEDIA_ROUTE.length);
  return isMediaKey(key) ? key : null;
}

/** key ที่ระบบนี้ยอมแตะ — อยู่ใต้ `mass-image/` และไม่มีส่วนที่พาออกนอกโฟลเดอร์ */
export function isMediaKey(key: string): boolean {
  return (
    key.startsWith(`${MEDIA_ROOT}/`) &&
    !key.split("/").some((part) => part === "" || part === "." || part === "..")
  );
}

/* ------------------------------------------------------------------ รูปย่อ */

/**
 * ความกว้างรูปย่อที่ `GET /api/media/{key}?w=` ยอมทำ — ล็อกไว้แค่นี้ กันใครยิงทุกขนาดจนเต็ม bucket
 * · `160` = วงรูปในตาราง/การ์ด (ใหญ่สุด 74 px × จอ 2x) · `640` = รูปขยายตอนชี้เมาส์
 */
export const THUMB_WIDTHS = [160, 640] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/** ที่เก็บรูปย่อ — โฟลเดอร์ `_thumb/` ข้างไฟล์จริง ลบโฟลเดอร์เจ้าของเมื่อไหร่รูปย่อหายตามไปด้วย */
export function thumbKeyOf(key: string, width: ThumbWidth): string {
  const cut = key.lastIndexOf("/");
  return `${key.slice(0, cut)}/_thumb/${key.slice(cut + 1)}.w${width}.webp`;
}

/**
 * ลิงก์รูปย่อของลิงก์ในฐาน — วงรูปเล็ก ๆ ไม่ต้องโหลดรูปเต็ม (~1600 px · หลายร้อย KB) ·
 * ลิงก์ที่ไม่ใช่ของ `mass-image/` หรือเป็นไฟล์ร่างของผู้สมัคร = คืนลิงก์เดิม
 */
export function mediaThumbUrl(url: string, width: ThumbWidth): string {
  const key = mediaKeyOf(url);
  if (!key || key.startsWith(DRAFT_PREFIX) || key.includes("/_thumb/")) return url;
  return `${url}?w=${width}`;
}
