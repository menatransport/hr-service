import type { Collection } from "mongodb";

import { getDb } from "../mongo";
import { HR_DEPARTMENT_LABEL } from "./approver";
import type { IntakeRecord, IntakeStage } from "./intake-status";
import { intakeEvent, type IntakeEvent, type IntakeEventKind } from "./intake-events";
import { assertPassAllowed, overrideToStore } from "./intake-gate";
import { findItem } from "./registry";
import type { CheckResult } from "./rules";

/**
 * สถานะการรับข้อมูลรายรอบ — คอลเลกชัน `payroll_intake` **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (client ยิง `/api/payroll/intake` แทน)
 *
 * **หนึ่งแถว = ของหนึ่งชิ้นในหนึ่งรอบ** `_id` เป็น `"<periodCode>:<itemId>"` เช่น
 * `"2026-09:01"` — คีย์ประกอบแบบนี้ทำให้ upsert ซ้ำกี่ครั้งก็ไม่เกิดแถวซ้ำ และไม่ต้อง
 * มี unique index แยก (บทเรียนจาก drivingdistance ที่รันซ้ำแล้วได้ข้อมูลซ้ำ)
 *
 * คอลเลกชันนี้โตช้ามาก — 30 แถวต่อเดือน คือ 360 แถวต่อปี การ `find({ period })`
 * จึงไม่ต้องมี index และไม่มีทางหนักฐานข้อมูล **อย่าเผลอ query ข้ามรอบทั้งหมด**
 * ถ้าวันหนึ่งต้องทำรายงานย้อนหลังหลายปี ค่อยเติม index ที่ `period` ตอนนั้น
 *
 * ทะเบียนว่า “ต้องได้อะไรบ้าง” อยู่ที่ `registry.ts` ไม่ใช่ที่นี่ — ของที่ยังไม่เคย
 * ส่งจะ **ไม่มีแถวในคอลเลกชันนี้เลย** แล้วฝั่งอ่านเติมเป็น `waiting` ให้เอง
 * วิธีนี้ทำให้เพิ่มรายการใหม่ในทะเบียนแล้วรอบเก่าไม่เพี้ยน
 */

const COLLECTION = "payroll_intake";
/** ร่องรอยการตัดสิน — เพิ่มได้เท่านั้น (รูปแบบเอกสารอยู่ที่ `intake-events.ts`) */
const EVENTS = "payroll_intake_events";

interface IntakeDoc extends Omit<IntakeRecord, "itemId"> {
  _id: string;
  period: string;
  itemId: string;
}

async function intakes(): Promise<Collection<IntakeDoc>> {
  return (await getDb()).collection<IntakeDoc>(COLLECTION);
}

async function events(): Promise<Collection<IntakeEvent>> {
  return (await getDb()).collection<IntakeEvent>(EVENTS);
}

const keyOf = (period: string, itemId: string) => `${period}:${itemId}`;

const toRecord = (doc: IntakeDoc): IntakeRecord => ({
  itemId: doc.itemId,
  stage: doc.stage,
  fileName: doc.fileName,
  receivedAt: doc.receivedAt,
  receivedBy: doc.receivedBy,
  passedAt: doc.passedAt,
  passedBy: doc.passedBy,
  returnedReason: doc.returnedReason,
  rows: doc.rows,
  columns: doc.columns,
  fileId: doc.fileId,
  errors: doc.errors,
  checks: doc.checks,
  unreadable: doc.unreadable,
  warnings: doc.warnings,
  pendingChecks: doc.pendingChecks,
  checkedAt: doc.checkedAt,
  overrideReason: doc.overrideReason,
  updatedAt: doc.updatedAt,
  updatedBy: doc.updatedBy,
});

/** ทุกแถวของรอบหนึ่ง — ของที่ยังไม่เคยส่งจะไม่อยู่ในผลลัพธ์ */
export async function listIntake(period: string): Promise<IntakeRecord[]> {
  const docs = await (await intakes()).find({ period }).toArray();
  return docs.map(toRecord);
}

