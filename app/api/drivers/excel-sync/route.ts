import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";

/**
 * `POST /api/drivers/excel-sync` — **เฉพาะ `next dev`** · ชี้ path ไฟล์ทะเบียนฝ่ายบุคคล (.xlsx ชีต “ทะเบียน 2026”)
 * บนเครื่องที่รันเซิร์ฟเวอร์ แล้วรัน `import_driver_registry_xlsx.mjs` ตัวเดียวกับที่ใช้มือรัน
 *
 * ```
 * { "path": "C:\\Users\\…\\[HR] ทะเบียนประวัติพจส.ลาดกระบัง Mixer.xlsx", "apply": false }
 * ```
 *
 * `apply: false` = dry run · `true` = เขียนจริง (สคริปต์สำรองลง `backups/` ก่อนเสมอ) — คืน `{ log }` ข้อความสรุปของสคริปต์
 * production ตอบ 404 เสมอ
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCRIPT = "import_driver_registry_xlsx.mjs";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");

    const body = (await request.json().catch(() => null)) as { path?: unknown; apply?: unknown } | null;
    // วาง path จาก “Copy as path” ของ Windows มาจะติดเครื่องหมายคำพูด
    const file = typeof body?.path === "string" ? body.path.trim().replace(/^["']|["']$/g, "") : "";
    if (!file.toLowerCase().endsWith(".xlsx")) return badRequest("ต้องเป็นไฟล์ .xlsx");
    if (!path.isAbsolute(file) || !fs.existsSync(file)) return badRequest("ไม่พบไฟล์ — ตรวจ path อีกครั้ง");

    const args = [SCRIPT, file, ...(body?.apply === true ? ["--apply"] : [])];
    const log = await new Promise<string>((resolve, reject) =>
      execFile(
        process.execPath,
        args,
        { cwd: process.cwd(), timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => (err ? reject(new Error(`${stdout}\n${stderr}`.trim() || err.message)) : resolve(stdout)),
      ),
    );
    return ok({ log });
  } catch (err) {
    return fail(err);
  }
}
