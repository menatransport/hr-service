import { deleteMedia, mediaKeys, putMedia } from "@/lib/s3";

/**
 * ไฟล์เอกสารในแฟ้มประวัติ พจส. — เก็บบน **S3 แบบ private** ใต้
 * `mass-image/drivers/{drivercode}/documents/{docType}/` · **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ย้ายออกจาก GridFS เมื่อ 1 ต.ค. 2026 (เจ้าของงานไม่ให้เก็บไฟล์ใน MongoDB แล้ว — ตอนย้าย
 * bucket `driver_documents` ว่างอยู่ จึงไม่มีไฟล์เก่าให้ตามย้าย) · รายการในแฟ้มยังอยู่ที่
 * `master_driver.documents` เหมือนเดิม เพิ่มแค่ `key` ของไฟล์บน S3
 *
 * **ไฟล์ต้องไม่เป็นสาธารณะ** — แฟ้มนี้คือสำเนาบัตรประชาชน ทะเบียนบ้าน หน้าสมุดบัญชี
 * และสัญญาจ้างของคนจริง · เปิดผ่าน `GET /api/drivers/{code}/documents/{fileId}` ที่ตรวจ
 * session และตรวจว่าไฟล์อยู่ในแฟ้มของรหัสนั้นจริง แล้วเด้งไปลิงก์ presigned อายุสั้น
 *
 * ไฟล์ทั้งโฟลเดอร์ของคนที่พ้นสภาพครบ 1 เดือนถูกลบอัตโนมัติ (`media-retention.ts`)
 */

/** 10 MB ต่อไฟล์ — เท่ากับเส้นอัปโหลดอื่นในระบบ พอสำหรับสแกนเอกสารหลายหน้า */
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/**
 * ชนิดไฟล์ที่รับ — **ต้องตรวจฝั่งเซิร์ฟเวอร์เสมอ** `accept` ของ `<input>`
 * เป็นแค่ตัวกรองในหน้าต่างเลือกไฟล์ ลากมาวางหรือยิง API ตรงยังผ่านมาได้
 *
 * **รูปภาพอย่างเดียว** (ตามคำสั่งเจ้าของงาน 1 ต.ค. 2026 — เลิกรับ PDF/Word)
 */
export const ALLOWED_DOC_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export const ALLOWED_DOC_LABEL = "รูปภาพ JPG · PNG · WebP";

export interface StoredDriverFile {
  fileId: string;
  /** key บน S3 — `mass-image/drivers/{code}/documents/{docType}/…` */
  key: string;
  name: string;
  type: string;
  size: number;
}

/** อัปไฟล์ขึ้น S3 แล้วคืนข้อมูลที่จะไปฝังใน `master_driver.documents` */
export async function saveDriverDocumentFile(
  file: File,
  drivercode: string,
  docType: string,
): Promise<StoredDriverFile> {
  const key = mediaKeys.driverDocument(drivercode, docType, file.type);
  await putMedia(key, file);

  return {
    /* id ในแฟ้ม = ชื่อไฟล์ท้าย key (`20261001-142233-a1b2c3`) — ไม่ซ้ำกันอยู่แล้ว
       และอ่านแล้วรู้ว่าแนบเมื่อไหร่ */
    fileId: key.slice(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, ""),
    key,
    name: file.name || "document",
    type: file.type || "application/octet-stream",
    size: file.size,
  };
}

/**
 * ลบตัวไฟล์ออกจาก S3 — **เรียกหลังถอดออกจาก `master_driver.documents` แล้วเท่านั้น**
 *
 * ลำดับนี้สำคัญ: ถอดชื่อออกจากแฟ้มก่อน แล้วค่อยลบไฟล์ · ถ้าลบไฟล์แล้วถอดชื่อ
 * ไม่สำเร็จ แฟ้มจะเหลือรายการที่กดเปิดแล้วไม่เจอไฟล์ ซึ่งคือหน้าจอโกหกว่ามีเอกสาร
 *
 * ไม่โยน — ไฟล์กำพร้าที่ลบไม่ติดคือขยะที่ไม่มีใครอ้างถึงและเปิดไม่ได้ (private)
 */
export async function deleteDriverDocumentFile(key: string): Promise<void> {
  if (!key) return;
  await deleteMedia(key).catch((err: unknown) => {
    console.warn("[driver-documents] ลบไฟล์บน S3 ไม่สำเร็จ —", key, err);
  });
}
