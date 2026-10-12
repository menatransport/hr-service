import type { IntakeItem } from "./registry";
import { BE_OFFSET, type PeriodRef } from "./period";

/**
 * สถานะของ “ของหนึ่งชิ้นในหนึ่งรอบ” — **ใช้ได้ทั้ง server และ client**
 *
 * สี่สถานะนี้คือขั้น 2–3 ของกระบวนการเป้าหมาย ไม่ได้คิดขึ้นใหม่:
 * ฝ่ายอัปโหลด → ตรวจคุณภาพ → ผ่าน หรือ ตีกลับให้แก้ แล้ววนกลับมาส่งใหม่
 *
 * **`submitted` คือ “อัปโหลดแล้ว รอ HR ตรวจ”** ไม่ใช่สถานะชั่วคราวที่ผ่านไปเฉย ๆ —
 * ไฟล์ถูกบันทึกเป็นสถานะนี้ทันทีที่ฝ่ายเจ้าของข้อมูลอัปโหลด แล้วค้างอยู่จนกว่า HR
 * จะมาตัดสิน ของที่ผ่านคือของที่จะกลายเป็นเงินในสลิป จึงต้องมีคนรับผิดชอบการผ่าน
 * แยกจากคนส่ง (ใครผ่านได้ดูที่ `approver.ts`)
 */

export type IntakeStage = "waiting" | "submitted" | "returned" | "passed";

export const STAGE_LABEL: Record<IntakeStage, string> = {
  waiting: "รอส่ง",
  submitted: "อัปโหลดแล้ว",
  returned: "ตีกลับให้แก้",
  passed: "ตรวจผ่าน",
};

/** สีสถานะ — คนละชุดกับสีชนิดข้อมูลในหน้าตรวจคอลัมน์ ไม่ให้อ่านสลับกัน */
export const STAGE_TONE: Record<IntakeStage, string> = {
  waiting: "bg-base-200 text-mut",
  submitted: "bg-warning/15 text-warning",
  returned: "bg-sla/12 text-sla",
  passed: "bg-soft text-primary",
};

/** เรียง “ของที่ต้องตามก่อน” ขึ้นหัว */
export const STAGE_URGENCY: Record<IntakeStage, number> = {
  returned: 0,
  waiting: 1,
  submitted: 2,
  passed: 3,
};

/** บันทึกหนึ่งแถวในคอลเลกชัน `payroll_intake` */
export interface IntakeRecord {
  itemId: string;
  stage: IntakeStage;
  /** ชื่อไฟล์ที่รับไว้ล่าสุด */
  fileName?: string;
  /** ISO — เวลาที่รับไฟล์ล่าสุดเข้าระบบ */
  receivedAt?: string;
  /** ชื่อคนที่อัปโหลดไฟล์ล่าสุด */
  receivedBy?: string;
  /** ISO — เวลาที่ HR กดรับเข้ารอบ · **คนละเวลากับ `receivedAt`** */
  passedAt?: string;
  /** ชื่อ HR ที่ตรวจแล้วรับเข้ารอบ */
  passedBy?: string;
  /** เหตุผลที่ตีกลับ ต้องมีเสมอเมื่อ stage เป็น returned */
  returnedReason?: string;
  rows?: number;
  columns?: number;
  updatedAt: string;
  updatedBy: string;
}

/*
 * **แยก `receivedBy` กับ `passedBy` ไม่ใช้ `updatedBy` ตัวเดียว** — ถ้าใช้ตัวเดียว
 * ชื่อคนอัปโหลดจะถูกชื่อ HR ทับทิ้งตอนกดผ่าน แล้วหน้าจอจะบอกผิดว่า HR เป็นคนส่งไฟล์
 * ซึ่งเป็นข้อมูลเดียวที่ใช้ตามงานได้จริง · `updatedBy` ยังอยู่ ไว้บอกว่า “ใครแตะล่าสุด”
 */

export const emptyRecord = (itemId: string): IntakeRecord => ({
  itemId,
  stage: "waiting",
  updatedAt: "",
  updatedBy: "",
});

