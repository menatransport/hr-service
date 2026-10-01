/**
 * รอบจ่าย — เดือนหนึ่งคือหนึ่งรอบ
 *
 * **ทุกอย่างที่คนเห็นเป็น พ.ศ.** ตามที่ใช้กันจริงในบริษัท ส่วนคีย์ที่ระบบใช้เรียงและ
 * เก็บลงฐานข้อมูลเป็น ค.ศ. (`2026-09`) เพราะเรียงลำดับได้ตรงไปตรงมาและตรงกับที่
 * ไฟล์/ระบบอื่นใช้ · แปลงกันที่ไฟล์นี้ที่เดียว อย่าไปแปลงเองในคอมโพเนนต์
 */

export const TH_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export const BE_OFFSET = 543;

export interface PeriodRef {
  /** ปี พ.ศ. */
  year: number;
  /** 0 = ม.ค. */
  month: number;
}

/** รอบที่เปิดให้ทำงานอยู่ตอนนี้ — ของจริงจะมาจาก `payroll_periods` */
export const CURRENT_PERIOD: PeriodRef = { year: 2569, month: 8 };

/**
 * รอบที่ปิดไปแล้ว — เปิดดูได้แต่อัปโหลดทับไม่ได้
 * (ตัวอย่างสำหรับ FE · ของจริงอ่านจากสถานะของรอบ)
 */
export const LOCKED_PERIODS: Record<number, number[]> = {
  2569: [0, 1, 2, 3, 4, 5, 6, 7],
};

/** `2569 / ก.ย.` → `"ก.ย. 2569"` */
export function periodLabel({ year, month }: PeriodRef): string {
  return `${TH_MONTHS[month]} ${year}`;
}

/** คีย์ที่ใช้ในฐานข้อมูลและชื่อไฟล์ — ค.ศ. เสมอ เช่น `2026-09` */
export function periodCode({ year, month }: PeriodRef): string {
  return `${year - BE_OFFSET}-${String(month + 1).padStart(2, "0")}`;
}

export function isLocked({ year, month }: PeriodRef): boolean {
  return (LOCKED_PERIODS[year] ?? []).includes(month);
}

/** รอบที่ยังมาไม่ถึง — เลือกได้ก็จริงแต่ยังไม่มีข้อมูลให้ส่ง */
export function isFuture({ year, month }: PeriodRef): boolean {
  return (
    year > CURRENT_PERIOD.year ||
    (year === CURRENT_PERIOD.year && month > CURRENT_PERIOD.month)
  );
}

export function isSelectable(period: PeriodRef): boolean {
  return !isLocked(period) && !isFuture(period);
}
