import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { IntakeStageConflict, PASSED_UPLOAD_MESSAGE, readIntake, saveIntake } from "@/lib/payroll/intake";
import { saveIntakeFile } from "@/lib/payroll/intake-files";
import { checkContentLength, parseFailureBody, validateIntakeUpload } from "@/lib/payroll/intake-upload";
import { profileWorkbook } from "@/lib/payroll/parse";
import { runChecks, summarize } from "@/lib/payroll/rules";

import { writablePeriodState } from "@/lib/payroll/periods";
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

    /* ก่อน formData() — ตัวมันอ่านทั้งก้อนเข้าหน่วยความจำ */
    const size = checkContentLength(request.headers.get("content-length"));
    if (!size.ok) return message(size.message, size.status);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return message("ไม่พบไฟล์ที่แนบมา", 400);

    const checked = validateIntakeUpload({
      period: form?.get("period"),
      itemId: form?.get("itemId"),
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      head: new Uint8Array(await file.slice(0, 4).arrayBuffer()),
    });
    if (!checked.ok) return message(checked.message, checked.status);
    const { period, itemId } = checked;

    /* **รอบที่ปิดแล้วหรือยังมาไม่ถึง เขียนไม่ได้ — กันที่นี่ ไม่ใช่แค่บนหน้าจอ**
       ของเดิมรับ YYYY-MM อะไรก็ได้ ยิงตรงด้วย 2026-03 (ปิดแล้ว) หรือ 2099-01
       (รอบที่ไม่มีจริง) ก็ได้แถวในคอลเลกชันที่ไม่มีหน้าไหนแสดง */
    const open = await writablePeriodState(period);
    if (!open.ok) return message(open.message, 400);

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, itemId)) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }

    /* **ตรวจก่อนเก็บไฟล์** — ใบที่รับเข้ารอบแล้วรับไฟล์ใหม่ทับไม่ได้ ถ้าปฏิเสธหลัง
       เก็บไฟล์ จะเหลือไฟล์ใน GridFS ที่ไม่มีแถวไหนอ้างถึง · `saveIntake` กันซ้ำอีกชั้น
       เผื่อมีคนกดผ่านพอดีระหว่างสองบรรทัดนี้ */
    if ((await readIntake(period, itemId))?.stage === "passed") {
      return message(PASSED_UPLOAD_MESSAGE, 409);
    }

    const stored = await saveIntakeFile(file, { period, itemId, uploadedBy: identity.name });

    /* เก็บแล้ว — จากนี้ไฟล์อ่านไม่ออกคือปัญหาของไฟล์ (422) และต้องบอก fileId กลับไปด้วย */
    let parsed;
    let checks;
    try {
      parsed = await profileWorkbook(await file.arrayBuffer(), file.name);
      checks = runChecks(itemId, parsed);
    } catch (err) {
      /* ฝ่ายส่งไฟล์มาแล้ว แต่อ่านไม่ออก — ทะเบียนต้องขึ้น “อัปโหลดแล้ว” พร้อมสิ่งที่ต้องแก้
         (นับเป็นข้อผิดพลาด 1 ข้อ) ไม่ใช่ “รอส่ง” ที่ทำให้ HR โทรตามของที่มาถึงแล้ว */
      try {
        await saveIntake({
          period,
          itemId,
          stage: "submitted",
          fileName: file.name,
          fileId: stored.fileId,
          errors: 1,
          warnings: 0,
          pendingChecks: 0,
          /* ธงบอกตรง ๆ ว่าไฟล์อ่านไม่ออก — หน้าสรุปเคยต้องเดาจากการที่ไม่มี rows/columns */
          unreadable: true,
          updatedBy: identity.name,
        });
      } catch (saveErr) {
        if (saveErr instanceof IntakeStageConflict) {
          return message(saveErr.message, saveErr.status);
        }
        console.error("[api] payroll parse 422 save", saveErr);
      }
      return NextResponse.json(parseFailureBody(err, stored), { status: 422 });
    }

    /* **เส้นนี้เป็นที่เดียวที่เขียนสถานะ `submitted`** — เพราะรู้ผลตรวจจริง ไม่ปล่อยให้
       browser ส่งตัวเลขกลับมาเอง (ส่ง errors: 0 ปลอมแล้วด่าน 1 ก็เป็นหมัน)
       `blocking` ไม่ใช่ `errors` เพราะ errors นับของที่ยัง pending ด้วย */
    const tally = summarize(checks);
    let record;
    try {
      record = await saveIntake({
      period,
      itemId,
      stage: "submitted",
      fileName: file.name,
      rows: parsed.profile.totalRows,
      columns: parsed.profile.columns.length,
      fileId: stored.fileId,
      errors: tally.blocking,
      warnings: tally.warnings,
      pendingChecks: tally.pending,
      /* ผลตรวจเต็มชุดถูกเก็บไว้กับแถว — ด่าน 2 ของคนที่เปิดหน้าทีหลังอ่านจากที่นี่
         ไม่ได้ parse ไฟล์ใน GridFS ใหม่ทุกครั้งที่เปิดหน้า */
      checks,
      updatedBy: identity.name,
      });
    } catch (saveErr) {
      if (saveErr instanceof IntakeStageConflict) {
        return message(saveErr.message, saveErr.status);
      }
      console.error("[api] payroll parse save", saveErr);
      return NextResponse.json(
        {
          error: "เก็บไฟล์ไว้แล้ว แต่บันทึกสถานะไม่สำเร็จ — ทะเบียนยังไม่ขึ้นว่าอัปโหลดแล้ว ลองอัปโหลดใหม่อีกครั้ง",
          file: stored,
        },
        { status: 500 },
      );
    }
    return ok({ profile: parsed.profile, checks, tally, file: stored, record });
  } catch (err) {
    /* ฐานข้อมูล/GridFS ล้ม — ไม่ส่ง err.message ของ driver ออกไปให้ผู้ใช้ */
    console.error("[api] payroll parse", err);
    return message("ระบบเก็บหรืออ่านไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ", 500);
  }
}

const message = (error: string, status: number) => NextResponse.json({ error }, { status });
