import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { UploadError, uploadImage } from "@/lib/uploads";

/**
 * `POST /api/uploads` — รับไฟล์รูปจากหน้าจอ แล้วคืน URL สาธารณะ
 *
 * ส่งเป็น `multipart/form-data` ฟิลด์ `file` · ตอบ `{ url }` ซึ่งเอาไปใส่
 * `imageUrl` ตอนสร้างเคส (`POST /api/cases` → `complaint_url` ของ NCAC)
 */

/** ขีดจำกัดฝั่งเรา — รูปจากมือถือรุ่นใหม่อยู่ราว 3–6 MB */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * รับแค่ JPG / PNG — ต้องเช็คซ้ำฝั่งนี้ด้วย เพราะ `accept` ของ `<input>` เป็นแค่
 * ตัวกรองในหน้าต่างเลือกไฟล์ ลากไฟล์มาวางหรือยิง API ตรง ๆ ยังผ่านมาได้
 */
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");
    if (!ALLOWED_TYPES.includes(file.type))
      return badRequest("แนบได้เฉพาะไฟล์ JPG / PNG");
    if (file.size > MAX_BYTES)
      return badRequest(
        `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB — ย่อรูปก่อนแล้วลองใหม่`,
      );

    return ok({ url: await uploadImage(file) });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
