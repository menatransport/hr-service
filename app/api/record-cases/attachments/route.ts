import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { actor, failRecord, unauthorized } from "@/app/api/record-cases/_lib";
import { MAX_FILE_BYTES, saveRecordFile } from "@/lib/record-files";

/**
 * `POST /api/record-cases/attachments` — เก็บไฟล์แนบของบันทึกเคสลง MongoDB (GridFS)
 * แล้วคืน `{ fileId, name, type, size }` ให้ฟอร์มถือไว้ส่งตอนกดบันทึกเคส
 *
 * **ไม่ได้ขึ้น Spaces เหมือนไฟล์แนบของคำร้อง พจส.** — presign API รับเฉพาะนามสกุลรูป
 * เอกสาร PDF/Word/Excel จึงอัปไม่ได้เลย (เหตุผลเต็มอยู่ใน `lib/record-files.ts`)
 *
 * อัปทันทีที่เลือกไฟล์ ไม่รอกดบันทึก — ปุ่มบันทึกจึงไม่ต้องค้างรออัปโหลด
 * ผลข้างเคียงที่ยอมรับไว้แล้วคือ ปิดฟอร์มทิ้งกลางคันจะมีไฟล์ค้างใน GridFS
 * ที่ไม่มีเคสไหนอ้างถึง (เปิดไม่ได้ถ้าไม่รู้ id และเก็บกวาดทีหลังได้)
 */

/**
 * ชนิดไฟล์ที่รับ — ต้องเช็คฝั่งเซิร์ฟเวอร์ด้วยเสมอ เพราะ `accept` ของ `<input>`
 * เป็นแค่ตัวกรองในหน้าต่างเลือกไฟล์ ลากมาวางหรือยิง API ตรงยังผ่านมาได้
 */
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

export async function POST(request: NextRequest) {
  try {
    if (!(await actor())) return unauthorized();

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");
    if (!ALLOWED.has(file.type))
      return badRequest(
        "แนบได้เฉพาะรูปภาพ (JPG/PNG/WebP) และเอกสาร PDF · Word · Excel · CSV · TXT",
      );
    if (file.size > MAX_FILE_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_FILE_BYTES / 1024 / 1024} MB`);

    return ok(await saveRecordFile(file));
  } catch (err) {
    return failRecord(err);
  }
}
