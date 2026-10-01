import { isExitStatus } from "./types";
import type { TraineeDailyEntry } from "./types";
import type { TraineeBoardDriver } from "./trainee-board";

/**
 * ตรรกะร่วมของหน้าติดตามฝึกงาน — **ใช้ได้ทั้ง server และ client** ไม่แตะ `mongodb`
 *
 * รับข้อมูลที่ `getTraineeBoard()` คัดมาแล้ว (เฉพาะคนที่ต้องติดตาม เฉพาะเดือนที่ดู)
 * แล้วประกอบเป็นแถวของตาราง · การคัดคนทำสองที่โดยตั้งใจ — ฝั่งเซิร์ฟเวอร์คัดเพื่อ
 * ไม่ให้ส่งของที่ไม่ได้ใช้ข้ามเน็ต ฝั่งนี้คัดซ้ำตามตัวกรองที่ผู้ใช้กดอยู่
 *
 * ข้อมูลสองชุดมาประกบกันที่นี่ที่เดียว — ของ ATMS (`driver.days`) กับของที่
 * ฝ่ายบุคคลกรอกเอง (`driver.manualDays` + สิ่งที่เพิ่งกรอกในหน้าจอ) ·
 * **ไม่มีตัวไหนทับตัวไหน** เพราะช่องในตารางถูกผ่าทแยงเป็นสองสามเหลี่ยม
 * ครึ่งบนของระบบ ครึ่งล่างของคนกรอก สองค่าจึงอยู่ด้วยกันได้ในช่องเดียว
 */

/**
 * โทนของช่อง — **`ฝ` (ฝึกงาน) กับ `A…` (ออกงาน) รวมเป็นกองเดียวชื่อ “ปฏิบัติงาน”**
 *
 * 🔀 รวมตามคำสั่งเจ้าของงาน (29 ก.ย. 2026) — เดิมแยก `ฝ` เป็นสีของตัวเอง แต่ทุกคนใน
 * ตารางนี้คือคนฝึกงานอยู่แล้ว (คัดด้วยสถานะ `ฝ` ใน `getTraineeBoard()`) การแยกสองกอง
 * จึงไม่ได้บอกอะไรเพิ่ม · ช่องยังแยกออกด้วยตัวอักษร `ฝ` / `A` บนสามเหลี่ยมอยู่ดี
 * **อย่าแยกกลับถ้าไม่ได้สั่ง**
 *
 * **มีแค่สามกอง ไม่มี “ไม่ได้งาน / อื่น ๆ” แล้ว** (ถอดออกตามคำสั่งเจ้าของงาน
 * 29 ก.ย. 2026) — รหัสที่ไม่ใช่ปฏิบัติงานหรือพ้นสภาพล้วนเป็นการหยุดงานทั้งหมด
 * (`ก` ลากิจ · `ป` ลาป่วย · `ย` หยุดไม่ได้รับเงิน · `จ` บาดเจ็บ · `กด`/`กม` กักตัว ·
 * `X` ตกคิว · `ล…` ลาแบบต่าง ๆ — ดู `WORK_STATUS_LABELS`) จึงนับเป็น “ลา” ทั้งหมด
 */
export type CellTone = "work" | "leave" | "exit";

/** สีพื้นของสามเหลี่ยม — ใช้เป็น `background` ของชั้นที่ถูก `clip-path` ตัด */
export const TONE_FILL: Record<CellTone, string> = {
  work: "var(--color-primary)",
  leave: "var(--color-st-wait-ink)",
  exit: "var(--color-alert)",
};

/** สีตัวอักษรบนสามเหลี่ยมสีนั้น */
export const TONE_TEXT: Record<CellTone, string> = {
  work: "text-primary-content",
  leave: "text-st-wait",
  /* `ink-content` พลิกเป็นสีเข้มในธีมมืดพอดีกับ `alert` ที่สว่างขึ้น */
  exit: "text-ink-content",
};

