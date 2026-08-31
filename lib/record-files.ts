import { GridFSBucket, ObjectId } from "mongodb";
import type { GridFSFile } from "mongodb";

import { getDb } from "./mongo";

/**
 * ไฟล์แนบของบันทึกเคส — เก็บใน **MongoDB GridFS** ไม่ได้ขึ้น Spaces
 *
 * ทำไมไม่ใช้ที่เดียวกับไฟล์แนบของคำร้อง พจส.: presign API ของบริษัท
 * (`lib/uploads.ts`) มี allow-list เป็น **นามสกุลรูปเท่านั้น** —
 * `.jpg .jpeg .png .webp .gif .bmp .tif .tiff .heic .heif .avif` —
 * ยิง `.pdf` ไปจะได้ 400 `extension not allowed` (ยิงทดสอบยืนยันแล้ว 19 ส.ค. 2026)
 * ซึ่งแก้ที่ฝั่งเราไม่ได้ แต่บันทึกเคส **ต้องแนบเอกสารได้** ตามที่เจ้าของงานสั่ง
 *
 * เก็บใน Mongo ที่เดียวกับตัวเคสจึงได้สามอย่างมาฟรี:
 * 1. เอกสารทุกนามสกุลผ่าน ไม่ต้องรอใครเปิด allow-list ให้
 * 2. **ไฟล์ไม่เป็นสาธารณะ** — ต้องมี session ถึงจะเปิดได้ (ต่างจากลิงก์ Spaces
 *    ที่ใครมีลิงก์ก็เปิดได้) ซึ่งเหมาะกว่าเพราะบันทึกเคสมีเรื่องพนักงาน
 * 3. ลบเคสทีเดียวไฟล์ตามไปได้ ไม่มีขยะค้างบน bucket
 *
 * แลกมาด้วยไฟล์กินพื้นที่ฐานข้อมูล จึงจำกัดขนาดไว้ที่ `MAX_FILE_BYTES`
 * และรูปถูกย่อจากฝั่งเบราว์เซอร์มาก่อนแล้ว (`lib/image-resize.ts`)
 *
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น** — เบราว์เซอร์คุยผ่าน `/api/record-cases/attachments`
 * (อัป) และ `/api/record-cases/files/{id}` (เปิด/ดาวน์โหลด)
 */

const BUCKET = "record_attachments";

/** 10 MB ต่อไฟล์ — ใหญ่พอสำหรับสแกนเอกสารหลายหน้า แต่ยังไม่ทำให้ฐานข้อมูลบวม */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** ไฟล์ที่อัปก่อนย้ายมาเก็บชนิดใน `metadata` อาจยังมี `contentType` ระดับบนสุด */
function contentTypeOf(meta: GridFSFile): string {
  const fromMeta = (meta.metadata as { contentType?: unknown } | undefined)?.contentType;
  return typeof fromMeta === "string" && fromMeta ? fromMeta : "application/octet-stream";
}

async function bucket(): Promise<GridFSBucket> {
  return new GridFSBucket(await getDb(), { bucketName: BUCKET });
}

export interface StoredFile {
  fileId: string;
  name: string;
  type: string;
  size: number;
}

/** เก็บไฟล์ลง GridFS แล้วคืนข้อมูลที่จะไปฝังในเอกสารเคส */
export async function saveRecordFile(file: File): Promise<StoredFile> {
  const gfs = await bucket();
  const buffer = Buffer.from(await file.arrayBuffer());

  /* ชนิดไฟล์ไปอยู่ใน `metadata` — driver v7 ถอด `contentType` ออกจาก options แล้ว */
  const stream = gfs.openUploadStream(file.name || "attachment", {
    metadata: { contentType: file.type || "application/octet-stream" },
  });

  await new Promise<void>((resolve, reject) => {
    stream.on("error", reject);
    stream.on("finish", () => resolve());
    stream.end(buffer);
  });

  return {
    fileId: stream.id.toHexString(),
    name: file.name || "attachment",
    type: file.type || "application/octet-stream",
    size: buffer.length,
  };
}

/** ไฟล์นี้มีอยู่จริงไหม — ใช้ตอนตรวจ payload ก่อนบันทึกเคส */
export async function recordFileExists(fileId: string): Promise<boolean> {
  if (!ObjectId.isValid(fileId)) return false;
  const gfs = await bucket();
  const [found] = await gfs.find({ _id: new ObjectId(fileId) }, { limit: 1 }).toArray();
  return Boolean(found);
}

export interface OpenedFile {
  name: string;
  contentType: string;
  size: number;
  stream: NodeJS.ReadableStream;
}

/** เปิดไฟล์เพื่อส่งต่อให้เบราว์เซอร์ — `null` เมื่อไม่มีไฟล์นั้น */
export async function openRecordFile(fileId: string): Promise<OpenedFile | null> {
  if (!ObjectId.isValid(fileId)) return null;
  const gfs = await bucket();
  const id = new ObjectId(fileId);

  const [meta] = await gfs.find({ _id: id }, { limit: 1 }).toArray();
  if (!meta) return null;

  return {
    name: meta.filename || "attachment",
    contentType: contentTypeOf(meta),
    size: meta.length,
    stream: gfs.openDownloadStream(id),
  };
}
