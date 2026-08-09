/**
 * ย่อ/บีบรูปในเบราว์เซอร์ก่อนอัปขึ้น Spaces — **ฝั่งไคลเอนต์เท่านั้น**
 * (ใช้ `createImageBitmap` / `OffscreenCanvas` ซึ่งไม่มีบน Node)
 *
 * ทำไมต้องย่อฝั่งเบราว์เซอร์: ไฟล์เดินสองต่อ (เครื่องผู้ใช้ → `/api/uploads` → Spaces)
 * รูปจากมือถือ 4–8 MB จึงกินเน็ตสองรอบและเสี่ยงชน timeout 30 วิของ `lib/uploads.ts`
 * ย่อก่อนเหลือหลักร้อย KB ทำให้เร็วขึ้นทั้งสองต่อ โดยผู้ใช้ไม่ต้องไปย่อรูปเอง
 *
 * ทางที่ประหยัดที่สุดคือ `createImageBitmap` — ถอดรหัสนอกเธรดหลัก จอไม่ค้าง
 * แล้ววาดลง `OffscreenCanvas` ครั้งเดียว (ถ้าเบราว์เซอร์ไม่มีก็ตกไปใช้ `<canvas>` ปกติ)
 *
 * ผลลัพธ์เป็น **JPEG เสมอ** เพราะไฟล์แนบของเคสคือรูปถ่าย/สกรีนช็อต ซึ่ง PNG
 * จะใหญ่กว่าหลายเท่าโดยไม่ได้อะไรกลับมา · PNG โปร่งใสจึงถมพื้นขาวก่อนวาด
 * ไม่งั้นส่วนโปร่งจะกลายเป็นดำ
 */

/**
 * รับแค่สองชนิดนี้ — WebP ตัดออกตามที่เจ้าของงานกำหนด
 * ต้องตรงกับ `ALLOWED_TYPES` ใน `app/api/uploads/route.ts` (คนละรันไทม์ แชร์ค่าตรง ๆ ไม่ได้)
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;

/** ใส่ใน `accept` ของ `<input type="file">` — ยังกันได้ไม่ครบ ต้องเช็ค type ซ้ำอยู่ดี */
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(",");

/** ข้อความบอกผู้ใช้ ใช้ที่เดียวทั้ง hint และ error จะได้ไม่หลุดกัน */
export const ACCEPTED_LABEL = "JPG / PNG";

/** ด้านยาวสุดหลังย่อ — พอสำหรับดูหลักฐานเต็มจอ แต่ไม่เปลืองพื้นที่เก็บ */
const MAX_EDGE = 1600;

const QUALITY = 0.82;

/** เล็กพออยู่แล้ว ถอดรหัส+เข้ารหัสใหม่มีแต่เสียคุณภาพกับเสียเวลา */
const SKIP_BYTES = 600 * 1024;

export function isAcceptedImage(file: File): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
}

/** เปลี่ยนนามสกุลเป็น .jpg ให้ตรงกับไฟล์จริงที่ส่งออกไป */
function jpegName(original: string): string {
  const dot = original.lastIndexOf(".");
  const base = (dot > 0 ? original.slice(0, dot) : original) || "image";
  return `${base}.jpg`;
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // ถมขาวก่อนเสมอ — JPEG ไม่มีช่องอัลฟา ส่วนโปร่งของ PNG จะกลายเป็นดำ
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", QUALITY),
  );
}

/**
 * คืนไฟล์ที่พร้อมอัป — ย่อแล้วถ้าคุ้ม ไม่งั้นคืนไฟล์เดิม
 *
 * ทุกทางที่ผิดพลาด (เบราว์เซอร์ถอดรหัสไม่ได้ / ไม่มี canvas context / บีบแล้วโตกว่าเดิม)
 * จะคืนไฟล์เดิมเงียบ ๆ — การอัปโหลดสำคัญกว่าการย่อ ห้ามล้มทั้งงานเพราะย่อไม่ผ่าน
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (file.size <= SKIP_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const blob = await encode(bitmap, width, height);
    // โตกว่าเดิมแปลว่าต้นฉบับบีบมาดีอยู่แล้ว — ส่งของเดิมไปดีกว่า
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], jpegName(file.name || "image"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
