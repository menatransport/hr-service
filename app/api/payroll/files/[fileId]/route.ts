import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { forbidden, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { findIntakeFile, openIntakeStream } from "@/lib/payroll/intake-files";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `GET /api/payroll/files/{fileId}` — เปิดไฟล์ที่ส่งเข้ามาแล้ว
 *
 * **ต้องล็อกอิน และต้องอยู่ในขอบเขตฝ่ายของตัวเอง** — `proxy.ts` ปล่อย `GET` ผ่านหมด
 * และไฟล์พวกนี้มีรหัสพนักงานกับยอดเงินรายคน ลำพังการเดา `fileId` ไม่ควรพอที่จะเปิดได้
 * ตรวจสิทธิ์จากข้อมูลไฟล์ก่อน แล้วค่อยเปิดสตรีม — คนที่ไม่มีสิทธิ์จะไม่ทำให้อ่านไฟล์ออกจาก Mongo
 *
 * ข้อผิดพลาดจากฐานข้อมูลตอบข้อความกลาง ๆ ไม่ส่ง `err.message` ของ driver ออกไป
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ fileId: string }> },
) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }
    const { fileId } = await ctx.params;
    const found = await findIntakeFile(fileId);
    if (!found) return NextResponse.json({ error: "ไม่พบไฟล์นี้" }, { status: 404 });

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, found.itemId)) {
      return forbidden("ไฟล์นี้เป็นของฝ่ายอื่น");
    }

    const stream = await openIntakeStream(fileId);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "content-type": found.type,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.name)}`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[api] payroll file download", err);
    return NextResponse.json(
      { error: "เปิดไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ" },
      { status: 500 },
    );
  }
}
