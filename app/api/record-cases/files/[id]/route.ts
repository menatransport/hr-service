import { Readable } from "node:stream";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { actor, failRecord, unauthorized } from "@/app/api/record-cases/_lib";
import { openRecordFile } from "@/lib/record-files";

/**
 * `GET /api/record-cases/files/{id}` — ส่งไฟล์แนบของบันทึกเคสออกจาก GridFS
 *
 * **เส้นนี้บังคับล็อกอินเอง** เพราะ `proxy.ts` ปล่อย `GET` ผ่านหมด (แบบเดียวกับ
 * `/api/cases/export`) — ไฟล์แนบบันทึกเคสมีเรื่องพนักงานอยู่ในนั้น ปล่อยให้ใครก็เปิด
 * ได้ด้วยลิงก์เปล่า ๆ ไม่ได้ · นี่คือข้อได้เปรียบของการเก็บใน Mongo แทน Spaces
 * ซึ่งไฟล์ต้องเป็น public-read ถึงจะแสดงในหน้าเว็บได้
 *
 * `inline` เพื่อให้รูปกับ PDF เปิดดูในแท็บใหม่ได้เลย ไม่ต้องดาวน์โหลดก่อน ·
 * `Cache-Control: private` กัน CDN/พร็อกซีระหว่างทางเก็บไฟล์ไว้แจกต่อ
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!(await actor())) return unauthorized();

    const { id } = await params;
    const file = await openRecordFile(id);
    if (!file) return NextResponse.json({ error: "ไม่พบไฟล์ที่ระบุ" }, { status: 404 });

    /* ชื่อไฟล์ไทยต้องไปทาง `filename*` (RFC 5987) — `filename=` เปล่า ๆ รับได้แค่ ASCII */
    const name = encodeURIComponent(file.name);

    return new NextResponse(Readable.toWeb(file.stream as Readable) as ReadableStream, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(file.size),
        "Content-Disposition": `inline; filename*=UTF-8''${name}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return failRecord(err);
  }
}