export const TONE_DOT: Record<CellTone, string> = {
  work: "bg-primary",
  leave: "bg-st-wait-ink",
  exit: "bg-alert",
};

export const TONE_LABEL: Record<CellTone, string> = {
  work: "ปฏิบัติงาน",
  leave: "ลา",
  exit: "พ้นสภาพ",
};

export const TONES: CellTone[] = ["work", "leave", "exit"];

/** รหัสฝึกงาน — นับเป็น “ปฏิบัติงาน” (`ฝ` = พจส.ฝึกงาน) */
const TRAIN_CODES = ["ฝ"];

/**
 * **ลำดับการตรวจสำคัญ** — `ลอ` (ลาออก) ขึ้นต้นด้วย “ล” ถ้าไม่เช็กการพ้นสภาพก่อน
 * วันสุดท้ายของคนที่ลาออกจะถูกย้อมเหลืองเหมือนวันลาธรรมดา · ปฏิบัติงาน = `ฝ` หรือ
 * ขึ้นต้นด้วย `A` · ที่เหลือทั้งหมดคือลา
 */
export function cellTone(code: string): CellTone {
  const value = code.trim();
  if (isExitStatus(value)) return "exit";
  if (TRAIN_CODES.includes(value) || value.toUpperCase().startsWith("A")) return "work";
  return "leave";
}

/* ------------------------------------------------------------ ช่องหนึ่งช่อง */

/**
 * หนึ่งช่องในตาราง = **หนึ่งวันของหนึ่งคน ที่มีได้สองค่าพร้อมกัน**
 *
 * `atms` มาจาก `Boom_ETL` (อ่านอย่างเดียว) · `manual` คือสิ่งที่ฝ่ายบุคคลกรอกเอง
 * ทั้งคู่ว่างพร้อมกันได้ (ยังไม่มีบันทึก) และมีพร้อมกันได้ (กรอกไว้ก่อน ระบบตามมาทีหลัง)
 */
export interface DayCell {
  atms: string;
  manual: string;
  note: string;
}

/** รหัสที่ใช้นับยอดรวมของแถว — ของระบบมาก่อนเสมอ เพราะตัวนั้นคือชุดที่ผูกกับค่าแรง */
export const effectiveCode = (cell: DayCell): string => cell.atms || cell.manual;

export interface TraineeRow {
  driver: TraineeBoardDriver;
  /** สถานะรายวันเฉพาะเดือนที่เลือก — คีย์เป็นเลขวัน */
  byDay: Map<number, DayCell>;
  /** วันปฏิบัติงาน — ฝึกงาน (`ฝ`) + ออกงาน (`A…`) รวมกัน */
  work: number;
  leave: number;
  exit: number;
  /** กี่วันในเดือนนี้ที่ฝ่ายบุคคลกรอกเอง */
  manualCount: number;
}

/* ------------------------------------------------------------ ตัวกรอง */

/*
 * ไม่มีตัวเลือก “ขอบเขต” (ทั้งหมด / มีวันฝึกงาน / อายุงาน < 4 เดือน) แล้ว — ถอดออก
 * 29 ก.ย. 2026 พร้อมกับที่เซิร์ฟเวอร์คัดเฉพาะคนที่มีสถานะ `ฝ` ในเดือนนั้น (ดู
 * `getTraineeBoard()`) · ทุกแถวที่มาถึงตรงนี้คือคนฝึกงานอยู่แล้ว ตัวเลือกจึงไม่เหลือ
 * อะไรให้เลือกจริง
 */
