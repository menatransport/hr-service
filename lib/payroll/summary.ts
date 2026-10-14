import {
  emptyRecord,
  lateDays,
  STAGE_LABEL,
  tallyOwner,
  type IntakeRecord,
  type OwnerTally,
} from "./intake-status";
import type { PeriodRef } from "./period";
import {
  INTAKE_ITEMS,
  OWNER_ORDER,
  type IntakeItem,
  type IntakeOwner,
} from "./registry";

/**
 * สรุปรอบ — **ใช้ได้ทั้ง server และ client** (ไม่ import exceljs)
 *
 * ตอบคำถามเดียว: “รอบนี้ครบหรือยัง” รอบครบเมื่อ **ทุกรายการในขอบเขตเป็น `passed`**
 * - `submitted` (รอ HR ตรวจ) ยังไม่ครบ เพราะยังไม่มีใครรับผิดชอบว่าไฟล์ใช้ได้
 * - ผ่านโดยข้ามด่านพร้อมเหตุผล **นับเป็นผ่าน** แต่ถูกชี้ไว้ (`overridden`) เพราะเหตุผลนั้น
 *   คือร่องรอยที่การควบคุมทั้งชุดมีไว้สร้าง
 * - `pendingChecks` ไม่เกี่ยวกับความครบ — เป็นกติกาที่ยังไม่รู้ ไม่ใช่ความผิดของไฟล์
 */

/**
 * ไฟล์นี้ **อ่านไม่ออกเลย** หรือเปล่า
 *
 * `POST /api/payroll/parse` เมื่อเก็บไฟล์แล้วแต่ตีความไม่ได้ จะบันทึกแถวเป็น `submitted`
 * พร้อม `errors: 1` — เลข 1 นั้นเป็นตัวหมายสมมติว่า “ไฟล์อ่านไม่ออก” **ไม่ใช่จำนวน
 * ข้อผิดพลาดจริงของด่าน 1** และในแถวไม่มีฟิลด์ไหนบอกตรง ๆ ว่าเป็นอย่างไหน
 * สิ่งที่ต่างกันคือ ไฟล์ที่อ่านออกจะมี `rows` กับ `columns` เสมอ (นับได้) ส่วนไฟล์ที่
 * อ่านไม่ออกไม่มีทั้งสองอย่าง เพราะไม่มีอะไรให้นับ
 *
 * ทุกที่ที่สรุปต้องแยกสองกรณีนี้ด้วยฟังก์ชันนี้ที่เดียว ห้ามเอาไปรวมกับ “ผิด 1 ข้อ”
 * เพราะสิ่งที่ฝ่ายต้องทำต่างกัน: อันแรกต้องส่งไฟล์ใหม่ อันหลังต้องแก้ข้อมูลในไฟล์
 */
export function isUnreadable(record: IntakeRecord): boolean {
  return (
    (record.errors ?? 0) > 0 &&
    typeof record.rows !== "number" &&
    typeof record.columns !== "number"
  );
}

/** ผ่านทั้งที่ด่าน 1 ยังมีข้อผิดพลาดค้าง — ต้องมีเหตุผลกำกับ */
export const isOverridden = (record: IntakeRecord): boolean =>
  record.stage === "passed" && (record.errors ?? 0) > 0;

export interface OwnerSummary {
  owner: IntakeOwner;
  tally: OwnerTally;
  /** รายการที่ไฟล์อ่านไม่ออก (นับแยก ไม่รวมกับข้อผิดพลาดของไฟล์ที่อ่านได้) */
  unreadable: number;
  /** รายการที่ผ่านโดยข้ามด่าน 1 */
  overridden: number;
}

export interface ItemRow {
  item: IntakeItem;
  record: IntakeRecord;
  unreadable: boolean;
  overridden: boolean;
  /** บวก = ช้า · ของที่ผ่านแล้วคิดจากวันที่รับจริง */
  lateDays: number;
}

export interface PeriodSummary {
  period: PeriodRef;
  owners: OwnerSummary[];
  /** ทุกรายการในขอบเขตเป็น `passed` */
  ready: boolean;
  /** ข้อความหนึ่งบรรทัดต่อหนึ่งรายการที่ยังไม่ผ่าน */
  blockers: string[];
  rows: ItemRow[];
}

const blockerText = (item: IntakeItem, record: IntakeRecord): string => {
  const head = `${item.owner} — ${item.id} ${item.title}`;
  if (record.stage === "submitted" && isUnreadable(record)) {
    return `${head}: อ่านไฟล์ไม่ได้ ต้องส่งไฟล์ใหม่`;
  }
  if (record.stage === "returned") return `${head}: ตีกลับให้แก้ ยังไม่ได้ส่งใหม่`;
  if (record.stage === "submitted") return `${head}: อัปโหลดแล้ว รอ HR ตรวจ`;
  return `${head}: ยังไม่ได้ส่ง`;
};

/**
 * @param items ขอบเขตที่จะสรุป — ค่าเริ่มต้นคือทะเบียนทั้งหมด · ผู้ใช้ที่ไม่ใช่ HR
 *   ต้องส่ง `visibleItems(identity)` มา ไม่งั้นรอบจะดูเหมือนขาดของที่ตัวเองไม่เห็นด้วยซ้ำ
 */
export function summarizePeriod(
  period: PeriodRef,
  records: Map<string, IntakeRecord>,
  now: Date,
  items: IntakeItem[] = INTAKE_ITEMS,
): PeriodSummary {
  const rows: ItemRow[] = items.map((item) => {
    const record = records.get(item.id) ?? emptyRecord(item.id);
    return {
      item,
      record,
      unreadable: record.stage !== "passed" && isUnreadable(record),
      overridden: isOverridden(record),
      lateDays: lateDays(item, period, record, now),
    };
  });

  const owners: OwnerSummary[] = OWNER_ORDER.filter((owner) =>
    items.some((item) => item.owner === owner),
  ).map((owner) => {
    const mine = rows.filter((row) => row.item.owner === owner);
    return {
      owner,
      tally: tallyOwner(
        mine.map((row) => row.item),
        period,
        records,
        now,
      ),
      unreadable: mine.filter((row) => row.unreadable).length,
      overridden: mine.filter((row) => row.overridden).length,
    };
  });

  const blockers = rows
    .filter((row) => row.record.stage !== "passed")
    .map((row) => blockerText(row.item, row.record));

  return { period, owners, ready: blockers.length === 0, blockers, rows };
}

/** ข้อความสถานะของรายการหนึ่ง — ไฟล์อ่านไม่ออกไม่ใช้ป้าย “อัปโหลดแล้ว” เฉย ๆ */
export const statusText = (row: ItemRow): string =>
  row.unreadable ? "อัปโหลดแล้ว (อ่านไฟล์ไม่ได้)" : STAGE_LABEL[row.record.stage];
