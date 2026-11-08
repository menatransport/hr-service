import sharp from "sharp";

import { thumbKeyOf, type ThumbWidth } from "@/lib/media";
import { putMediaBytes, readMedia } from "@/lib/s3";

/**
 * รูปย่อของไฟล์บน S3 — **ฝั่งเซิร์ฟเวอร์เท่านั้น** (`GET /api/media/{key}?w=`)
 *
 * ทำครั้งแรกที่มีคนเปิด แล้วเก็บไว้ที่ `…/_thumb/{ชื่อไฟล์}.w{กว้าง}.webp` ครั้งต่อไปอ่านของที่ทำไว้เลย ·
 * ไฟล์จริงไม่ถูกแตะ (เอกสาร HR ยังพิมพ์จากรูปเต็ม) · คืน `null` = ไม่มีไฟล์ต้นทาง หรือไม่ใช่รูป
 *
 * ชื่อไฟล์บน S3 มีเวลา+เลขสุ่มทุกครั้งที่อัป (`fileLeaf()`) — เนื้อไฟล์ของ key หนึ่งไม่มีวันเปลี่ยน
 * route จึงให้เบราว์เซอร์จำรูปย่อได้ยาว (`immutable`) เปิดตารางรอบหลังไม่ต้องโหลดรูปซ้ำ
 */
export async function mediaThumb(key: string, width: ThumbWidth): Promise<Uint8Array | null> {
  const thumbKey = thumbKeyOf(key, width);
  const cached = await readMedia(thumbKey);
  if (cached) return cached.body;

  const source = await readMedia(key);
  if (!source || !source.type.startsWith("image/")) return null;

  const body = new Uint8Array(
    await sharp(source.body)
      .rotate() // รูปจากมือถือหมุนตาม EXIF ก่อนย่อ ไม่งั้นรูปย่อนอนตะแคง
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer(),
  );

  /* เก็บไม่ติดก็ยังส่งรูปย่อให้คนที่ขอได้ — แค่ครั้งหน้าต้องย่อใหม่ */
  await putMediaBytes(thumbKey, body, "image/webp").catch((err: unknown) => {
    console.warn("[media-thumb] เก็บรูปย่อไม่สำเร็จ —", thumbKey, err);
  });
  return body;
}
