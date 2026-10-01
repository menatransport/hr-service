import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { getApplication } from "@/app/recruitment/_lib/applications";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import { mediaUrl } from "@/lib/media";
import { mediaKeys, putMedia } from "@/lib/s3";

/**
 * `POST /api/recruitment/applications/{id}/files` — ฝ่ายบุคคลอัปรูปเอกสารแทนผู้สมัคร
 * (กล่อง “เอกสารและข้อมูล”) → `{ url }` ใน `mass-image/applications/{ref}/{slot}/`
 *
 * **อัปอย่างเดียว ยังไม่ผูกเข้าใบ** — หน้าจอเอา `url` ไปส่งต่อใน `PATCH …/{id}` ช่อง
 * `files` เหมือนเดิม (ซึ่งรับเฉพาะไฟล์ในโฟลเดอร์ของใบนั้น) · ไฟล์เดิมของช่องที่ถูกแทนถูก
 * ลบตอน `PATCH` บันทึกผ่าน · กดอัปแล้วไม่กดบันทึก = ไฟล์ค้างหนึ่งไฟล์ในโฟลเดอร์ของใบ
 * นั้นเอง (ไม่หลุดไปที่อื่น และถูกลบพร้อมโฟลเดอร์ถ้าผู้สมัครยกเลิก)
 */

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await editor())) return unauthorized();
    const { id } = await params;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const slot = String(form?.get("slot") ?? "").trim();

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ที่แนบมา");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequest("แนบได้เฉพาะรูปภาพ JPG / PNG / WebP");
    if (file.size > MAX_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB — ย่อรูปก่อนแล้วลองใหม่`);

    const application = await getApplication(id);
    if (!application) {
      return NextResponse.json({ error: "ไม่พบใบสมัครนี้" }, { status: 404 });
    }
    if (application.erased) return badRequest("ใบนี้ถูกลบข้อมูลตามคำขอของผู้สมัครแล้ว");
    if (!(await listDocSlots()).some((s) => s.id === slot) && !application.files.some((f) => f.slot === slot)) {
      return badRequest("ไม่พบช่องเอกสารที่ระบุ");
    }

    const key = mediaKeys.applicationFile(application.ref, slot, file.type);
    await putMedia(key, file);
    return ok({ url: mediaUrl(key) });
  } catch (err) {
    return failRecruitment(err);
  }
}