/**
 * วันครบกำหนดจริงของรายการหนึ่งในรอบหนึ่ง
 *
 * `dueDay` ในทะเบียนเป็น “วันที่ของเดือน” ลอย ๆ — ต้องผูกกับรอบก่อนจึงเทียบวันได้
 * และ **รอบเดือนไหนก็ใช้เดือนนั้น** เช่นรอบ ก.ย. ครบกำหนดวันที่ 10 ก.ย.
 */
export function dueDate(item: IntakeItem, period: PeriodRef): Date {
  return new Date(period.year - BE_OFFSET, period.month, item.dueDay);
}

/**
 * ช้ากี่วัน — บวกคือช้า ศูนย์หรือติดลบคือทันกำหนด
 *
 * ของที่ยังไม่ส่งเทียบกับ `now` · ของที่ส่งแล้วเทียบกับวันที่รับจริง เพราะเมื่อรับแล้ว
 * ความช้าหยุดเดิน ไม่ใช่เพิ่มขึ้นเรื่อย ๆ ตามวันปัจจุบัน
 */
export function lateDays(
  item: IntakeItem,
  period: PeriodRef,
  record: IntakeRecord,
  now: Date,
): number {
  const due = dueDate(item, period);
  const mark = record.receivedAt ? new Date(record.receivedAt) : now;
  const diff = startOfDay(mark).getTime() - startOfDay(due).getTime();
  return Math.round(diff / 86_400_000);
}

const startOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

/**
 * ของชิ้นนี้ **ต้องตามจากฝ่ายเจ้าของข้อมูล** หรือยัง
 *
 * ตัวเลขนี้ตอบคำถามเดียวคือ “ต้องโทรตามใคร” จึงนับเฉพาะของที่ลูกบอลอยู่ที่ผู้ส่ง:
 * - `returned` นับเสมอ แม้ยังไม่เลยกำหนด เพราะเขาต้องแก้แล้วส่งใหม่
 * - `waiting` นับเมื่อเลยกำหนด
 * - **`submitted` ไม่นับ** เพราะไฟล์มาถึงแล้ว ลูกบอลอยู่ที่ HR ไม่ใช่ที่เขา —
 *   ถ้านับรวม คนทำเงินเดือนจะโทรตามของที่ตัวเองยังไม่ได้ตรวจ · ของที่รอตรวจ
 *   ไปอยู่ในตัวนับ `awaitingReview` แยก ไม่ได้หายไปจากหน้าจอ
 */
export function needsChasing(
  item: IntakeItem,
  period: PeriodRef,
  record: IntakeRecord,
  now: Date,
): boolean {
  if (record.stage === "passed" || record.stage === "submitted") return false;
  if (record.stage === "returned") return true;
  return lateDays(item, period, record, now) > 0;
}

/** รอ HR ตรวจ — ไฟล์มาถึงแล้วแต่ยังไม่มีใครตัดสิน */
export const needsReview = (record: IntakeRecord): boolean =>
  record.stage === "submitted";

export interface OwnerTally {
  total: number;
  passed: number;
  submitted: number;
  returned: number;
  waiting: number;
  /** จำนวนรายการที่ต้องตามจากฝ่าย — เกินกำหนดหรือถูกตีกลับ */
  chasing: number;
  /** จำนวนรายการที่อัปโหลดแล้วแต่ยังรอ HR ตรวจ */
  awaitingReview: number;
  /** ช้าที่สุดกี่วันในกลุ่มนี้ (0 = ไม่มีอะไรช้า) */
  worstLate: number;
}

export function tallyOwner(
  items: IntakeItem[],
  period: PeriodRef,
  records: Map<string, IntakeRecord>,
  now: Date,
): OwnerTally {
  const sum: OwnerTally = {
    total: items.length,
    passed: 0,
    submitted: 0,
    returned: 0,
    waiting: 0,
    chasing: 0,
    awaitingReview: 0,
    worstLate: 0,
  };

  for (const item of items) {
    const record = records.get(item.id) ?? emptyRecord(item.id);
    sum[record.stage] += 1;
    if (needsChasing(item, period, record, now)) sum.chasing += 1;
    if (needsReview(record)) sum.awaitingReview += 1;
    if (record.stage !== "passed") {
      sum.worstLate = Math.max(sum.worstLate, lateDays(item, period, record, now));
    }
  }

  return sum;
}