/**
 * แถวเดียวของรายการหนึ่งในรอบหนึ่ง — `null` เมื่อยังไม่เคยมีใครส่งอะไรเข้ามา
 *
 * มีไว้ให้ route ตรวจเงื่อนไขก่อนลงมือทำของหนัก เช่นกันการอัปโหลดทับใบที่ผ่านแล้ว
 * **ก่อนจะเก็บไฟล์ลง GridFS** ไม่ใช่เก็บไปแล้วค่อยปฏิเสธ แล้วเหลือไฟล์กำพร้าไว้
 */
export async function readIntake(
  period: string,
  itemId: string,
): Promise<IntakeRecord | null> {
  const doc = await (await intakes()).findOne({ _id: keyOf(period, itemId) });
  return doc ? toRecord(doc) : null;
}

export interface SaveIntakeInput {
  period: string;
  itemId: string;
  stage: IntakeStage;
  fileName?: string;
  returnedReason?: string;
  /** นับจากไฟล์จริง — รับเฉพาะตอน `submitted` เท่านั้น (ดู `saveIntake`) */
  rows?: number;
  columns?: number;
  fileId?: string;
  errors?: number;
  /** ผลตรวจด่าน 1 เต็มชุด — เก็บไว้ให้ด่าน 2 เปิดอ่านได้ทีหลังโดยไม่ต้อง parse ไฟล์ใหม่ */
  checks?: CheckResult[];
  /** ไฟล์เข้ามาแล้วแต่ตีความไม่ได้เลย (เส้น 422) */
  unreadable?: boolean;
  warnings?: number;
  pendingChecks?: number;
  /** เหตุผลที่ HR ข้ามด่าน 1 — ใช้เฉพาะตอน `passed` ที่ไฟล์ยังมีข้อผิดพลาดค้าง */
  overrideReason?: string;
  updatedBy: string;
}

/**
 * บันทึกสถานะของชิ้นหนึ่ง
 *
 * **`receivedAt` ตั้งเฉพาะตอนที่ไฟล์เข้ามาจริง** (`submitted`) และไม่แตะอีกเลยเมื่อ
 * สถานะเปลี่ยนเป็น `passed` — เพราะความช้าวัดจากวันที่ของมาถึง ไม่ใช่วันที่ตรวจเสร็จ
 * ส่วน `returned` ล้าง `receivedAt` ทิ้ง เพราะของถูกตีกลับไปแล้ว ยังไม่นับว่าได้รับ
 *
 * **ผ่านได้เฉพาะของที่อัปโหลดแล้ว** — กันการกดผ่านของที่ยังไม่มีไฟล์เข้ามาเลย
 * (ยิง API ตรงก็ทำไม่ได้ ไม่ใช่แค่ปุ่มบนหน้าจอถูกปิด) · ของที่ถูกตีกลับต้องส่งใหม่
 * ให้กลายเป็น `submitted` ก่อน จึงจะผ่านได้ ไม่ใช่กดผ่านทับเหตุผลที่ตีกลับไว้
 */
/**
 * ขั้นปัจจุบันขัดกับสิ่งที่กำลังจะเขียน — **คนละเรื่องกับข้อมูลไม่ถูกต้อง**
 * route แปลงเป็น 409 เพื่อให้ฝั่งเรียกรู้ว่าต้องไปทำอะไรก่อน ไม่ใช่ลองใหม่เฉย ๆ
 */
export class IntakeStageConflict extends Error {
  readonly status = 409;
}

export const PASSED_UPLOAD_MESSAGE =
  `รายการนี้รับเข้ารอบไปแล้ว — ส่งไฟล์ชุดใหม่ทับไม่ได้ · ให้${HR_DEPARTMENT_LABEL}เปิดใบกลับมาก่อน แล้วค่อยส่งไฟล์ใหม่`;

