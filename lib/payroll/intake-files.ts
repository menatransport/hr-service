import type { Readable } from "node:stream";

import { GridFSBucket, ObjectId } from "mongodb";

import { getDb } from "../mongo";
import { MAX_INTAKE_FILE_BYTES, XLSX_TYPE } from "./intake-upload";

/**
 * ไฟล์ที่ฝ่ายส่งเข้ามาในแต่ละรอบ — เก็บใน **GridFS** ไม่ได้ขึ้น Spaces
 *
 * presign API ของบริษัทมี allow-list เป็นนามสกุลรูปเท่านั้น (`lib/record-files.ts`
 * บันทึกการทดลองไว้ 19 ส.ค. 2569) ยิง `.xlsx` ไปจะได้ 400 · และไฟล์พวกนี้
 * **ต้องไม่เป็นสาธารณะ** เพราะในไฟล์มีรหัสพนักงานกับยอดเงินรายคน ลิงก์ Spaces
 * ที่ใครมีลิงก์ก็เปิดได้จึงไม่เหมาะตั้งแต่ต้น
 *
 * **เก็บไฟล์ไว้เพราะ HR ต้องย้อนดูได้ว่าอะไรผ่านไปแล้ว** — ของเดิมบันทึกแค่ชื่อไฟล์
 * ซึ่งแปลว่าหลังปิดรอบไม่มีใครตรวจซ้ำได้ว่าเงินที่จ่ายมาจากไฟล์หน้าตาแบบไหน
 *
 * **ฝั่งเซิร์ฟเวอร์เท่านั้น และไม่รู้จัก HTTP** — กติกาตรวจคำขออยู่ที่ `intake-upload.ts`
 */
const BUCKET = "payroll_intake_files";

export { MAX_INTAKE_FILE_BYTES, XLSX_TYPE };

export interface StoredIntakeFile {
  fileId: string;
  name: string;
  size: number;
}

export interface IntakeFileInfo {
  name: string;
  type: string;
  /** รายการ (itemId) ที่ไฟล์นี้ถูกส่งมา — route ใช้เทียบกับขอบเขตของผู้เปิด */
  itemId: string;
}

async function bucket(): Promise<GridFSBucket> {
  return new GridFSBucket(await getDb(), { bucketName: BUCKET });
}

export async function saveIntakeFile(
  file: File,
  meta: { period: string; itemId: string; uploadedBy: string },
): Promise<StoredIntakeFile> {
  const data = Buffer.from(await file.arrayBuffer());
  const gfs = await bucket();
  const upload = gfs.openUploadStream(file.name, {
    metadata: { ...meta, contentType: XLSX_TYPE, uploadedAt: new Date().toISOString() },
  });
  await new Promise<void>((resolve, reject) => {
    upload.on("finish", () => resolve());
    upload.on("error", (err) => {
      /* ทิ้งชิ้นส่วนที่เขียนไปแล้ว ไม่ให้ chunks กำพร้าค้างใน bucket */
      upload.abort().catch(() => {}).finally(() => reject(err));
    });
    upload.end(data);
  });
  return { fileId: upload.id.toHexString(), name: file.name, size: data.byteLength };
}

/** อ่านเฉพาะข้อมูลไฟล์ (ยังไม่เปิดสตรีม) — `null` เมื่อรหัสไม่ถูกรูปแบบหรือไม่มีไฟล์นั้น */
export async function findIntakeFile(fileId: string): Promise<IntakeFileInfo | null> {
  if (!ObjectId.isValid(fileId)) return null;
  const gfs = await bucket();
  const [meta] = await gfs.find({ _id: new ObjectId(fileId) }, { limit: 1 }).toArray();
  if (!meta) return null;
  const itemId = (meta.metadata as { itemId?: unknown } | undefined)?.itemId;
  return {
    name: meta.filename,
    type: XLSX_TYPE,
    itemId: typeof itemId === "string" ? itemId : "",
  };
}

/** เปิดสตรีมดาวน์โหลด — เรียกหลังตรวจสิทธิ์จาก `findIntakeFile` แล้วเท่านั้น */
export async function openIntakeStream(fileId: string): Promise<Readable> {
  const gfs = await bucket();
  return gfs.openDownloadStream(new ObjectId(fileId));
}
