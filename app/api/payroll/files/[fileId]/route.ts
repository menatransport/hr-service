import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { fail, forbidden, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { openIntakeFile } from "@/lib/payroll/intake-files";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `GET /api/payroll/files/{fileId}` — เปิดไฟล์ที่ส่งเข้ามาแล้ว
 *
 * **ต้องล็อกอิน และต้องอยู่ในขอบเขตฝ่ายของตัวเอง** — `proxy.ts` ปล่อย `GET` ผ่านหมด
 * และไฟล์พวกนี้มีรหัสพนักงานกับยอดเงินรายคน ลำพังการเดา `fileId` ไม่ควรพอที่จะเปิดได้
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
    const found = await openIntakeFile(fileId);
    if (!found) return NextResponse.json({ error: "ไม่พบไฟล์นี้" }, { status: 404 });

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, found.itemId)) {
      /* ปล่อยสตรีม GridFS ทิ้งก่อนตอบ ไม่งั้นค้างอยู่ */
      found.stream.resume();
      return forbidden("ไฟล์นี้เป็นของฝ่ายอื่น");
    }

    return new NextResponse(Readable.toWeb(found.stream) as ReadableStream, {
      headers: {
        "content-type": found.type,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(found.name)}`,
      },
    });
  } catch (err) {
    return fail(err);
  }
}