export async function saveIntake(input: SaveIntakeInput): Promise<IntakeRecord> {
  if (!findItem(input.itemId)) {
    throw new Error(`ไม่รู้จักรายการ "${input.itemId}" ในทะเบียนรับข้อมูล`);
  }
  if (input.stage === "returned" && !input.returnedReason?.trim()) {
    throw new Error("ตีกลับต้องระบุเหตุผล ไม่งั้นผู้ส่งไม่รู้ว่าต้องแก้อะไร");
  }

  const collection = await intakes();

  /* **ไฟล์ใหม่ทับใบที่ผ่านแล้วไม่ได้** — ของเดิมเขียนทับได้ทันที แล้ว `passedAt`
     `passedBy` `overrideReason` ถูก `$unset` ทิ้ง = รอบที่ปิดไปแล้วเปิดกลับมาเงียบ ๆ
     โดยไม่มีใครรู้ และคำถาม "ใครอนุมัติยอดนี้" ตอบไม่ได้อีก · การเปิดใบกลับมาเป็น
     การกระทำของผู้ตรวจ (`reopenIntake`) ที่ถูกบันทึกไว้ ไม่ใช่ผลข้างเคียงของการอัปโหลด */
  if (input.stage === "submitted") {
    const current = await collection.findOne({
      _id: keyOf(input.period, input.itemId),
    });
    if (current?.stage === "passed") throw new IntakeStageConflict(PASSED_UPLOAD_MESSAGE);
  }

  /* ใช้ตอนเขียน `passed` — รู้ว่าอ่านแถวไหนมาตัดสิน */
  let judged: IntakeDoc | null = null;

  if (input.stage === "passed") {
    const current = await collection.findOne({
      _id: keyOf(input.period, input.itemId),
    });
    if (current?.stage !== "submitted") {
      throw new Error(
        current?.stage === "passed"
          ? "รายการนี้รับเข้ารอบไปแล้ว"
          : "รับเข้ารอบไม่ได้ — ยังไม่มีไฟล์อัปโหลดเข้ามาในรอบนี้",
      );
    }
    /* ด่านที่สอง — ตัดสินจากผลตรวจที่ **เก็บไว้กับแถว** ไม่ใช่จากตัวเลขที่ client ส่งมา
       ตอนกดผ่าน ไม่งั้นยิง API ตรงพร้อม errors: 0 ก็ผ่านได้ */
    assertPassAllowed(toRecord(current), input.overrideReason);
    judged = current;
  }

  const now = new Date().toISOString();
  const set: Partial<IntakeDoc> = {
    period: input.period,
    itemId: input.itemId,
    stage: input.stage,
    updatedAt: now,
    updatedBy: input.updatedBy,
  };
  const unset: Record<string, ""> = {};

  if (input.fileName?.trim()) set.fileName = input.fileName.trim();

  /* ผลตรวจด่าน 1 กับตัวเลขที่นับจากไฟล์ ติดมากับไฟล์ — เขียนเฉพาะตอนไฟล์เข้ามาใหม่
     (`submitted`) ส่วนขั้นอื่นห้ามรับค่าจาก client ไปทับ ไม่งั้นกดผ่านพร้อมส่ง
     errors: 0 ได้ และ `columns` จะกลายเป็น "จำนวนคอลัมน์ที่คนติ๊ก" แทนจำนวนจริงในไฟล์ */
  if (input.stage === "submitted") {
    if (typeof input.rows === "number") set.rows = input.rows;
    else unset.rows = "";
    if (typeof input.columns === "number") set.columns = input.columns;
    else unset.columns = "";
    if (input.fileId?.trim()) set.fileId = input.fileId.trim();
    if (typeof input.errors === "number") set.errors = input.errors;
    if (typeof input.warnings === "number") set.warnings = input.warnings;
    if (typeof input.pendingChecks === "number") set.pendingChecks = input.pendingChecks;
    if (typeof input.errors === "number") set.checkedAt = now;
    if (input.checks) set.checks = input.checks;
    else unset.checks = "";
    if (input.unreadable) set.unreadable = true;
    else unset.unreadable = "";
    /* ไฟล์ใหม่ = ผลตรวจใหม่ — เหตุผลที่เคยข้ามด่านกับไฟล์เก่าใช้กับไฟล์นี้ไม่ได้ */
    unset.overrideReason = "";
    if (typeof input.errors !== "number") {
      unset.errors = "";
      unset.warnings = "";
      unset.pendingChecks = "";
      unset.checkedAt = "";
    }
    if (!input.fileId?.trim()) unset.fileId = "";
  }
  if (judged) {
    const reason = overrideToStore(toRecord(judged), input.overrideReason);
    if (reason) set.overrideReason = reason;
    else unset.overrideReason = "";
  }

  /* ทุกสถานะที่ไม่ใช่ `passed` ต้องล้างลายเซ็นการผ่านทิ้ง — ของที่ผ่านแล้วถูกตีกลับ
     หรือส่งไฟล์ใหม่ทับ แปลว่าการผ่านครั้งก่อนไม่ใช้แล้ว ถ้าค้างไว้จะอ่านได้ว่า
     ของที่กำลังรอตรวจมีคนผ่านไปแล้ว */
  if (input.stage === "submitted") {
    set.receivedAt = now;
    set.receivedBy = input.updatedBy;
  }
  if (input.stage === "passed") {
    set.passedAt = now;
    set.passedBy = input.updatedBy;
  } else {
    unset.passedAt = "";
    unset.passedBy = "";
  }
  if (input.stage === "returned") {
    set.returnedReason = input.returnedReason!.trim();
    unset.receivedAt = "";
    unset.receivedBy = "";
  } else {
    unset.returnedReason = "";
  }
  if (input.stage === "waiting") {
    unset.receivedAt = "";
    unset.receivedBy = "";
    unset.fileName = "";
    unset.rows = "";
    unset.columns = "";
    unset.fileId = "";
    unset.errors = "";
    unset.warnings = "";
    unset.pendingChecks = "";
    unset.checkedAt = "";
    unset.checks = "";
    unset.unreadable = "";
  }
  /* เหตุผลข้ามด่านอยู่ได้เฉพาะแถวที่ผ่าน — ตีกลับแล้วส่งใหม่ต้องเริ่มด่านใหม่ */
  if (input.stage !== "passed") unset.overrideReason = "";

  const update = Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
  const doc = judged
    ? /* **เขียนผ่านแบบมีเงื่อนไข** — ต้องยังเป็นไฟล์ชุดเดิมที่เพิ่งถูกตรวจ (`submitted` และ
         `receivedAt` เท่าเดิม) ถ้ามีการอัปโหลดใหม่แทรกระหว่างอ่านกับเขียน จะไม่มีแถวตรง
         เงื่อนไข แล้วการผ่านล้ม แทนที่จะเอาไฟล์ใหม่ที่ยังไม่ถูกตรวจไปผ่าน */
      await collection.findOneAndUpdate(
        { _id: keyOf(input.period, input.itemId), stage: "submitted", receivedAt: judged.receivedAt },
        update,
        { returnDocument: "after" },
      )
    : await collection.findOneAndUpdate(
        { _id: keyOf(input.period, input.itemId) },
        update,
        { upsert: true, returnDocument: "after" },
      );

  if (!doc) {
    throw new Error(
      judged
        ? "รับเข้ารอบไม่สำเร็จ — ระหว่างตรวจมีการอัปโหลดไฟล์ใหม่เข้ามา ให้เปิดตรวจไฟล์ล่าสุดอีกครั้ง"
        : "บันทึกสถานะไม่สำเร็จ",
    );
  }

  const record = toRecord(doc);
  if (input.stage !== "waiting") {
    await appendEvent({
      period: input.period,
      itemId: input.itemId,
      kind: STAGE_EVENT[input.stage],
      actor: input.updatedBy,
      at: now,
      record,
      reason: input.returnedReason,
      overrideReason: input.overrideReason,
    });
  }
  return record;
}

