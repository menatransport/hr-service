import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { commitImport, previewImport, type ImportSource } from "@/app/recruitment/_lib/form-import";

/**
 * `POST /api/recruitment/import` — Sync ใบสมัครจาก Google Form (ชีต “การตอบแบบฟอร์ม 1”) เข้าหน้าผู้สมัคร
 * ใช้ทั้งการนำเข้าครั้งแรกและปุ่ม Excel บนหน้าแอดมินผู้สมัคร
 *
 * ส่งได้สามแบบ:
 * - `multipart/form-data` — `file` ไฟล์ `.xlsx` ไม่เกิน 10 MB · `commit`
 * - JSON `{ "path": "C:\…\ใบสมัครงาน พจส.xlsx", "commit": false }` — **เฉพาะ `next dev`** อ่านไฟล์บนเครื่องที่รันเซิร์ฟเวอร์
 * - JSON `{ "text": "<แถวที่คัดลอกจากชีต>", "commit": false }` — วางแถวจาก Excel/Google Sheets (มีหรือไม่มีแถวหัวตารางก็ได้)
 *
 * `recentDays` (1–60 ค่าเริ่มต้น 5) ใช้เฉพาะตอนที่ยังไม่เคยนำเข้าเลย — ปกติใบใหม่ = ส่งหลังใบล่าสุดที่เคยนำเข้า
 * · `commit` = `true` เขียนจริง อย่างอื่น = ตรวจอย่างเดียว · ทั้งสองคืน `ImportReport` รูปเดียวกัน
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_RECENT_DAYS = 5;

function parseRecentDays(raw: unknown): number {
  const n = Number(raw);
  if (raw == null || raw === "" || !Number.isInteger(n)) return DEFAULT_RECENT_DAYS;
  return Math.min(60, Math.max(1, n));
}

type Parsed = { source: ImportSource; commit: boolean; recentDays: number } | { error: string };

async function readJson(request: NextRequest): Promise<Parsed> {
  const body = (await request.json().catch(() => null)) as
    | { path?: unknown; text?: unknown; commit?: unknown; recentDays?: unknown }
    | null;
  const commit = body?.commit === true;
  const recentDays = parseRecentDays(body?.recentDays);

  if (typeof body?.text === "string") {
    if (!body.text.trim()) return { error: "ยังไม่ได้วางแถวจาก Excel" };
    if (body.text.length > MAX_BYTES) return { error: "ข้อความยาวเกินไป — แบ่งวางทีละส่วน" };
    return { source: { text: body.text }, commit, recentDays };
  }

  if (process.env.NODE_ENV !== "development") return { error: "Sync จาก path ใช้ได้เฉพาะโหมด dev" };
  // วาง path จาก “Copy as path” ของ Windows มาจะติดเครื่องหมายคำพูด
  const file = typeof body?.path === "string" ? body.path.trim().replace(/^["']|["']$/g, "") : "";
  if (!file.toLowerCase().endsWith(".xlsx")) return { error: "ต้องเป็นไฟล์ .xlsx" };
  if (!path.isAbsolute(file)) return { error: "ใส่ path เต็ม เช่น C:\Users\…\ไฟล์.xlsx" };
  const buffer = await fs.readFile(file).catch(() => null);
  if (!buffer) return { error: "ไม่พบไฟล์ — ตรวจ path อีกครั้ง" };
  return { source: { buffer }, commit, recentDays };
}

async function readForm(request: NextRequest): Promise<Parsed> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return { error: "ไม่พบไฟล์ Excel ที่ส่งมา" };
  if (!/\.xlsx$/i.test(file.name)) return { error: "ใช้ได้เฉพาะไฟล์ .xlsx" };
  if (file.size > MAX_BYTES) return { error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB` };
  return {
    source: { buffer: Buffer.from(await file.arrayBuffer()) },
    commit: form?.get("commit") === "true",
    recentDays: parseRecentDays(form?.get("recentDays")),
  };
}

export async function POST(request: NextRequest) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const isJson = request.headers.get("content-type")?.includes("application/json");
    const parsed = isJson ? await readJson(request) : await readForm(request);
    if ("error" in parsed) return badRequest(parsed.error);

    const { source, commit, recentDays } = parsed;
    const report = commit
      ? await commitImport(source, { recentDays }, who)
      : await previewImport(source, { recentDays });

    return ok(report);
  } catch (err) {
    return failRecruitment(err);
  }
}
