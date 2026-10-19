import { BE_OFFSET, periodCode, type PeriodRef } from "../period";

/**
 * รอบ hr ↔ เดือนของระบบรถร่วม — **แปลงที่ไฟล์นี้ที่เดียว**
 *
 * - hr: `PeriodRef` (ปี พ.ศ. + เดือน 0–11) · คีย์ในฐาน `periodCode()` = `"2026-09"` (ค.ศ.)
 * - รถร่วม: `payroll_entries.month` = `"YYYY-MM"` ค.ศ. เป็น **งวดงาน** — เที่ยวที่วิ่ง
 *   (`trips.date` ในเดือนนั้น) วันทำงาน และหักต่าง ๆ ของเดือนนั้น (`payroll-engine.ts`)
 *
 * รูปแบบตัวอักษรตรงกันอยู่แล้ว ที่ยังไม่รู้คือ **ความหมาย**: รอบ hr ก.ย. จ่ายงานของเดือน
 * ก.ย. หรือของเดือน ส.ค. — `PARTNER_MONTH_OFFSET` คือคำตอบนั้นเป็นตัวเลขเดียว
 *
 * **ค่าเริ่มต้น 0 = รอบ hr เดือน X อ่านงวดงานรถร่วมเดือน X** (รอเจ้าของ/บัญชียืนยัน) ·
 * ถ้าคำตอบคือ "รอบ ก.ย. จ่ายงาน ส.ค." ให้เปลี่ยนเป็น `-1` ที่นี่ที่เดียว ไม่ต้องแก้ที่อื่น
 */
export const PARTNER_MONTH_OFFSET = 0;

const shift = (year: number, month0: number, by: number): { year: number; month0: number } => {
  const total = year * 12 + month0 + by;
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
};

/** รอบ hr → เดือนของ `payroll_entries` เช่น `{2569, 8}` → `"2026-09"` (offset 0) */
export function partnerMonthOf(period: PeriodRef, offset: number = PARTNER_MONTH_OFFSET): string {
  const { year, month0 } = shift(period.year - BE_OFFSET, period.month, offset);
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}

/** เดือนของ `payroll_entries` → รอบ hr · รูปแบบไม่ตรงคืน `null` */
export function periodOfPartnerMonth(
  month: string,
  offset: number = PARTNER_MONTH_OFFSET,
): PeriodRef | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return null;
  const { year, month0 } = shift(Number(match[1]), Number(match[2]) - 1, -offset);
  return { year: year + BE_OFFSET, month: month0 };
}

/** offset 0 ทำให้สองคีย์เป็นตัวอักษรเดียวกัน — ไว้ให้เทสต์ยืนยันว่าไม่มีใครแปลงซ้ำที่อื่น */
export const isIdentityMapping = (): boolean =>
  partnerMonthOf({ year: 2569, month: 8 }) === periodCode({ year: 2569, month: 8 });