/** ขั้นที่เขียน → ชื่อเหตุการณ์ในร่องรอย · `waiting` ไม่ใช่การตัดสินของใคร จึงไม่บันทึก */
const STAGE_EVENT: Record<Exclude<IntakeStage, "waiting">, IntakeEventKind> = {
  submitted: "uploaded",
  passed: "passed",
  returned: "returned",
};

/**
 * **เปิดใบที่รับเข้ารอบแล้วกลับมา** — ของผู้ตรวจเท่านั้น (route เป็นคนกั้น)
 *
 * คืนแถวไปอยู่ที่ "อัปโหลดแล้ว รอตรวจ" ของไฟล์ชุดเดิม แล้วลบลายเซ็นการผ่านออก
 * **ไม่แตะ `receivedAt`/`receivedBy`/`fileId`/ผลตรวจ** เพราะไฟล์ที่เคยส่งมายังเป็น
 * ไฟล์เดิม เวลาที่ของมาถึงก็ยังเป็นเวลาเดิม · เหตุผลที่เปิดอยู่ในร่องรอย ไม่ใช่
 * ในแถว เพราะแถวตอบคำถาม "ตอนนี้สถานะอะไร" ส่วนร่องรอยตอบ "เกิดอะไรขึ้นมาแล้วบ้าง"
 */
