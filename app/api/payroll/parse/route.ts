import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { saveIntakeFile } from "@/lib/payroll/intake-files";
import { validateIntakeUpload } from "@/lib/payroll/intake-upload";
import { profileWorkbook } from "@/lib/payroll/parse";
import { runChecks, summarize } from "@/lib/payroll/rules";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `POST /api/payroll/parse` — รับไฟล์ที่ฝ่ายส่งมา แล้วคืนผลวิเคราะห์ + ผลตรวจด่าน 1
 *
 * **เก็บไฟล์ก่อนตรวจ** โดยตั้งใจ — ไฟล์ที่ตรวจไม่ผ่านก็ยังต้องเก็บไว้ ไม่งั้นเวลา
 * ฝ่ายถามว่า "ที่ส่งไปมีอะไรผิด" จะไม่มีของให้ดูย้อน
 *
 * ด่านก่อนถึง exceljs มีสามชั้น: ต้องล็อกอิน · ต้องเป็นรายการของฝ่ายตัวเอง ·
 * ต้องเป็นไฟล์ `.xlsx` จริงขนาดไม่เกิน 10 MB (กติกาอยู่ใน `intake-upload.ts`) —
 * ตอบเป็นข้อความที่อ่านรู้เรื่อง ไม่ปล่อยให้ไปพังข้างในแล้วได้ 500
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return badRequest("ไม่พบไฟล์ที่แนบมา");

    const checked = validateIntakeUpload({
      period: form?.get("period"),
      itemId: form?.get("itemId"),
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      head: new Uint8Array(await file.slice(0, 4).arrayBuffer()),
    });
    if (!checked.ok) return badRequest(checked.message);
    const { period, itemId } = checked;

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, itemId)) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }

    const stored = await saveIntakeFile(file, { period, itemId, uploadedBy: identity.name });

    const parsed = await profileWorkbook(await file.arrayBuffer(), file.name);
    const checks = runChecks(itemId, parsed);

    return ok({ profile: parsed.profile, checks, tally: summarize(checks), file: stored });
  } catch (err) {
    return fail(err);
  }
}
