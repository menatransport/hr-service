import type { IntakeRecord } from "./intake-status";

/**
 * ร่องรอยการตัดสินของแต่ละรายการ — **เพิ่มได้เท่านั้น ห้ามแก้ ห้ามลบ**
 *
 * แถวใน `payroll_intake` เก็บแต่สถานะล่าสุด ทุกการเขียนเป็น `$set`/`$unset` ทับที่เดิม
 * แปลว่าพออัปโหลดไฟล์ใหม่ทับใบที่เคยผ่าน คำถามที่ตอบไม่ได้อีกเลยคือ
 * **“ยอดนี้ใครอนุมัติ เมื่อไหร่ ด้วยเหตุผลอะไร”** ซึ่งเป็นคำถามเดียวที่การควบคุม
 * ทั้งชุดนี้มีไว้ตอบ · คอลเลกชันนี้จึงเก็บหนึ่งเอกสารต่อหนึ่งการตัดสิน
 * ไม่ทับของเก่า เดือนละไม่ถึงร้อยแถว
 *
 * **ไฟล์นี้ไม่รู้จัก MongoDB** (ใช้ได้ทั้ง client และ server) — ตัวเขียน/อ่าน
 * อยู่ที่ `intake.ts` ซึ่งเป็นเจ้าของการต่อฐานข้อมูลของทะเบียนนี้อยู่แล้ว
 */

export type IntakeEventKind = "uploaded" | "passed" | "returned" | "reopened";

export const EVENT_LABEL: Record<IntakeEventKind, string> = {
  uploaded: "อัปโหลดไฟล์",
  passed: "รับเข้ารอบ",
  returned: "ตีกลับให้แก้",
  reopened: "เปิดใบกลับมาแก้",
};

export interface IntakeEvent {
  /** คีย์เดียวกับ `payroll_intake` — `period` + `itemId` ไม่ใช่ `_id` ประกอบ */
  period: string;
  itemId: string;
  kind: IntakeEventKind;
  /** ISO — เวลาที่ตัดสิน */
  at: string;
  /** ชื่อคนที่ลงมือ */
  actor: string;
  fileName?: string;
  fileId?: string;
  /** จำนวนข้อผิดพลาดค้างตอนนั้น — ของ `passed` คือจำนวนที่ถูกอนุมัติทับไป */
  errors?: number;
  /** เหตุผลข้ามด่าน 1 (มีได้เฉพาะ `passed`) */
  overrideReason?: string;
  /** เหตุผลที่ตีกลับ หรือเหตุผลที่เปิดใบกลับมา */
  reason?: string;
}

export interface IntakeEventInput {
  period: string;
  itemId: string;
  kind: IntakeEventKind;
  actor: string;
  /** ISO — ผู้เรียกส่งเวลาเดียวกับที่เขียนลงแถวสถานะ ไม่ให้สองที่ต่างกันไม่กี่มิลลิวินาที */
  at: string;
  /** แถวสถานะหลังการตัดสิน — ใช้ดึงชื่อไฟล์และจำนวนข้อผิดพลาดที่ตัดสินทับไป */
  record?: IntakeRecord;
  reason?: string;
  overrideReason?: string;
}

const UNKNOWN_ACTOR = "ไม่ทราบชื่อผู้ใช้";

/**
 * ปั้นเอกสารเหตุการณ์หนึ่งชิ้น — **ไม่ใส่คีย์ที่ไม่มีค่า** เพราะเอกสารพวกนี้ถูกอ่าน
 * ย้อนหลังเป็นหลักฐาน คีย์ที่เป็น `undefined` หรือเหตุผลที่เป็นช่องว่างอ่านแล้ว
 * เข้าใจผิดได้ว่ามีการบันทึกอะไรไว้ทั้งที่ไม่มี
 */
export function intakeEvent(input: IntakeEventInput): IntakeEvent {
  const event: IntakeEvent = {
    period: input.period,
    itemId: input.itemId,
    kind: input.kind,
    at: input.at,
    actor: input.actor.trim() || UNKNOWN_ACTOR,
  };

  if (input.record?.fileName) event.fileName = input.record.fileName;
  if (input.record?.fileId) event.fileId = input.record.fileId;
  if (typeof input.record?.errors === "number") event.errors = input.record.errors;

  const override = input.overrideReason?.trim();
  if (override && input.kind === "passed") event.overrideReason = override;

  const reason = input.reason?.trim();
  if (reason) event.reason = reason;

  return event;
}

/** `รับเข้ารอบ · 14 ต.ค. 10:30 · บัว ค่าจ้าง` — บรรทัดเดียวต่อหนึ่งเหตุการณ์ */
export function eventLine(event: IntakeEvent): string {
  const at = new Date(event.at);
  const when = `${at.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
  return `${EVENT_LABEL[event.kind]} · ${when} · ${event.actor}`;
}
