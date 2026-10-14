import {
  emptyRecord,
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
 * ไฟล์นี้ **อ่านไม่ออกเลย** หรือเปล่า — อ่านจากธงบนแถวที่เส้น 422 ของ
 * `POST /api/payroll/parse` เขียนไว้ตรง ๆ (`unreadable`) ไม่ใช่เดาจากฟิลด์ที่ไม่มีค่า
 *
 * ทุกที่ที่สรุปต้องแยกสองกรณีนี้ด้วยฟังก์ชันนี้ที่เดียว ห้ามเอาไปรวมกับ “ผิด 1 ข้อ”
 * เพราะสิ่งที่ฝ่ายต้องทำต่างกัน: อันแรกต้องส่งไฟล์ใหม่ อันหลังต้องแก้ข้อมูลในไฟล์
 *
 * แถวที่เขียนไว้ก่อนจะมีฟิลด์นี้จะอ่านได้ว่า "อ่านออก" — เหมือนแถวเก่าที่ไม่มี
 * `checkedAt` แล้วกดผ่านไม่ได้ คือยอมให้ของเก่าตกไปตามความจริงที่บันทึกไว้จริง
 * ไม่ใช่เดาแทน
 */
export function isUnreadable(record: IntakeRecord): boolean {
  return record.unreadable === true;
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
}

export interface PeriodSummary {
  period: PeriodRef;
  owners: OwnerSummary[];
  /** ทุกรายการในขอบเขตเป็น `passed` */
  ready: boolean;
  /** ข้อความหนึ่งบรรทัดต่อหนึ่งรายการที่ยังไม่ผ่าน */
  blockers: string[];
  rows: ItemRow[];
  /** สรุปแค่บางฝ่าย (ผู้ใช้ที่ไม่ใช่ HR) — ตัวเลขทั้งหมดไม่ใช่ภาพของทั้งรอบ */
  scoped: boolean;
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

  return {
    period,
    owners,
    /* ไม่มีรายการในขอบเขตเลย = ไม่มีอะไรให้ยืนยัน ไม่ใช่ “พร้อม” */
    ready: rows.length > 0 && blockers.length === 0,
    blockers,
    rows,
    scoped: items.length < INTAKE_ITEMS.length,
  };
}

/** ข้อความสถานะของรายการหนึ่ง — ไฟล์อ่านไม่ออกไม่ใช้ป้าย “อัปโหลดแล้ว” เฉย ๆ */
export const statusText = (row: ItemRow): string =>
  row.unreadable ? "อัปโหลดแล้ว (อ่านไฟล์ไม่ได้)" : STAGE_LABEL[row.record.stage];

/**
 * บรรทัดบอกสถานะรอบ ใช้ทั้งบนหน้าและในไฟล์ Excel
 *
 * สรุปของฝ่ายเดียวต้องไม่พูดว่า “รอบครบ” เพราะฝ่ายอื่นอาจยังไม่ส่ง คนอ่านอาจเอาไปบอก
 * ฝ่ายเงินเดือนว่าพร้อมแล้ว — จึงพูดแค่ว่า “ของฝ่ายนี้” ผ่านครบหรือยัง
 */
export function readinessLine(summary: PeriodSummary): string {
  const left = summary.blockers.length;
  if (summary.rows.length === 0) return "ไม่มีรายการในความรับผิดชอบของคุณให้สรุปในรอบนี้";
  if (!summary.scoped) {
    return summary.ready
      ? "ทุกรายการตรวจผ่านครบแล้ว"
      : `ยังไม่ครบ — เหลือ ${left} รายการที่ยังไม่ผ่าน`;
  }
  const who = summary.owners.map((o) => o.owner).join(" และ ");
  return summary.ready
    ? `รายการของ${who} ผ่านครบแล้ว`
    : `รายการของ${who} ยังไม่ครบ — เหลือ ${left} รายการ`;
}

/** ขึ้นคู่กับ `readinessLine` เมื่อ `scoped` — ตัวเลขนี้ไม่ใช่ภาพของทั้งรอบ */
export const SCOPED_NOTE =
  "ตัวเลขชุดนี้นับเฉพาะรายการของฝ่ายคุณ ยังบอกไม่ได้ว่าทั้งรอบครบหรือยัง — ถ้าจะรู้ว่ารอบพร้อมหรือไม่ ให้ถามฝ่ายค่าจ้างและสวัสดิการ";

export const NO_REASON_TEXT = "ไม่มีเหตุผลบันทึกไว้";
