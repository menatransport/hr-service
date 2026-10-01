import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { getDriver, setDriverPhoto } from "@/app/recruitment/_lib/drivers/registry";
import { mediaUrl } from "@/lib/media";
import { mediaKeys, putMedia, StorageError } from "@/lib/s3";

/**
 * `PUT /api/drivers/{drivercode}/photo` — ตั้งรูปประจำตัว พจส. ในทะเบียนประวัติ
 *
 * ส่งเป็น `multipart/form-data` ฟิลด์ `file` (รูปจัตุรัสที่ครอปแล้วจาก `AvatarCropper`)
 * ทำสามขั้นแบบเดียวกับ `PUT /api/employees/{id}/photo`:
 *
 * 1. ตรวจว่ามีรหัสนี้ในทะเบียนจริง — ผิดรหัสจะได้ไม่ทิ้งไฟล์ขยะไว้บน bucket
 * 2. อัปไฟล์ขึ้น S3 แบบ private ที่ `mass-image/drivers/{drivercode}/avatar/` (`lib/s3.ts`)
 * 3. `$set` ลิงก์ `/api/media/{key}` ลง `hr_service.master_driver` แล้ว **อ่านกลับมาตรวจ**
 *    (รูปเก่าบน S3 ถูกลบตามใน `setDriverPhoto()`)
 *
 * **เขียนลง `master_driver` เท่านั้น ไม่แตะ `Boom_ETL`** — และเพราะ
 * `sync_master_driver.mjs` เขียนด้วย `$set` เฉพาะฟิลด์ของ ETL รูปที่บันทึกไว้
 * จึงอยู่รอดข้ามรอบ sync (ดูคอมเมนต์หัวสคริปต์นั้นกับ `lib/drivers/registry.ts`)
 *
 * ผู้บันทึกมาจาก session ฝั่งเซิร์ฟเวอร์เสมอ **ไม่รับจาก client** — ไม่งั้นใครยิง
 * API ตรงก็อ้างเป็นคนอื่นได้
 */

/** ขีดจำกัดเดียวกับเส้นอัปโหลดอื่นในระบบ — ของที่ครอปแล้วจะเล็กกว่านี้มาก */
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png"];

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/photo">,
) {
  try {
    const { code } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์รูปที่ส่งมา");
    if (!ALLOWED_TYPES.includes(file.type)) return badRequest("ใช้ได้เฉพาะไฟล์ JPG / PNG");
    if (file.size > MAX_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB`);

    const driver = await getDriver(drivercode);
    if (!driver) {
      return NextResponse.json(
        { error: `ไม่พบรหัส ${drivercode} ในทะเบียนประวัติ` },
        { status: 404 },
      );
    }

    const url = mediaUrl(mediaKeys.driverAvatar(drivercode, file.type));
    await putMedia(url.slice("/api/media/".length), file);
    const saved = await setDriverPhoto(drivercode, url, await getActorEmployeeId());

    if (!saved) {
      return NextResponse.json(
        {
          error:
            "อัปโหลดรูปสำเร็จ แต่บันทึกลงทะเบียนประวัติไม่ติด — ลองใหม่อีกครั้ง",
          url,
        },
        { status: 502 },
      );
    }

    return ok({ photoUrl: saved });
  } catch (err) {
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
