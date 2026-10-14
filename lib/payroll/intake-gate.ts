import { HR_DEPARTMENT_LABEL } from "./approver";
import type { IntakeRecord, IntakeStage } from "./intake-status";

/**
 * ด่านที่สอง — **HR กดผ่านได้เมื่อด่าน 1 ไม่เหลือข้อผิดพลาด**
 *
 * ข้ามได้ แต่ต้องเขียนเหตุผล และเหตุผลนั้นถูกเก็บไว้กับแถวนั้นตลอดไป (`overrideReason`)
 * — เพราะบางเดือนยอดถูกจริงแต่ไฟล์หน้าตาไม่ตรงกฎ และคนที่ตัดสินใจอย่างนั้นควรมีชื่อ
 * ติดอยู่กับการตัดสินใจนั้น ไม่ใช่กดผ่านเงียบ ๆ
 *
 * **ของที่ `status: "pending"` ไม่นับเป็นข้อผิดพลาด** — เป็นกติกาที่เรายังไม่รู้
 * ไม่ใช่ความผิดของไฟล์ ถ้าเอามาบล็อกก็เท่ากับหยุดเงินเดือนด้วยกฎที่เราแต่งเอง
 */
/**
 * เหตุผลที่จะเก็บลงแถว — **เก็บเฉพาะเมื่อไฟล์มีข้อผิดพลาดค้างจริง**
 * `overrideReason` มีอยู่ = “ผ่านทั้งที่มีข้อผิดพลาดค้าง” ถ้าเก็บตอนไม่มีข้อผิดพลาดด้วย
 * ความหมายนั้นจะเพี้ยน และคนอ่านประวัติจะเข้าใจผิดว่ามีการข้ามด่าน
 */
export function overrideToStore(record: IntakeRecord, overrideReason?: string): string | undefined {
  if ((record.errors ?? 0) <= 0) return undefined;
  return overrideReason?.trim() || undefined;
}

export function assertPassAllowed(record: IntakeRecord, overrideReason?: string): void {
  if (!record.checkedAt && record.errors === undefined) {
    throw new Error("รับเข้ารอบไม่ได้ — ไฟล์นี้ยังไม่ได้ตรวจด่านแรก ลองอัปโหลดใหม่อีกครั้ง");
  }

  const errors = record.errors ?? 0;
  if (errors === 0) return;

  if (!overrideReason?.trim()) {
    throw new Error(
      `รับเข้ารอบไม่ได้ — ยังมีข้อผิดพลาด ${errors} ข้อจากการตรวจด่านแรก · ถ้ายืนยันว่ายอดถูกแล้วจริง ให้ระบุเหตุผลกำกับการข้ามด่าน`,
    );
  }
}

/* ───────────────────────────────── ใครเขียนขั้นไหนได้ (ตรวจที่เซิร์ฟเวอร์) */

export type StageWriteCheck =
  | { ok: true }
  | { ok: false; status: 400 | 403; message: string };

/**
 * ขั้นที่ client เขียนได้มีสองขั้นเท่านั้น — **`passed` กับ `returned` และทั้งคู่เป็นของผู้ตรวจ**
 *
 * ของเดิมกันแค่ `passed` ซึ่งแปลว่าฝ่ายเจ้าของข้อมูลยิง API ตรงแล้วเขียน `returned`
 * (คำตัดสินของ HR ที่ล้าง `receivedAt`/`receivedBy`) หรือ `waiting` (ซึ่งล้างชื่อไฟล์
 * ตัวชี้ไฟล์ และผลตรวจทั้งชุด) ของตัวเองได้ = ฝ่ายที่ถูกวัดลบเวลาที่ของมาถึงได้เอง
 *
 * - `submitted` เขียนได้จาก `POST /api/payroll/parse` ที่เดียว (ที่เดียวที่รู้ผลตรวจจริง)
 * - `waiting` เป็นค่าตั้งต้นของทะเบียน ไม่ต้องมีใครเขียน — เอาไฟล์ออกให้ตีกลับพร้อมเหตุผล
 */
