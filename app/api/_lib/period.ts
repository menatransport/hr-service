/**
 * ตัวกรองช่วงเวลา `?year=&month=` ของเส้นรายการ (`GET /api/drivers` · `GET /api/recruitment/applications`)
 *
 * - `year` — ค.ศ. หรือ พ.ศ. ก็ได้ (เกิน 2400 = พ.ศ. ลบ 543 ให้)
 * - `month` — `1`–`12` คู่กับ `year` · หรือ `YYYY-MM` ตัวเดียวจบ
 * - ไม่ส่งทั้งคู่ = ไม่กรอง (`null`)
 *
 * ช่วงนับตามเวลาไทยเสมอ — `from`/`to` เป็นวันแรก/วันสุดท้าย (รวม) แบบ `YYYY-MM-DD`
 * ส่วน `gte`/`lt` เป็นเวลา ISO (UTC) ไว้เทียบกับฟิลด์เวลาอย่าง `createdAt`
 */

export class PeriodError extends Error {}

export interface Period {
  year: number;
  month: number | null;
  /** วันแรกของช่วง `YYYY-MM-DD` */
  from: string;
  /** วันสุดท้ายของช่วง (รวม) `YYYY-MM-DD` */
  to: string;
  /** เวลาเริ่มช่วง (00:00 เวลาไทย) เป็น ISO UTC */
  gte: string;
  /** เวลาเริ่มของช่วงถัดไป (ไม่รวม) เป็น ISO UTC */
  lt: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const bangkokMidnight = (y: number, m: number) => new Date(`${y}-${pad(m)}-01T00:00:00+07:00`).toISOString();

function toYear(raw: string): number {
  if (!/^\d{4}$/.test(raw)) throw new PeriodError("year ต้องเป็นปี 4 หลัก เช่น 2026 หรือ 2569");
  const y = Number(raw) > 2400 ? Number(raw) - 543 : Number(raw);
  if (y < 2000 || y > 2100) throw new PeriodError("year อยู่นอกช่วงที่รับได้");
  return y;
}

function toMonth(raw: string): number {
  const m = /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  if (!(m >= 1 && m <= 12)) throw new PeriodError("month ต้องเป็น 1–12 หรือ YYYY-MM");
  return m;
}

/** อ่าน `year` / `month` จาก query — ค่าผิดรูปแบบโยน `PeriodError` (ตอบ 400) */
export function readPeriod(params: URLSearchParams): Period | null {
  const rawYear = params.get("year")?.trim() ?? "";
  const rawMonth = params.get("month")?.trim() ?? "";
  if (!rawYear && !rawMonth) return null;

  let year: number;
  let month: number | null = null;

  const ym = /^(\d{4})-(\d{1,2})$/.exec(rawMonth);
  if (ym) {
    year = toYear(ym[1]);
    month = toMonth(ym[2]);
    if (rawYear && toYear(rawYear) !== year) throw new PeriodError("year ไม่ตรงกับปีใน month");
  } else {
    if (!rawYear) throw new PeriodError("ส่ง month เป็นเลขเดือนต้องมี year ด้วย (หรือใช้ month=YYYY-MM)");
    year = toYear(rawYear);
    if (rawMonth) month = toMonth(rawMonth);
  }

  const [nextY, nextM] = month === null ? [year + 1, 1] : month === 12 ? [year + 1, 1] : [year, month + 1];
  const lastDay = month === null ? 31 : new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    year,
    month,
    from: `${year}-${pad(month ?? 1)}-01`,
    to: `${year}-${pad(month ?? 12)}-${pad(lastDay)}`,
    gte: bangkokMidnight(year, month ?? 1),
    lt: bangkokMidnight(nextY, nextM),
  };
}
