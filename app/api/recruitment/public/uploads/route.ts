import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { failRecruitment } from "@/app/api/recruitment/_lib";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import { mediaUrl } from "@/lib/media";
import { mediaKeys, putMedia } from "@/lib/s3";

/**
 * `POST /api/recruitment/public/uploads` — ผู้สมัครอัปรูปเอกสารระหว่างกรอกฟอร์ม (ไม่ต้องล็อกอิน)
 *
 * `multipart/form-data`: `file` · `draftId` (UUID ที่ฟอร์มสุ่มไว้ตอนเริ่มกรอก) · `slot`
 * (ช่องเอกสารใน Section 4) → `{ url }` เป็นลิงก์ `/api/media/…` ของ **ไฟล์ร่าง**
 * `mass-image/applications/_drafts/{draftId}/{slot}/…`
 *
 * ไฟล์ร่างถูกย้ายเข้าโฟลเดอร์ใบสมัครตอนกดส่ง (`createApplication()`) · ไม่กดส่ง =
 * lifecycle ของ bucket ลบทิ้งเองใน 1 วัน (`setup_media_lifecycle.mjs`)
 *
 * แยกจาก `/api/uploads` (รูปแนบคำร้อง → Spaces สาธารณะ) เพราะเอกสารผู้สมัครคือสำเนา
 * บัตรประชาชน/ใบขับขี่ ต้องเป็น private
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const draftId = String(form?.get("draftId") ?? "").trim();
    const slot = String(form?.get("slot") ?? "").trim();

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequest("แนบได้เฉพาะรูปภาพ JPG / PNG / WebP");
    if (file.size > MAX_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB — ย่อรูปก่อนแล้วลองใหม่`);
    if (!UUID.test(draftId)) return badRequest("ฟอร์มไม่ได้ส่งรหัสร่างมา — โหลดหน้าใหม่แล้วลองอีกครั้ง");

    /* ช่องต้องมีอยู่จริงและเปิดแสดง — กันคนนอกสร้างโฟลเดอร์ชื่ออะไรก็ได้ใน bucket */
    const slots = await listDocSlots();
    if (!slots.some((s) => s.id === slot && s.visible)) return badRequest("ไม่พบช่องเอกสารที่ระบุ");

    const key = mediaKeys.applicationDraft(draftId, slot, file.type);
    await putMedia(key, file);
    return ok({ url: mediaUrl(key) });
  } catch (err) {
    return failRecruitment(err);
  }
}
