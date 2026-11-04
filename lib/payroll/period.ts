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

/** `2026-09` → รอบ (พ.ศ.) · รูปแบบไม่ตรงคืน `null` */
export function periodFromCode(code: string | null | undefined): PeriodRef | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(code ?? "");
  if (!match) return null;
  return { year: Number(match[1]) + BE_OFFSET, month: Number(match[2]) - 1 };
}

/**
 * รอบเริ่มต้นของหน้า เมื่อมี `?period=` มาจากลิงก์ในอีเมล — รูปแบบผิดหรือเลือกไม่ได้
 * (ปิดแล้ว/ยังมาไม่ถึง) ให้ถอยกลับไปรอบปัจจุบัน ไม่ใช่พาไปเปิดรอบที่ทำอะไรไม่ได้
 */
export function initialPeriod(code: string | null | undefined): PeriodRef {
  const wanted = periodFromCode(code);
  return wanted && isSelectable(wanted) ? wanted : CURRENT_PERIOD;
}

/**
 * รอบที่ **เขียนข้อมูลได้** — ต้องเรียกที่เซิร์ฟเวอร์ทุกเส้นที่เขียนทะเบียน
 *
 * `isLocked`/`isSelectable` เดิมถูกใช้แค่ในหน้าจอ ซึ่งกันได้เฉพาะคนที่กดผ่านหน้าจอ —
 * ยิง `POST /api/payroll/parse` หรือ `PATCH /api/payroll/intake` ตรง ๆ ด้วย
 * `2026-03` (รอบที่ปิดแล้ว) หรือ `2099-01` (รอบที่ไม่มีจริง) ก็อัปโหลดเข้าได้
 * และได้แถวขยะในคอลเลกชันที่ไม่มีใครเห็นบนหน้าจอ
 *
 * ยังอ่านจาก `LOCKED_PERIODS` + `CURRENT_PERIOD` ตามเดิม **ไม่สร้างคอลเลกชัน
 * `payroll_periods`** ซึ่งเป็นงานที่ตั้งใจพักไว้
 */
export type WritablePeriod =
  | { ok: true; period: PeriodRef }
  | { ok: false; message: string };

export function writablePeriod(code: string | null | undefined): WritablePeriod {
  const period = periodFromCode(code);
  if (!period) {
    return { ok: false, message: "ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09" };
  }
  if (isLocked(period)) {
    return {
      ok: false,
      message: `รอบ ${periodLabel(period)} ปิดแล้ว — เปิดดูย้อนหลังได้ แต่ส่งของเข้ารอบนี้ไม่ได้อีก`,
    };
  }
  if (isFuture(period)) {
    return {
      ok: false,
      message: `รอบ ${periodLabel(period)} ยังมาไม่ถึง — ส่งของเข้าได้เมื่อถึงรอบนั้นแล้ว`,
    };
  }
  return { ok: true, period };
}
