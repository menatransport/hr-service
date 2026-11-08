import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { getDriver, setDriverPhoto } from "@/app/recruitment/_lib/drivers/registry";
import { linkedApplicationId } from "@/app/recruitment/_lib/drivers/portrait";
import { getApplication, updateApplication } from "@/app/recruitment/_lib/applications";
import { editor, failRecruitment } from "@/app/api/recruitment/_lib";
import { mediaUrl } from "@/lib/media";
import { mediaKeys, putMedia } from "@/lib/s3";
import { registryWriteDenied } from "@/app/api/drivers/_lib/guard";

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
 * **คนที่มีใบสมัคร = เปลี่ยนรูปถ่ายหน้าตรงในใบนั้นแทน** (Bew 8 พ.ย. 2569) — รูปโปรไฟล์คือรูปหน้าตรง
 * ที่เดียว (`drivers/portrait.ts`) หน้าผู้สมัครกับทะเบียนจึงเห็นรูปใหม่พร้อมกัน · ไฟล์ไปอยู่โฟลเดอร์ของใบ
 * (`mass-image/applications/{ref}/portrait/`) และบันทึกผ่าน `updateApplication()` ซึ่งลบไฟล์เดิมและลงไทม์ไลน์ให้
 *
 * **เขียนลง `master_driver` เท่านั้น ไม่แตะ `Boom_ETL`** — ETL ไม่เคยเขียนที่นี่
 * รูปที่บันทึกไว้จึงไม่มีทางถูกทับ (ดู `app/recruitment/_lib/drivers/master.ts`)
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
    const denied = await registryWriteDenied();
    if (denied) return denied;

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

    const applicationId = await linkedApplicationId(drivercode, driver.nationalId);
    const application = applicationId ? await getApplication(applicationId) : null;
    if (application) {
      const key = mediaKeys.applicationFile(application.ref, "portrait", file.type);
      await putMedia(key, file);
      const by = (await editor()) ?? (await getActorEmployeeId());
      const next = await updateApplication(application.id, { files: { portrait: mediaUrl(key) } }, by);
      return ok({ photoUrl: next.files.find((f) => f.slot === "portrait")?.url ?? null });
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
    /* ใบสมัครแก้ไม่ได้ (เช่น ถูกลบตามคำขอระหว่างทาง) = 400 พร้อมข้อความ · S3 ล่ม = ข้อความจริง */
    return failRecruitment(err);
  }
}