export function stageWriteCheck(
  stage: IntakeStage,
  canPass: boolean,
  department: string,
): StageWriteCheck {
  if (stage === "submitted") {
    return {
      ok: false,
      status: 400,
      message: "สถานะ “อัปโหลดแล้ว” บันทึกได้จากการอัปโหลดไฟล์เท่านั้น",
    };
  }
  if (stage === "waiting") {
    return {
      ok: false,
      status: 400,
      message:
        "สถานะ “รอส่ง” เป็นค่าตั้งต้นของทะเบียน เขียนทับไม่ได้ — ถ้าไฟล์ที่ส่งมาใช้ไม่ได้ ให้ตีกลับพร้อมเหตุผล",
    };
  }
  if (!canPass) {
    return {
      ok: false,
      status: 403,
      message: `ตัดสินว่าผ่านหรือตีกลับได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${department || "หน่วยงานที่ไม่ระบุ"}`,
    };
  }
  return { ok: true };
}

/* ───────────────────────────────── ทำอะไรได้กับแถวที่เก็บไว้ */

export interface ReviewActions {
  /** มีไฟล์ที่เก็บไว้ให้เปิดดูหรือไม่ — ด่าน 2 เปิดจากแถว ไม่ใช่จากไฟล์ในเบราว์เซอร์ */
  hasFile: boolean;
  canApprove: boolean;
  canReturn: boolean;
  /** เปิดใบที่รับเข้ารอบแล้วกลับมา เพื่อให้ฝ่ายส่งไฟล์ใหม่ได้ */
  canReopen: boolean;
  /** เหตุผลที่ยังตัดสินไม่ได้ — `null` เมื่อกดได้ */
  note: string | null;
}

/**
 * สิ่งที่ผู้ใช้คนหนึ่งทำได้กับแถวหนึ่ง — **คิดจากแถวที่เก็บไว้เท่านั้น**
 *
 * ของเดิมปุ่มทั้งแผงอยู่ใต้เงื่อนไข "มีไฟล์ที่เพิ่ง parse ในเบราว์เซอร์นี้" ซึ่งมีค่า
 * เฉพาะคนที่กดอัปโหลดเองในแท็บนั้น · HR ที่ล็อกอินมาทีหลังจึงไม่มีทางตรวจอะไรได้เลย
 * นอกจากเอาไฟล์มาอัปโหลดใหม่เอง ซึ่งเขียน `receivedAt`/`receivedBy` ทับเป็นชื่อตัวเอง
 * แล้วคนส่งกับคนผ่านกลายเป็นคนเดียวกัน — สิ่งที่ฟีเจอร์นี้มีไว้กันตรง ๆ
 *
 * ตัวกันจริงอยู่ที่เซิร์ฟเวอร์ (`saveIntake` + `stageWriteCheck`) ที่นี่คือสิ่งที่
 * หน้าจอใช้ตัดสินว่าจะเปิดปุ่มไหนและอธิบายว่าทำไมกดไม่ได้
 */
export function reviewActions(record: IntakeRecord, canPass: boolean): ReviewActions {
  const hasFile = !!record.fileId;
  const base = { hasFile, canApprove: false, canReturn: false, canReopen: false };

  if (!canPass) {
    return {
      ...base,
      note: `บัญชีนี้รับเข้ารอบหรือตีกลับไม่ได้ — ขั้นตัดสินเป็นของ${HR_DEPARTMENT_LABEL} เท่านั้น`,
    };
  }
  if (record.stage === "submitted") {
    return { ...base, canApprove: true, canReturn: true, note: null };
  }
  if (record.stage === "passed") {
    return {
      ...base,
      canReopen: true,
      note: "รายการนี้รับเข้ารอบแล้ว — ถ้าต้องรับไฟล์ชุดใหม่ ให้เปิดใบกลับมาก่อน",
    };
  }
  if (record.stage === "returned") {
    return { ...base, note: "ตีกลับไปแล้ว รอฝ่ายเจ้าของข้อมูลส่งไฟล์ใหม่เข้ามา" };
  }
  return { ...base, note: "ยังไม่มีไฟล์เข้ามาในรอบนี้ — ตัดสินได้เมื่อฝ่ายส่งไฟล์แล้ว" };
}