export async function reopenIntake(input: {
  period: string;
  itemId: string;
  reason: string;
  updatedBy: string;
}): Promise<IntakeRecord> {
  if (!input.reason.trim()) {
    throw new Error("เปิดใบกลับมาต้องระบุเหตุผล เพราะใบนี้ถูกรับเข้ารอบไปแล้ว");
  }
  const collection = await intakes();
  const now = new Date().toISOString();
  const doc = await collection.findOneAndUpdate(
    { _id: keyOf(input.period, input.itemId), stage: "passed" },
    {
      $set: { stage: "submitted", updatedAt: now, updatedBy: input.updatedBy },
      $unset: { passedAt: "", passedBy: "", overrideReason: "" },
    },
    { returnDocument: "after" },
  );
  if (!doc) {
    throw new IntakeStageConflict(
      "เปิดใบกลับมาไม่ได้ — รายการนี้ไม่ได้อยู่ในสถานะ “ตรวจผ่าน” แล้ว (อาจมีคนเปิดไปก่อนหน้านี้)",
    );
  }

  const record = toRecord(doc);
  await appendEvent({
    period: input.period,
    itemId: input.itemId,
    kind: "reopened",
    actor: input.updatedBy,
    at: now,
    record,
    reason: input.reason,
  });
  return record;
}

/**
 * เขียนร่องรอยหนึ่งชิ้น — **insert เท่านั้น ไม่มีเส้น update หรือ delete ในไฟล์นี้**
 *
 * เขียนหลังแถวสถานะสำเร็จแล้ว และ **ถ้าเขียนร่องรอยล้ม จะไม่ทำให้การตัดสินล้มตาม** —
 * การตัดสินเกิดขึ้นจริงแล้วในฐานข้อมูล ถ้าตอบผู้ใช้ว่าล้มเหลว เขาจะกดซ้ำแล้วได้
 * การตัดสินสองครั้ง ซึ่งแย่กว่าร่องรอยขาดไปหนึ่งแถว · ความล้มเหลวลง log ให้ตามได้
 */
async function appendEvent(input: Parameters<typeof intakeEvent>[0]): Promise<void> {
  try {
    await (await events()).insertOne(intakeEvent(input));
  } catch (err) {
    console.error("[payroll] เขียนร่องรอยการตัดสินไม่สำเร็จ", input.period, input.itemId, err);
  }
}

/**
 * ร่องรอยล่าสุดของรายการหนึ่ง — ใหม่สุดขึ้นก่อน
 *
 * เดือนละไม่ถึงร้อยแถวทั้งคอลเลกชัน จึงไม่ต้องมี index · มี `limit` เพราะหน้าจอ
 * แสดงไม่กี่รายการล่าสุด ไม่ใช่ประวัติทั้งชีวิตของใบนั้น
 */
export async function listIntakeEvents(
  period: string,
  itemId: string,
  limit = 8,
): Promise<IntakeEvent[]> {
  const docs = await (await events())
    .find({ period, itemId }, { projection: { _id: 0 }, sort: { at: -1 }, limit })
    .toArray();
  return docs;
}
