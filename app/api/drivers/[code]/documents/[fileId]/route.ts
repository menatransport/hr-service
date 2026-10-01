import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import {
  detachDriverDocument,
  DriverRegistryError,
  getDriverDocument,
} from "@/app/recruitment/_lib/drivers/registry";
import { presignMedia, StorageError } from "@/lib/s3";

/**
 * เอกสารใบเดียวในแฟ้มประวัติ พจส.
 *
 * - `GET /api/drivers/{drivercode}/documents/{fileId}` — เปิด/ดาวน์โหลดไฟล์
 * - `DELETE` เส้นเดียวกัน — ถอดออกจากแฟ้มแล้วลบตัวไฟล์ตามไปด้วย
 *
 * **`GET` บังคับล็อกอินเอง** เพราะ `proxy.ts` ปล่อย `GET` ใต้ `/api/**` ผ่านหมด
 * (แบบเดียวกับ `/api/record-cases/files/{id}`) — เอกสารชุดนี้คือสำเนาบัตรประชาชน
 * ทะเบียนบ้าน หน้าสมุดบัญชี และสัญญาจ้างของคนจริง ลิงก์เปล่า ๆ เปิดได้ไม่ได้เด็ดขาด
 *
 * **และตรวจซ้ำว่าไฟล์นั้นอยู่ในแฟ้มของรหัสที่ขอจริง** ไม่ใช่แค่ว่ามีไฟล์ id นี้อยู่ —
 * ไม่งั้นใครที่มี id ของไฟล์ใครก็ตามจะยัดใส่ path ของคนอื่นแล้วเปิดได้ และ id ที่
 * หลุดจากแฟ้มหนึ่งจะกลายเป็นกุญแจของทั้ง bucket
 *
 * ผ่านแล้ว **เด้ง 302 ไปลิงก์ presigned ของ S3 อายุ 10 นาที** (ไฟล์ใน bucket เป็น private)
 * · `Cache-Control: private` สั้นกว่าอายุลิงก์ กัน CDN/พร็อกซีเก็บลิงก์ไว้แจกต่อ
 */

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/documents/[fileId]">,
) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const { code, fileId } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const entry = await getDriverDocument(drivercode, fileId);
    if (!entry) return NextResponse.json({ error: "ไม่พบเอกสารที่ระบุ" }, { status: 404 });

    if (!entry.key) {
      /* รายการสมัย GridFS ที่ไม่มี key — ตอนย้ายไม่มีเหลือแล้ว ถ้าเจอคือข้อมูลไม่ตรงกันเอง
         บอกให้ตรงแบบนั้น จะได้ไม่ไปตามหาไฟล์ที่ไม่มีวันเจอ */
      return NextResponse.json(
        { error: "รายการนี้อยู่ในแฟ้ม แต่ไม่มีไฟล์ในที่เก็บ — ลบรายการแล้วแนบใหม่" },
        { status: 404 },
      );
    }

    return NextResponse.redirect(await presignMedia(entry.key), {
      status: 302,
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    if (err instanceof StorageError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/drivers/[code]/documents/[fileId]">,
) {
  try {
    const { code, fileId } = await ctx.params;
    const drivercode = decodeURIComponent(code);

    const documents = await detachDriverDocument(drivercode, fileId);
    if (!documents) {
      return NextResponse.json(
        { error: "ไม่พบเอกสารใบนี้ในแฟ้มของรหัสนี้ — อาจถูกลบไปแล้ว" },
        { status: 404 },
      );
    }

    return NextResponse.json({ documents });
  } catch (err) {
    if (err instanceof DriverRegistryError) return badRequest(err.message);
    return fail(err);
  }
}
