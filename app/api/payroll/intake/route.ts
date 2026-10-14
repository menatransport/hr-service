import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import type { IntakeStage } from "@/lib/payroll/intake-status";
import {
  IntakeStageConflict,
  listIntake,
  reopenIntake,
  saveIntake,
} from "@/lib/payroll/intake";
import { canPassIntake, HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { stageWriteCheck } from "@/lib/payroll/intake-gate";
import { writablePeriod } from "@/lib/payroll/period";
import { filterRecords } from "@/lib/payroll/scope-filter";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * สถานะการรับข้อมูลของรอบจ่าย (`payroll_intake` ใน MongoDB)
 *
 * `GET   /api/payroll/intake?period=2026-09` — ทุกแถวของรอบนั้น
 * `PATCH /api/payroll/intake` — `{ period, itemId, stage, ... }` บันทึกชิ้นเดียว
 *
 * **ขั้นที่เขียนได้จากที่นี่มีสองขั้น และทั้งคู่เป็นคำตัดสินของผู้ตรวจ** — `passed`
 * กับ `returned` (กติกาอยู่ที่ `stageWriteCheck`) · `submitted` เขียนได้จาก
 * `/api/payroll/parse` ที่เดียว และ `waiting` เป็นค่าตั้งต้นที่ไม่ต้องมีใครเขียน
 * ทุกคำสั่งยังต้องอยู่ในขอบเขตฝ่ายของตัวเองด้วย (HR ทำแทนได้ทุกฝ่าย) ·
 * `GET` ก็คืนเฉพาะแถวของฝ่ายตัวเองเช่นกัน
 *
 * `PATCH { period, itemId, action: "reopen", reason }` — เปิดใบที่ผ่านแล้วกลับมา
 * เพื่อให้ฝ่ายส่งไฟล์ชุดใหม่ได้ · เป็นการกระทำของผู้ตรวจ และถูกบันทึกในร่องรอย
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
    const itemId = body.itemId.trim();

    /* **รอบที่ปิดแล้วหรือยังมาไม่ถึง ตัดสินอะไรไม่ได้** — ของเดิมรับ YYYY-MM อะไรก็ได้
       ยิงตรงเข้ารอบที่ปิดแล้วก็กดผ่านได้ ทั้งที่หน้าจอปิดปุ่มไว้ */
    const open = writablePeriod(period);
    if (!open.ok) return badRequest(open.message);

    const identity = await getDeskIdentity();
    const canPass = canPassIntake(identity);

    /* **อัปโหลดแทนฝ่ายอื่นไม่ได้** — ของเดิมขั้นที่ไม่ใช่ `passed` ใครก็ทำได้ ซึ่งแปลว่า
       คนจากฝ่ายหนึ่งยิง API ตรงแล้วเปลี่ยนสถานะของอีกฝ่ายได้ · HR ยังทำแทนได้ตามเดิม
       เพราะบางเดือนฝ่ายส่งไฟล์มาทางไลน์แล้ว HR เป็นคนเอาขึ้นระบบ */
    if (!canUploadItem(identity, itemId)) {
      return forbidden(
        `รายการนี้ไม่ใช่ของ${identity.department || "หน่วยงานของบัญชีนี้"} — ส่งได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ`,
      );
    }

    /* เปิดใบที่ผ่านแล้วกลับมา — ของผู้ตรวจเท่านั้น และต้องมีเหตุผล เพราะใบนี้
       เคยถูกรับเข้ารอบไปแล้ว การเปิดกลับมาคือการยกเลิกคำตัดสินนั้น */
    if (body.action === "reopen") {
      if (!canPass) {
        return forbidden(
          `เปิดใบกลับมาได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${identity.department || "หน่วยงานที่ไม่ระบุ"}`,
        );
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!reason) {
        return badRequest("เปิดใบกลับมาต้องระบุเหตุผล เพราะใบนี้ถูกรับเข้ารอบไปแล้ว");
      }
      return ok(await reopenIntake({ period, itemId, reason, updatedBy: identity.name }));
    }

    if (!isStage(body.stage)) {
      return badRequest(`stage ต้องเป็นหนึ่งใน ${STAGES.join(" / ")}`);
    }

    /* **สิทธิ์ตามขั้นถูกกันที่เซิร์ฟเวอร์ ไม่ใช่แค่ปิดปุ่ม** — ปุ่มที่ปิดไว้บนหน้าจอ
       กันได้แค่คนที่กดผ่านหน้าจอ · กติกาเต็มชุดอยู่ที่ `stageWriteCheck` */
    const allowed = stageWriteCheck(body.stage, canPass, identity.department);
    if (!allowed.ok) {
      return allowed.status === 403
        ? forbidden(allowed.message)
        : badRequest(allowed.message);
    }

    /* **ไม่รับ `rows`/`columns` จาก client อีก** — `/api/payroll/parse` เขียนค่าจริงที่
       นับจากไฟล์ไว้แล้ว ของเดิมตอนกดผ่านส่ง `columns` เป็นจำนวนคอลัมน์ที่คนติ๊ก
       ทำให้ฟิลด์เดียวกันมีความหมายต่างกันก่อนและหลังอนุมัติ */
    return ok(
      await saveIntake({
        period,
        itemId,
        stage: body.stage,
        fileName: typeof body.fileName === "string" ? body.fileName : undefined,
        returnedReason:
          typeof body.returnedReason === "string" ? body.returnedReason : undefined,
        overrideReason:
          typeof body.overrideReason === "string" ? body.overrideReason : undefined,
        updatedBy: identity.name,
      }),
    );
  } catch (err) {
    /* ขั้นปัจจุบันขัดกับคำสั่ง — 409 ไม่ใช่ 500 เพราะผู้ใช้ต้องไปทำอะไรก่อน ไม่ใช่ลองใหม่ */
    if (err instanceof IntakeStageConflict) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return fail(err);
  }
}
