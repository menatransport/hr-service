import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fail, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { DRAFT_PREFIX, isMediaKey, THUMB_WIDTHS, type ThumbWidth } from "@/lib/media";
import { mediaThumb } from "@/lib/media-thumb";
import { presignMedia, readMedia, StorageError } from "@/lib/s3";

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
 *
 * **`?w=160|640` = รูปย่อ** (`lib/media-thumb.ts`) — ส่งตัวไฟล์ webp ไม่กี่ KB กลับตรง ๆ พร้อม
 * `immutable` 1 ปี (key ไม่มีวันเปลี่ยนเนื้อไฟล์) วงรูปในตารางจึงไม่ต้องโหลดรูปเต็ม และเปิดรอบหลังใช้ของในเครื่อง ·
 * ทำรูปย่อไม่ได้ (ไม่ใช่รูป/ไม่มีไฟล์) → ตกไปเด้งไปไฟล์จริงตามเดิม
 */
export async function GET(
  request: NextRequest,
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

    const width = Number(request.nextUrl.searchParams.get("w")) as ThumbWidth;
    if (THUMB_WIDTHS.includes(width) && !key.startsWith(DRAFT_PREFIX) && !key.includes("/_thumb/")) {
      const thumb = await mediaThumb(key, width).catch((err: unknown) => {
        console.warn("[media] ทำรูปย่อไม่สำเร็จ —", key, err);
        return null;
      });
      if (thumb) {
        return new NextResponse(Buffer.from(thumb), {
          headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
        });
      }
    }

    /* `?raw=1` = ส่งตัวไฟล์ผ่านเซิร์ฟเวอร์ (ต้นทางเดียวกัน) — ให้เบราว์เซอร์อ่านพิกเซลไป OCR ได้
       ไม่ติด CORS ของ bucket · รูปเท่านั้น (ปุ่ม “ดึงข้อความ” ในแท็บเอกสาร พจส.) */
    if (request.nextUrl.searchParams.get("raw") === "1" && !key.startsWith(DRAFT_PREFIX)) {
      const file = await readMedia(key);
      if (!file) return NextResponse.json({ error: "ไม่พบไฟล์ที่ระบุ" }, { status: 404 });
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: "ไฟล์นี้ไม่ใช่รูปภาพ" }, { status: 415 });
      }
      return new NextResponse(Buffer.from(file.body), {
        headers: { "Content-Type": file.type, "Cache-Control": "private, max-age=300" },
      });
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
