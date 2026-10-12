import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import type { IntakeStage } from "@/lib/payroll/intake-status";
import { listIntake, saveIntake } from "@/lib/payroll/intake";

/**
 * สถานะการรับข้อมูลของรอบจ่าย (`payroll_intake` ใน MongoDB)
 *
 * `GET   /api/payroll/intake?period=2026-09` — ทุกแถวของรอบนั้น
 * `PATCH /api/payroll/intake` — `{ period, itemId, stage, ... }` บันทึกชิ้นเดียว
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
    return ok(await listIntake(period));
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
        updatedBy: identity.name,
      }),
    );
  } catch (err) {
    return fail(err);
  }
}
