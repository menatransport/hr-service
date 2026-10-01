import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fail, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { DRAFT_PREFIX, isMediaKey } from "@/lib/media";
import { presignMedia, StorageError } from "@/lib/s3";

/**
 * `GET /api/media/{key}` — เปิดไฟล์ใต้ `mass-image/` บน S3 (ลิงก์ที่เก็บในฐานทุกช่อง)
 *
 * ตรวจสิทธิ์แล้ว **เด้ง 302 ไปลิงก์ presigned อายุ 10 นาที** — ไม่ส่งตัวไฟล์ผ่านเซิร์ฟเวอร์
 * ของเรา `<img>` จึงโหลดตรงจาก bucket · ลิงก์ในฐานไม่มีวันหมดอายุ เพราะทุกครั้งที่เปิด
 * ได้ลิงก์ใหม่ (`Cache-Control` 5 นาที สั้นกว่าอายุลิงก์ เบราว์เซอร์จะไม่จำลิงก์ที่หมดแล้ว)
 *
 * **ต้องล็อกอิน** (`proxy.ts` ปล่อย `GET` ใต้ `/api/**` ผ่านหมด จึงตรวจเองที่นี่) ยกเว้น
 * ไฟล์ร่างของผู้สมัคร (`_drafts/`) — ผู้สมัครไม่มีบัญชี แต่ต้องเห็นรูปที่เพิ่งอัปในฟอร์ม ·
 * กุญแจของไฟล์ร่างคือ `draftId` แบบสุ่ม 122 บิตในตัวลิงก์ และไฟล์ร่างหายเองใน 1 วัน
 */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/media/[...key]">,
) {
  try {
    const { key: parts } = await ctx.params;
    const key = parts.map((p) => decodeURIComponent(p)).join("/");

    if (!isMediaKey(key)) {
      return NextResponse.json({ error: "ไม่พบไฟล์ที่ระบุ" }, { status: 404 });
    }
    if (!key.startsWith(DRAFT_PREFIX) && !(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const url = await presignMedia(key);
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
