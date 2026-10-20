import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { importPastedRows, PasteImportError } from "@/app/recruitment/_lib/drivers/paste-import";

/**
 * `POST /api/drivers/paste-import` — วางแถวที่คัดลอกจากชีต “ทะเบียน 2026” แล้วนำเข้าทะเบียน พจส.
 *
 * ```
 * { "text": "<ข้อความคั่นแท็บที่คัดลอกจาก Excel/Google Sheets>", "commit": false }
 * ```
 *
 * `commit: false` = ตรวจอย่างเดียว ไม่เขียน · `true` = นำเข้าจริง — ทั้งสองคืน `PasteImportReport`
 * แบบเดียวกัน กติกาอยู่ที่ `_lib/drivers/paste-import.ts`
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 5_000_000;

export async function POST(request: NextRequest) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");

    const body = (await request.json().catch(() => null)) as { text?: unknown; commit?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";
    if (!text.trim()) return badRequest("ไม่มีข้อมูลที่วาง");
    if (text.length > MAX_CHARS) return badRequest("ข้อมูลที่วางยาวเกินไป — แบ่งวางทีละช่วง");

    const report = await importPastedRows(text, body?.commit === true, user.name || user.employeeId);
    return ok(report);
  } catch (err) {
    if (err instanceof PasteImportError) return badRequest(err.message);
    return fail(err);
  }
}
