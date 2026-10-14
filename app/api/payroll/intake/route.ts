import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import type { IntakeStage } from "@/lib/payroll/intake-status";
import { listIntake, saveIntake } from "@/lib/payroll/intake";
import { canPassIntake, HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { filterRecords } from "@/lib/payroll/scope-filter";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * สถานะการรับข้อมูลของรอบจ่าย (`payroll_intake` ใน MongoDB)
 *
 * `GET   /api/payroll/intake?period=2026-09` — ทุกแถวของรอบนั้น
 * `PATCH /api/payroll/intake` — `{ period, itemId, stage, ... }` บันทึกชิ้นเดียว
 *
 * **`stage: "passed"` ต้องเป็น HR** (ดู `approver.ts`) ส่วนขั้นอื่นทำได้เฉพาะ
 * รายการของฝ่ายตัวเอง (HR ทำแทนได้ทุกฝ่าย) — ฝ่ายเจ้าของข้อมูลอัปโหลดไฟล์ตัวเองได้ แต่ไม่ตัดสินว่าของตัวเองผ่าน
 * `GET` ก็คืนเฉพาะแถวของฝ่ายตัวเองเช่นกัน
 *
 * **ไม่มีเส้นที่อ่านข้ามรอบ** โดยตั้งใจ — หน้าจอทำงานทีละรอบเสมอ และการเปิดให้
 * ดึงทั้งคอลเลกชันได้คือจุดที่รายงานย้อนหลังจะเริ่มลากข้อมูลเกินจำเป็นในอนาคต
 *
 * **`GET` ต้องเช็ก session เองที่นี่** — `proxy.ts` กันเฉพาะคำสั่งที่เขียนข้อมูล
 * ส่วน `GET` ใต้ `/api/**` ปล่อยผ่านโดยตั้งใจ ด้วยเหตุผลว่าหน้าที่เรียกถูกกั้นแล้ว
 * ซึ่งใช้ไม่ได้กับเส้นนี้ เพราะยิงตรงได้โดยไม่ผ่านหน้า และผลลัพธ์มีชื่อคนทำ
 * ชื่อไฟล์ และเหตุผลที่ตีกลับ · `app/payroll/layout.tsx` ระบุไว้เองว่าห้ามมีอะไร
 * ใต้กรอบ `/payroll` เปิดสาธารณะ — เส้นนี้นับรวมอยู่ในนั้น
 */

const STAGES: IntakeStage[] = ["waiting", "submitted", "returned", "passed"];

const isStage = (value: unknown): value is IntakeStage =>
  typeof value === "string" && STAGES.includes(value as IntakeStage);

/** `2026-09` เท่านั้น — กันคนยิง period มั่วแล้วได้คอลเลกชันรกไปทั้งก้อน */
const isPeriodCode = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const period = request.nextUrl.searchParams.get("period");
    if (!isPeriodCode(period)) {
      return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
    }
    /* ขอบเขตมาจาก session เสมอ ไม่รับจาก query string — กรองก่อนส่งออก เพราะแถวพวกนี้
       มีชื่อคนส่ง ชื่อไฟล์ และเหตุผลที่ตีกลับของฝ่ายอื่น */
    const identity = await getDeskIdentity();
    return ok(filterRecords(identity, await listIntake(period)));
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const period = typeof body.period === "string" ? body.period : null;
    if (!isPeriodCode(period)) {
      return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
    }
    if (typeof body.itemId !== "string" || !body.itemId.trim()) {
      return badRequest("ระบุ itemId ของรายการที่จะบันทึก");
    }
    if (!isStage(body.stage)) {
      return badRequest(`stage ต้องเป็นหนึ่งใน ${STAGES.join(" / ")}`);
    }

    const identity = await getDeskIdentity();

    /* **การรับเข้ารอบถูกกันที่เซิร์ฟเวอร์ ไม่ใช่แค่ปิดปุ่ม** — ปุ่มที่ปิดไว้บนหน้าจอ
       กันได้แค่คนที่กดผ่านหน้าจอ · ขั้นอื่น (อัปโหลด/ตีกลับ) ใครก็ทำได้ตามเดิม
       เพราะฝ่ายเจ้าของข้อมูลต้องส่งไฟล์เองได้ */
    if (body.stage === "passed" && !canPassIntake(identity)) {
      return forbidden(
        `รับเข้ารอบได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${identity.department || "หน่วยงานที่ไม่ระบุ"}`,
      );
    }

    /* **อัปโหลดแทนฝ่ายอื่นไม่ได้** — ของเดิมขั้นที่ไม่ใช่ `passed` ใครก็ทำได้ ซึ่งแปลว่า
       คนจากฝ่ายหนึ่งยิง API ตรงแล้วเปลี่ยนสถานะของอีกฝ่ายได้ · HR ยังทำแทนได้ตามเดิม
       เพราะบางเดือนฝ่ายส่งไฟล์มาทางไลน์แล้ว HR เป็นคนเอาขึ้นระบบ */
    if (!canUploadItem(identity, body.itemId.trim())) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }

    return ok(
      await saveIntake({
        period,
        itemId: body.itemId.trim(),
        stage: body.stage,
        fileName: typeof body.fileName === "string" ? body.fileName : undefined,
        returnedReason:
          typeof body.returnedReason === "string" ? body.returnedReason : undefined,
        rows: typeof body.rows === "number" ? body.rows : undefined,
        columns: typeof body.columns === "number" ? body.columns : undefined,
        fileId: typeof body.fileId === "string" ? body.fileId : undefined,
        errors: typeof body.errors === "number" ? body.errors : undefined,
        warnings: typeof body.warnings === "number" ? body.warnings : undefined,
        pendingChecks:
          typeof body.pendingChecks === "number" ? body.pendingChecks : undefined,
        overrideReason:
          typeof body.overrideReason === "string" ? body.overrideReason : undefined,
        updatedBy: identity.name,
      }),
    );
  } catch (err) {
    return fail(err);
  }
}