export interface TraineeFilter {
  /** `siteKey` ที่เลือกไว้ · ว่าง = ทุกสาขา */
  sites: string[];
  query: string;
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const isoOf = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

const norm = (v: string) => v.toLowerCase().replace(/[\s-]/g, "");

/**
 * สิ่งที่เพิ่งกรอกในหน้าจอรอบนี้ — **ทับของที่เซิร์ฟเวอร์ส่งมา ไม่ได้แทนที่**
 *
 * เก็บเป็นชั้นบน ๆ แทนที่จะ copy ของเซิร์ฟเวอร์มาทั้งก้อนตอน mount เพราะเดือน
 * เป็นพารามิเตอร์ของหน้า — เปลี่ยนเดือนแล้ว `drivers` ชุดใหม่เข้ามาทาง props
 * ถ้าก้อนที่ copy ไว้เป็นตัวจริง ของเดือนใหม่จะถูกของเก่าบังจนไม่ขึ้นเลย
 *
 * `null` = ลบบันทึกของวันนั้นไปแล้ว (ต่างจาก “ไม่มีคีย์” ที่แปลว่าไม่ได้แตะ)
 */
export type ManualEdits = Map<string, Record<string, TraineeDailyEntry | null>>;

/**
 * ประกอบแถวของเดือนที่เลือก แล้วกรองตามตัวกรองที่ผู้ใช้กดอยู่
 *
 * `drivers` ถูก `getTraineeBoard()` คัดมาแล้วว่าเป็น “คนที่ต้องติดตาม” ในเดือนนี้
 * (มีสถานะฝึกงาน `ฝ` ในเดือนนั้น ทั้งจาก ATMS หรือที่ฝ่ายบุคคลกรอกเอง)
 * ที่นี่จึงเหลือแค่กรองตามสาขา และคำค้นที่กดอยู่บนหน้าจอ
 *
 * เรียงคนใหม่สุดขึ้นก่อน — คนที่เพิ่งเริ่มคือคนที่ต้องจับตามากที่สุด · อายุงาน
 * เท่ากันค่อยเรียงตามชื่อ เพื่อให้ลำดับคงที่ไม่สลับไปมาทุกครั้งที่โหลด
 */
export function buildTraineeRows(
  drivers: TraineeBoardDriver[],
  edits: ManualEdits,
  filter: TraineeFilter,
): TraineeRow[] {
  return drivers
    .map<TraineeRow>((driver) => {
      const byDay = new Map<number, DayCell>();

      const cellOf = (iso: string): DayCell => {
        const day = Number(iso.slice(8, 10));
        let cell = byDay.get(day);
        if (!cell) {
          cell = { atms: "", manual: "", note: "" };
          byDay.set(day, cell);
        }
        return cell;
      };

      for (const [iso, code] of Object.entries(driver.days)) {
        if (code.trim()) cellOf(iso).atms = code;
      }

      // ของที่เซิร์ฟเวอร์ส่งมาก่อน แล้วทับด้วยสิ่งที่เพิ่งกรอกในหน้าจอ
      const own = { ...driver.manualDays, ...(edits.get(driver.drivercode) ?? {}) };

      for (const [iso, entry] of Object.entries(own)) {
        if (!entry?.code.trim()) continue;
        const cell = cellOf(iso);
        cell.manual = entry.code;
        cell.note = entry.note;
      }

      const row: TraineeRow = {
        driver,
        byDay,
        work: 0,
        leave: 0,
        exit: 0,
        manualCount: 0,
      };

      for (const cell of byDay.values()) {
        row[cellTone(effectiveCode(cell))]++;
        if (cell.manual) row.manualCount++;
      }

      return row;
    })
    .filter((row) => {
      if (filter.sites.length && !filter.sites.includes(row.driver.siteKey ?? "other")) return false;

      const q = norm(filter.query.trim());
      if (!q) return true;
      return (
        norm(row.driver.name).includes(q) ||
        norm(row.driver.drivercode).includes(q) ||
        norm(row.driver.plant).includes(q)
      );
    })
    .sort(
      (a, b) =>
        (a.driver.tenureMonths ?? 9999) - (b.driver.tenureMonths ?? 9999) ||
        a.driver.name.localeCompare(b.driver.name, "th"),
    );
}
