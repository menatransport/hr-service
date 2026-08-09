import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getUser, updateUser } from "@/lib/ncac/client";
import type { UserUpdate } from "@/lib/ncac/types";
import { UploadError, uploadImage } from "@/lib/uploads";

/**
 * `PUT /api/employees/{employee_id}/photo` — ตั้งรูปโปรไฟล์พนักงาน
 *
 * ส่งเป็น `multipart/form-data` ฟิลด์ `file` (รูปสี่เหลี่ยมจัตุรัสที่ครอปมาแล้ว
 * จาก `AvatarCropper`) · ทำสามขั้น:
 *
 * 1. อัปไฟล์ขึ้น Spaces ผ่าน `uploadImage()` → ได้ URL สาธารณะ
 * 2. `PUT /users/{employee_id}` ที่ NCAC พร้อม **ค่าปัจจุบันครบทุกช่อง** + `image_url`
 * 3. **อ่านกลับมาตรวจ** ว่า `image_url` ติดจริงไหม แล้วคืนค่าที่อ่านได้ ไม่ใช่ค่าที่ส่งไป
 *
 * ขั้นที่ 3 ไม่ใช่พิธีกรรม — `image_url` **ไม่ได้ถูกประกาศไว้ใน `/openapi.json`**
 * (ทั้งใน `UserResponse` และ `UserUpdate`) ทั้งที่ของจริงรับและคืนค่าปกติ
 * แปลว่า spec กับของจริงไม่ตรงกัน · ถ้าวันหนึ่ง backend เปลี่ยนแล้วเริ่มทิ้ง
 * ฟิลด์นี้เงียบ ๆ FastAPI จะยังตอบ 200 เหมือนสำเร็จ การอ่านกลับมาตรวจคือสิ่งเดียว
 * ที่กันไม่ให้หน้าจอขึ้นว่า “บันทึกรูปแล้ว” ทั้งที่ไม่มีอะไรถูกบันทึก
 *
 * ทดสอบเส้นนี้จริงกับบัญชี `test_id` แล้ว (7 ส.ค. 2026) — บันทึกติดและอ่านกลับได้
 * ทั้งจาก `/users/{id}` และ `/users` แล้วคืนค่าบัญชีทดสอบกลับเป็น `null` ตามเดิม
 */

/** ขีดจำกัดเดียวกับ `POST /api/uploads` — ของที่ครอปแล้วจะเล็กกว่านี้มาก */
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = ["image/jpeg", "image/png"];

/** ค่าปัจจุบันทุกช่องที่ `UserUpdate` รับได้ — ส่งไปครบเพื่อไม่ให้ข้อมูลเดิมหาย */
function currentFields(user: Awaited<ReturnType<typeof getUser>>): UserUpdate {
  return {
    username: user.username ?? null,
    employee_id: String(user.employee_id),
    department_id: user.department_id ?? null,
    site_id: user.site_id ?? null,
    position_id: user.position_id ?? null,
    email: user.email ?? null,
    employee_status: user.employee_status ?? null,
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
  };
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/employees/[id]/photo">,
) {
  try {
    const { id } = await ctx.params;
    const employeeId = decodeURIComponent(id);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์รูปที่ส่งมา");
    if (!ALLOWED_TYPES.includes(file.type))
      return badRequest("ใช้ได้เฉพาะไฟล์ JPG / PNG");
    if (file.size > MAX_BYTES)
      return badRequest(`ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB`);

    // อ่านก่อนอัป — ถ้ารหัสพนักงานผิด จะได้ไม่ทิ้งไฟล์ขยะไว้บน bucket
    const before = await getUser(employeeId);

    const url = await uploadImage(file, "employees");
    await updateUser(employeeId, { ...currentFields(before), image_url: url });

    const after = await getUser(employeeId);
    if (!after.image_url?.trim()) {
      return NextResponse.json(
        {
          error:
            "อัปโหลดรูปสำเร็จ แต่ NCAC ไม่ได้บันทึกรูปไว้กับพนักงานคนนี้ — ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งฝ่าย backend ว่า PUT /users ไม่รับ image_url",
          url,
        },
        { status: 502 },
      );
    }

    return ok({ imageUrl: after.image_url });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
