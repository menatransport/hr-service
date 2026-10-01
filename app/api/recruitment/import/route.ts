import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { commitImport, previewImport } from "@/app/recruitment/_lib/form-import";

/**
 * `POST /api/recruitment/import` — นำเข้าใบสมัครจากไฟล์ Excel ของ Google Form เก่า
 * (ชีต “การตอบแบบฟอร์ม 1”) ใช้ทั้งการนำเข้าครั้งแรกครั้งเดียวและปุ่ม
 * “นำเข้าจาก Google Form” บนหน้าแอดมินผู้สมัครในอนาคต
 *
 * `multipart/form-data`:
 * - `file` — ไฟล์ `.xlsx` ไม่เกิน 10 MB (บังคับ)
 * - `recentDays` — จำนวนวันที่ยังถือว่า “ส่งมาไม่นาน” สำหรับคนที่หาไม่เจอในทะเบียน
 *   พจส. (จำนวนเต็ม 1–60 ค่าเริ่มต้น 5)
 * - `commit` — `"true"` = เขียนลงฐานข้อมูลจริง ไม่ส่งหรือค่าอื่น = ตรวจไฟล์อย่างเดียว
 *
 * ตรวจไฟล์ (`commit` ไม่ใช่ `"true"`) กับนำเข้าจริงเดินตรรกะเดียวกันทุกขั้นตอนใน
 * `form-import.ts` — คืนรูป `ImportReport` แบบเดียวกัน ต่างกันแค่ `committed` และ
 * `batch` หน้าจอจึงโชว์ผลตรวจแล้วค่อยให้กดยืนยันได้โดยไม่ต้องเดาว่าตอนเขียนจริง
 * จะได้ตัวเลขเท่าไหร่
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_RECENT_DAYS = 5;

function parseRecentDays(raw: FormDataEntryValue | null): number {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_RECENT_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_RECENT_DAYS;
  return Math.min(60, Math.max(1, n));
}

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");

    if (!(file instanceof File) || !file.size) return badRequest("ไม่พบไฟล์ Excel ที่ส่งมา");
    if (!/\.xlsx$/i.test(file.name)) return badRequest("ใช้ได้เฉพาะไฟล์ .xlsx");
    if (file.size > MAX_BYTES) return badRequest(`ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB`);

    const recentDays = parseRecentDays(form?.get("recentDays") ?? null);
    const commit = form?.get("commit") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());

    const report = commit
      ? await commitImport(buffer, { recentDays }, who)
      : await previewImport(buffer, { recentDays });

    return ok(report);
  } catch (err) {
    return failRecruitment(err);
  }
}
