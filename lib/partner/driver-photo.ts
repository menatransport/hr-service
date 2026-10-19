/**
 * หมุนรูปเอกสารของคนขับ — ส่วนที่เป็น logic ล้วน (ไม่แตะ DB/sharp/network) เทสต์ที่ lib/driver-photo.test.ts
 *
 * ทำไมต้องหมุนแล้วเซฟถาวร: รูปที่ถ่ายจากมือถือบางรูปตะแคง (พิกเซลนอน ไม่มี EXIF) การหมุนด้วย CSS
 * จะเห็นคนเดียวและไม่ติดไปกับไฟล์ที่ดาวน์โหลด/แนบต่อ — จึงเขียนไฟล์ใหม่ทับค่าในฐานเหมือน
 * scripts/bake-photo-rotation.mjs ที่ทำกับรูปรถ
 */

/** ช่องรูปของคนขับที่หมุนได้ — allowlist กัน field อื่นถูกเขียนทับผ่าน API นี้ */
export const DRIVER_PHOTO_FIELDS = ["photoUrl", "idCardUrl", "licenseUrl", "houseRegUrl", "bankBookUrl"] as const
export type DriverPhotoField = (typeof DRIVER_PHOTO_FIELDS)[number]

export const ROTATE_DEGREES = [90, 180, 270] as const
export type RotateDegree = (typeof ROTATE_DEGREES)[number]

export type RotateRequest = { field: DriverPhotoField; deg: RotateDegree }

const isField = (v: unknown): v is DriverPhotoField =>
  (DRIVER_PHOTO_FIELDS as readonly string[]).includes(String(v ?? ""))

/** ตรวจ body ของคำขอหมุน — คืนข้อความไทยเมื่อไม่ผ่าน (API เอาไปตอบ 400 ตรง ๆ) */
export function parseRotateRequest(body: unknown): RotateRequest | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>
  if (!isField(b.field)) return { error: `ช่องรูปไม่ถูกต้อง (รองรับ ${DRIVER_PHOTO_FIELDS.join(", ")})` }
  const deg = Number(b.deg)
  if (!(ROTATE_DEGREES as readonly number[]).includes(deg)) return { error: "องศาต้องเป็น 90, 180 หรือ 270" }
  return { field: b.field, deg: deg as RotateDegree }
}

/** PDF หมุนไม่ได้ (sharp อ่านไม่ได้) — ปุ่มหมุนต้องไม่โผล่ และ API ต้องกันซ้ำอีกชั้น */
export function isRotatableImageUrl(url: string): boolean {
  const clean = String(url ?? "").split("?")[0].trim()
  if (!clean) return false
  return !/\.pdf$/i.test(clean)
}

/**
 * รูปที่หมุนได้ต้องเป็นไฟล์ในที่เก็บของเราเท่านั้น — กันไม่ให้ API ถูกใช้ยิงไปดึง URL อะไรก็ได้
 * (SSRF) เพราะ field ในฐานอาจถูกกรอกเป็นลิงก์ภายนอกมาก่อนก็ได้
 */
export function isOwnStorageUrl(url: string, bucket = process.env.DO_SPACES_BUCKET, region = process.env.DO_SPACES_REGION ?? "sgp1"): boolean {
  if (!bucket) return false
  let u: URL
  try { u = new URL(String(url ?? "")) } catch { return false }
  if (u.protocol !== "https:") return false
  return u.hostname === `${bucket}.${region}.digitaloceanspaces.com`
    || u.hostname === `${bucket}.${region}.cdn.digitaloceanspaces.com`
}
