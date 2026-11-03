/**
 * ห้องเช่าของบริษัท (`/desk/rentals`) — ชนิดข้อมูล + กติกาคิดเงิน (**ฝั่ง client ใช้ได้**)
 *
 * ศึกษาจากเมนู “ห้องเช่า” ของ Mena-Next (`mena-next-lb/src/lib/apartment-rooms.ts`) กับไฟล์คุม
 * `ห้องเช่าบริษัท_ทะเบียนคุมห้องเช่าของบริษัท.xlsx` แล้วแก้ปัญหาที่ฝ่ายบุคคลแจ้ง (สรุปปรับปรุงห้องเช่า · แพรวา):
 *
 * 1. ข้อมูลคน (สถานะ · ประเภทโม่ · ลูกค้า/แพล้นท์) **ไม่เก็บซ้ำ** — อ่านสดจากทะเบียนประวัติ พจส. ทุกครั้ง
 *    การเข้าพักเก็บแค่ `drivercode` (ข้อมูลไม่ real-time / ประเภทโม่ไม่อัปเดต)
 * 2. ห้องหนึ่งพักได้ 2 คน (`capacity`) — ค่าน้ำไฟหารตามจำนวนคนที่พักในเดือนนั้น
 * 3. ตารางเดียว คอลัมน์ยืดตามชื่อ ไม่ตัดทับกัน
 * 4. **ยกเลิกสัญญาแล้วไม่ลบห้อง** — `status: "cancelled"` + `cancelledOn` เดือนก่อน ๆ ยังเห็นห้องนี้ครบ
 *    เดือนที่ยกเลิกขึ้นแดง “ยกเลิกสัญญา”
 *
 * วันที่ทุกช่องเป็น `YYYY-MM-DD` (ค.ศ.) · เดือนเป็น `YYYY-MM` · แสดงผลเป็น พ.ศ. ตอนวาดเท่านั้น
 */

/* ------------------------------------------------------------------ รูปแบบการจ่าย */

/**
 * สามแบบ (Bew 3 พ.ย. 2569) — “บริษัทจ่ายทั้งหมด” = **ค่าห้องเท่านั้น** น้ำ ไฟ ส่วนกลาง พจส. จ่ายเองเสมอ
 * จึงไม่มีแบบ “บริษัทจ่ายค่าห้อง · พจส. จ่ายน้ำไฟ” แยกอีก (`COMPANY_RENT_EMP_UTILITY` ของ Mena-Next อ่านเป็น `COMPANY_FULL`)
 */
export type RentPayMode = "COMPANY_FULL" | "COMPANY_CAP" | "EMPLOYEE_FULL";

export const PAY_MODES: RentPayMode[] = ["COMPANY_CAP", "COMPANY_FULL", "EMPLOYEE_FULL"];

export function toPayMode(v: unknown): RentPayMode {
  if (v === "COMPANY_RENT_EMP_UTILITY") return "COMPANY_FULL";
  return PAY_MODES.includes(v as RentPayMode) ? (v as RentPayMode) : "COMPANY_CAP";
}

export const PAY_MODE_LABEL: Record<RentPayMode, string> = {
  COMPANY_CAP: "หักส่วนต่างที่เกินเพดาน",
  COMPANY_FULL: "บริษัทจ่ายทั้งหมด",
  EMPLOYEE_FULL: "พจส. จ่ายเองทั้งหมด",
};

export const PAY_MODE_HINT: Record<RentPayMode, string> = {
  COMPANY_CAP: "บริษัทจ่ายค่าห้องไม่เกินเพดาน · เข้าพักครบ 4 เดือนแล้ว พจส. จ่ายส่วนที่เกิน · น้ำ ไฟ ส่วนกลาง พจส. จ่ายเอง",
  COMPANY_FULL: "บริษัทจ่ายค่าห้องทั้งหมด · น้ำ ไฟ ส่วนกลาง พจส. จ่ายเอง",
  EMPLOYEE_FULL: "เช่น พจร. — หักค่าห้อง น้ำ ไฟ ทั้งหมด",
};

export const DEFAULT_CAP = 2000;
/** เข้าพักกี่วันถึงเริ่มหักส่วนต่าง — ไฟล์เดิม `TODAY()-วันเข้าอยู่ > 119` */
export const CAP_GRACE_DAYS = 120;

export function payModeShort(mode: RentPayMode, cap: number | null): string {
  if (mode === "COMPANY_CAP") return `${PAY_MODE_LABEL.COMPANY_CAP} ${(cap ?? DEFAULT_CAP).toLocaleString("th-TH")}`;
  return PAY_MODE_LABEL[mode];
}

/* ------------------------------------------------------------------ ข้อมูล */

export type BillSource = "owner" | "self";
export const BILL_SOURCE_LABEL: Record<BillSource, string> = {
  owner: "บิลจากผู้ดูแล",
  self: "ต้องทำบิลเอง",
};

/** ธนาคารรับค่าเช่า — ป้ายแบบเดียวกับไฟล์คุมเดิม “ชื่อไทย (ตัวย่อ)” ค่าที่เก็บ = ป้าย */
export const BANK_OPTIONS = [
  "กสิกรไทย (KBANK)",
  "กรุงเทพ (BBL)",
  "ไทยพาณิชย์ (SCB)",
  "กรุงไทย (KTB)",
  "กรุงศรีอยุธยา (BAY)",
  "ทหารไทยธนชาต (TTB)",
  "ธนาคารออมสิน (GSB)",
  "ธ.ก.ส. (BAAC)",
  "ยูโอบี (UOB)",
  "ซีไอเอ็มบี ไทย (CIMBT)",
  "แลนด์ แอนด์ เฮ้าส์ (LH Bank)",
  "เกียรตินาคินภัทร (KKP)",
  "อาคารสงเคราะห์ (GHB)",
  "พร้อมเพย์",
] as const;

/** เงื่อนไขสัญญาขั้นต่ำ — ค่าที่เก็บ = ป้าย (ข้อมูลเดิมเป็นข้อความรูปแบบนี้อยู่แล้ว) */
export const CONTRACT_OPTIONS = [
  "ไม่มีขั้นต่ำ",
  ...[1, 2, 3, 4, 5, 6, 8, 9].map((n) => `สัญญาขั้นต่ำ ${n} เดือน`),
  "สัญญาขั้นต่ำ 1 ปี",
  "สัญญาขั้นต่ำ 2 ปี",
] as const;

export interface RentalApartment {
  id: string;
  name: string;
  /** ชื่อเจ้าของ/ผู้ดูแล */
  owner: string;
  phone: string;
  mapUrl: string;
  /** พิกัดหมุด — แกะจากลิงก์แผนที่ตอนบันทึก (ลิงก์สั้น maps.app.goo.gl ตามไปหา URL เต็มก่อน) · ไม่มี = ไม่ขึ้นบนแผนที่ */
  lat: number | null;
  lng: number | null;
  address: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  /** ข้อความเงื่อนไขสัญญา เช่น “สัญญาขั้นต่ำ 6 เดือน” */
  minContract: string;
  billSource: BillSource;
  remark: string;
  active: boolean;
}

export type RoomStatus = "active" | "cancelled";

export interface RentalRoom {
  id: string;
  apartmentId: string;
  roomNo: string;
  /** แพล้นท์ที่ห้องนี้ประจำ (ไม่ใช่ของคนพัก — ของคนอ่านจากทะเบียน) */
  plant: string;
  rent: number;
  deposit: number;
  /** จ่ายก่อนเข้า (ค่าห้องเดือนแรก + ประกัน) */
  advance: number;
  contractStart: string;
  /** พักได้กี่คน — 1 หรือ 2 */
  capacity: number;
  payMode: RentPayMode;
  /** เพดานของ `COMPANY_CAP` */
  cap: number | null;
  status: RoomStatus;
  cancelledOn: string;
  cancelReason: string;
  /** ห้องว่างที่แจ้งสรรหาแล้ว */
  recruitRequested: boolean;
  remark: string;
}

export type LivingWith = "alone" | "family";
export const LIVING_WITH_LABEL: Record<LivingWith, string> = {
  alone: "คนเดียว",
  family: "อยู่กับครอบครัว",
};

export interface RentalStay {
  id: string;
  roomId: string;
  apartmentId: string;
  /** รหัส พจส. ในทะเบียน — ว่าง = นำเข้าจากไฟล์เดิมแล้วยังจับคู่กับทะเบียนไม่ได้ */
  drivercode: string;
  /** ชื่อตอนบันทึก — ใช้แสดงเฉพาะแถวที่ยังไม่ผูกทะเบียน (แถวที่ผูกแล้วใช้ชื่อจากทะเบียนเสมอ) */
  nameAtEntry: string;
  livingWith: LivingWith;
  checkIn: string;
  /** ว่าง = ยังพักอยู่ */
  checkOut: string;
  note: string;
}

/**
 * การพ้นสภาพของผู้พัก — `resigned` ลาออก · `dismissed` ปลดออก/บริษัทให้ออก · `left` พ้นสภาพ (หายไป/ไม่ระบุ)
 * `source`: `registry` = ฝ่ายบุคคลบันทึกในทะเบียน · `work` = สถานะงานรายวันของ ETL (`ลอ`/`ปอ`) ยังไม่ได้บันทึกในทะเบียน
 */
export type ExitKind = "resigned" | "dismissed" | "left";
export const EXIT_KIND_LABEL: Record<ExitKind, string> = {
  resigned: "ลาออก",
  dismissed: "ปลดออก",
  left: "พ้นสภาพ",
};

export interface PersonExit {
  kind: ExitKind;
  /** วันที่ออก `YYYY-MM-DD` — ว่าง = ไม่ทราบวัน */
  on: string;
  source: "registry" | "work";
}

/** ข้อมูลคนจากทะเบียนประวัติ พจส. — อ่านสดทุกครั้ง ไม่เก็บลงห้องเช่า */
export interface RegistryPerson {
  drivercode: string;
  name: string;
  phone: string;
  photoUrl: string;
  /** false = พ้นสภาพแล้ว (ทะเบียน หรือสถานะงาน `ลอ`/`ปอ`) — ดู `exit` */
  active: boolean;
  exit: PersonExit | null;
  /** ตำแหน่ง เช่น Mixer L / Mixer S */
  position: string;
  customer: string;
  plant: string;
  startDate: string;
}

/** ประเภทรถตามตำแหน่งในทะเบียน — Mixer S / MS = 6 ล้อ · Mixer L = 10 ล้อ (คอลัมน์ “ประเภท” ของใบขอเบิก) */
export function vehicleClass(position: string | undefined): string {
  const p = (position ?? "").trim().toLowerCase();
  if (p === "ms" || p.endsWith(" s")) return "6 ล้อ";
  if (p.endsWith(" l")) return "10 ล้อ";
  return "";
}

export interface RentalBill {
  month: string;
  roomId: string;
  /**
   * ค่าห้องที่จ่ายจริงเดือนนี้ — ว่าง = ค่าห้องตามสัญญา (`RentalRoom.rent`)
   * ใช้เมื่อบิลเดือนนั้นไม่เท่าสัญญา เช่น คิดครึ่งเดือน · จ่ายล่วงหน้าไปแล้ว (= 0)
   */
  rent: number | null;
  electric: number | null;
  water: number | null;
  /** ส่วนกลาง และค่าอื่น ๆ ในบิล (ขยะ · ที่จอดรถ · คีย์การ์ด · ทำความสะอาด) */
  common: number | null;
}

export type BillField = "rent" | "electric" | "water" | "common";
export const BILL_FIELD_LABEL: Record<BillField, string> = {
  rent: "ค่าห้องเดือนนี้",
  electric: "ค่าไฟ",
  water: "ค่าน้ำ",
  common: "ส่วนกลาง/อื่น ๆ",
};
export const BILL_FIELDS: BillField[] = ["rent", "electric", "water", "common"];

/** บิลเดือนนั้นมีตัวเลขสักช่อง — ห้องที่ยกเลิกสัญญาแล้วขึ้นในรายงานเฉพาะเมื่อยังมีบิลค้างจ่าย */
export function billHasAmount(bill: Pick<RentalBill, BillField> | null): boolean {
  return Boolean(bill && BILL_FIELDS.some((k) => bill[k]));
}

/** ช่องที่หารให้ผู้พักตามวันที่พัก — น้ำ ไฟ ส่วนกลาง พจส. จ่ายเองทุกแบบ */
export const UTILITY_FIELDS = ["electric", "water", "common"] as const;
export type UtilityField = (typeof UTILITY_FIELDS)[number];

/* ------------------------------------------------------------------ เดือน/วัน */

export const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** `2026-11` → `พ.ย. 2569` / `พฤศจิกายน 2569` */
export function monthLabel(month: string, style: "short" | "full" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  return `${(style === "full" ? THAI_MONTHS_FULL : THAI_MONTHS_SHORT)[m - 1]} ${y + 543}`;
}

/** `2026-11-03` → `3 พ.ย. 69` */
export function thaiDate(iso: string, year: "short" | "full" = "short"): string {
  if (!isIsoDate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const be = y + 543;
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${year === "short" ? String(be).slice(2) : be}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysInMonth(month: string): number {
  return Number(monthEnd(month).slice(8));
}

/** ระยะเวลาเข้าพักแบบอ่านง่าย — `1 ปี 3 ด.` · `2 ด.` · `12 วัน` */
export function stayLength(days: number): string {
  if (days < 0) return "ยังไม่เข้าพัก";
  if (days < 31) return `${days} วัน`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} ด.`;
  const y = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${y} ปี ${rest} ด.` : `${y} ปี`;
}

/* ------------------------------------------------------------------ ห้องในเดือน */

/** ห้องนี้นับอยู่ในเดือนนั้นไหม — ยกเลิกสัญญาก่อนต้นเดือนเท่านั้นที่หลุด · ยังไม่ถึงวันทำสัญญาก็ยังไม่ขึ้น */
export function roomInMonth(room: Pick<RentalRoom, "status" | "cancelledOn" | "contractStart">, month: string) {
  if (room.contractStart && room.contractStart > monthEnd(month)) return false;
  if (room.status === "cancelled" && room.cancelledOn && room.cancelledOn < monthStart(month)) return false;
  return true;
}

/** ยกเลิกสัญญาแล้ว ณ สิ้นเดือนนั้น */
export function cancelledBy(room: Pick<RentalRoom, "status" | "cancelledOn">, month: string) {
  return room.status === "cancelled" && (!room.cancelledOn || room.cancelledOn <= monthEnd(month));
}

/**
 * **วันย้ายออกไม่นับเป็นวันพัก** — ย้ายออก 22 ต.ค. = พักถึง 21 ต.ค. · คนที่ย้ายเข้า 22 ต.ค. เริ่มนับวันที่ 22
 * (ฝ่ายบุคคลคิดแบบนี้มาตลอด เช่นห้อง 206 พูนทรัพย์ ต.ค. 2569) · ย้ายห้องตอนขึ้นเดือน = ออก 1 พ.ย. เข้าห้องใหม่ 1 พ.ย.
 */
export function stayInMonth(stay: Pick<RentalStay, "checkIn" | "checkOut">, month: string) {
  if (stay.checkIn && stay.checkIn > monthEnd(month)) return false;
  if (stay.checkOut && stay.checkOut <= monthStart(month)) return false;
  return true;
}

/** ช่วงที่พักจริงในเดือนนั้น (รวมทั้งสองปลาย) · ไม่ทราบวันเข้าพัก = ถือว่าพักตั้งแต่ต้นเดือน */
export function stayRange(stay: Pick<RentalStay, "checkIn" | "checkOut">, month: string) {
  const start = monthStart(month);
  const end = monthEnd(month);
  const from = stay.checkIn && stay.checkIn > start ? stay.checkIn : start;
  const lastNight = stay.checkOut ? addDays(stay.checkOut, -1) : end;
  const to = lastNight < end ? lastNight : end;
  return { from, to, days: to < from ? 0 : daysBetween(from, to) + 1 };
}

/* ------------------------------------------------------------------ คิดเงิน */

export interface OccupantCharge {
  stayId: string;
  /** วันที่เข้าพักนับถึงวันอ้างอิงของเดือน */
  days: number;
  /** วันที่พักในเดือนนี้ (ตาม `stayRange`) */
  monthDays: number;
  /** ครบ 4 เดือนแล้ว — เริ่มหักส่วนต่าง (เฉพาะ `COMPANY_CAP`) */
  pastGrace: boolean;
  rent: number;
  electric: number;
  water: number;
  common: number;
  /** น้ำ + ไฟ + ส่วนกลาง ส่วนของคนนี้ */
  utility: number;
  /** ยอดหัก พจส. คนนี้ */
  deduct: number;
}

export interface RoomCharge {
  /** ค่าห้องเดือนนี้ — บิลระบุไว้ (`RentalBill.rent`) หรือค่าห้องตามสัญญา */
  rent: number;
  /** ค่าห้องเดือนนี้ไม่เท่าสัญญา (มีค่าในบิล) */
  rentOverride: boolean;
  utility: number;
  /** ค่าห้องส่วนบริษัท */
  companyRent: number;
  /** ค่าห้องส่วน พจส. (รวมทุกคน) */
  employeeRent: number;
  /** น้ำไฟของวันที่ห้องว่าง — ไม่มีใครพัก บริษัทรับไป */
  companyUtility: number;
  /** รวมยอดหัก พจส. (ค่าห้อง + น้ำไฟ ของทุกคน) */
  deduct: number;
  /** รวมจ่ายทั้งหมดของห้อง (ยอดที่ขอเบิกจ่ายเจ้าของห้อง) */
  total: number;
  /** จำนวนวันของเดือน — ตัวหารของการหารตามวัน */
  monthDays: number;
  occupants: OccupantCharge[];
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * แบ่ง `total` ตามสัดส่วน `weights` (รวมกัน = 1) ให้ผลรวม**ตรงยอดเดิมเป๊ะ** — ปัดเป็นบาท
 * (ยอดมีเศษสตางค์ = ปัดเป็นสตางค์) เศษที่เหลือให้ส่วนที่ทศนิยมมากสุดก่อน
 * · 217 × 21/31 = 146.99 → 147 · 217 × 10/31 = 70.00 → 70 · รวม 217 พอดีบิล
 */
export function allocate(total: number, weights: number[]): number[] {
  if (!total) return weights.map(() => 0);
  const unit = Number.isInteger(total) ? 1 : 0.01;
  const units = Math.round(total / unit);
  const raw = weights.map((w) => units * w);
  const out = raw.map(Math.floor);
  let left = units - out.reduce((t, v) => t + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      out[i] += 1;
      left -= 1;
    }
  }
  return out.map((v) => round(v * unit));
}

/**
 * ส่วนแบ่งของแต่ละคนตาม**วันที่พักจริง** — ทีละวันของเดือน: วันนั้นมีกี่คนพัก หารกันเท่า ๆ กัน ·
 * วันที่ไม่มีใครพัก = ส่วนของบริษัท (ช่องสุดท้าย) · ผลรวมทุกช่อง = 1
 *
 * - คนเดียวพักทั้งเดือน = 1 · สองคนพักทั้งเดือน = ½ คนละครึ่ง (เท่ากติกาเดิม “พัก 2 คนหารเท่ากัน”)
 * - ย้ายออก 22 ต.ค. / คนใหม่เข้า 22 ต.ค. = 21/31 กับ 10/31
 */
export function dayShares(stays: Pick<RentalStay, "checkIn" | "checkOut">[], month: string): number[] {
  const total = daysInMonth(month);
  const ranges = stays.map((s) => stayRange(s, month));
  const shares = new Array<number>(stays.length + 1).fill(0);
  for (let d = 1; d <= total; d += 1) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const here = ranges.flatMap((r, i) => (r.days && r.from <= iso && iso <= r.to ? [i] : []));
    if (!here.length) shares[stays.length] += 1 / total;
    for (const i of here) shares[i] += 1 / here.length / total;
  }
  return shares;
}

/**
 * เงินของห้องหนึ่งในหนึ่งเดือน — ยกกติกาจากสูตรในไฟล์คุมเดิม (คอลัมน์ AA/AD/AE/AI/AJ)
 *
 * - ยอดจ่ายเจ้าของห้อง = ค่าห้องเดือนนี้ + น้ำ + ไฟ + ส่วนกลาง/อื่น ๆ (ตามบิลเต็มของห้อง)
 * - น้ำ ไฟ ส่วนกลาง พจส. จ่ายเองทุกรูปแบบ — `COMPANY_FULL` บริษัทจ่ายแค่ค่าห้อง
 * - **หารตามวันที่พักจริง** (`dayShares`) ทั้งน้ำไฟและค่าห้องส่วนของ พจส. — เปลี่ยนคนกลางเดือน
 *   คนเก่าจ่ายถึงวันก่อนย้ายออก คนใหม่จ่ายตั้งแต่วันเข้า · วันที่ห้องว่างบริษัทรับ · ปัดเป็นบาทแยกทีละรายการ
 * - `COMPANY_CAP`: คนที่ยังไม่ครบ 4 เดือน ส่วนเกินเพดานของเขาบริษัทรับไป (สูตรเดิม “ยังไม่ครบ 4 เดือน” = 0)
 *
 * `asOf` = วันที่ใช้นับ 4 เดือน — สิ้นเดือนนั้น หรือวันนี้ถ้าเดือนยังไม่จบ
 */
export function chargeRoom(
  room: Pick<RentalRoom, "rent" | "payMode" | "cap">,
  stays: Pick<RentalStay, "id" | "checkIn" | "checkOut">[],
  bill: Pick<RentalBill, "rent" | "electric" | "water" | "common"> | null,
  month: string,
  asOf: string,
): RoomCharge {
  const rentOverride = bill?.rent != null;
  const rent = (rentOverride ? bill?.rent : room.rent) || 0;
  const items = { electric: bill?.electric ?? 0, water: bill?.water ?? 0, common: bill?.common ?? 0 };
  const utility = round(items.electric + items.water + items.common);
  const monthDays = daysInMonth(month);
  const base = { rent, rentOverride, utility, total: round(rent + utility), monthDays };

  if (!stays.length) {
    return { ...base, companyRent: rent, employeeRent: 0, companyUtility: utility, deduct: 0, occupants: [] };
  }

  const shares = dayShares(stays, month);
  const vacant = stays.length;
  const split = Object.fromEntries(UTILITY_FIELDS.map((k) => [k, allocate(items[k], shares)])) as Record<
    UtilityField,
    number[]
  >;

  const graceOf = stays.map((s) => (s.checkIn ? daysBetween(s.checkIn, asOf) : 0));
  const empRentBase =
    room.payMode === "EMPLOYEE_FULL" ? rent : room.payMode === "COMPANY_CAP" ? Math.max(rent - (room.cap ?? DEFAULT_CAP), 0) : 0;
  const rentSplit = allocate(empRentBase, shares);

  const occupants = stays.map((s, i): OccupantCharge => {
    const pastGrace = graceOf[i] >= CAP_GRACE_DAYS;
    const shareRent = room.payMode === "COMPANY_CAP" && !pastGrace ? 0 : rentSplit[i];
    const shareUtility = round(split.electric[i] + split.water[i] + split.common[i]);
    return {
      stayId: s.id,
      days: graceOf[i],
      monthDays: stayRange(s, month).days,
      pastGrace,
      rent: shareRent,
      electric: split.electric[i],
      water: split.water[i],
      common: split.common[i],
      utility: shareUtility,
      deduct: round(shareRent + shareUtility),
    };
  });

  const employeeRent = round(occupants.reduce((t, o) => t + o.rent, 0));
  return {
    ...base,
    companyRent: round(rent - employeeRent),
    employeeRent,
    companyUtility: round(split.electric[vacant] + split.water[vacant] + split.common[vacant]),
    deduct: round(occupants.reduce((t, o) => t + o.deduct, 0)),
    occupants,
  };
}

/* ------------------------------------------------------------------ กระดานรายเดือน */

export interface BoardOccupant {
  stay: RentalStay;
  /** `null` = ยังไม่ผูกทะเบียน หรือรหัสนี้ไม่อยู่ในทะเบียนแล้ว */
  person: RegistryPerson | null;
  charge: OccupantCharge;
}

export type BoardRoomState = "occupied" | "partial" | "vacant" | "moving-out" | "cancelled";

export const ROOM_STATE_LABEL: Record<BoardRoomState, string> = {
  occupied: "พักอยู่",
  partial: "พักอยู่ · ว่าง 1 ที่",
  vacant: "ห้องว่าง",
  "moving-out": "รอย้ายออก",
  cancelled: "ยกเลิกสัญญา",
};

export interface BoardRoom {
  room: RentalRoom;
  apartment: RentalApartment;
  occupants: BoardOccupant[];
  bill: RentalBill | null;
  charge: RoomCharge;
  state: BoardRoomState;
}

export interface RentalBoard {
  month: string;
  /** วันอ้างอิงที่ใช้นับ 4 เดือน */
  asOf: string;
  today: string;
  apartments: RentalApartment[];
  rooms: BoardRoom[];
  /** อ่านทะเบียน พจส. ไม่สำเร็จ — ห้องยังขึ้นครบ แต่ชื่อ/สถานะคนหาย */
  registryFailed: boolean;
}

/**
 * สถานะห้องในเดือนนั้น — คิดจากข้อมูลจริงทั้งหมด ไม่มีช่องให้กรอกเอง (ไฟล์เดิมคีย์มือแล้วไม่ตรง)
 * “รอย้ายออก” = มีคนที่ทะเบียนบอกว่าพ้นสภาพแล้วแต่ยังไม่ได้บันทึกย้ายออก
 */
export function roomState(
  room: RentalRoom,
  occupants: { stay: RentalStay; person: RegistryPerson | null }[],
  month: string,
): BoardRoomState {
  if (cancelledBy(room, month)) return "cancelled";
  const current = occupants.filter((o) => !o.stay.checkOut || o.stay.checkOut > monthEnd(month));
  if (!current.length) return "vacant";
  if (current.some((o) => exitedBy(o.person, month))) return "moving-out";
  return current.length < room.capacity ? "partial" : "occupied";
}

/* ------------------------------------------------------------------ รายงานขอเบิกค่าเช่า */

/**
 * ห้องที่ต้องจ่ายเจ้าของในเดือนนั้น — แถวของบันทึกขออนุมัติ/ใบขอเบิก (`report-modal.tsx`)
 *
 * ทุกห้องที่อยู่ในเดือนนั้น รวมห้องว่าง (บริษัทยังจ่ายค่าห้อง) · ห้องที่ยกเลิกสัญญาแล้ว
 * ขึ้นเฉพาะเมื่อเดือนนั้นยังมีบิล (ค่าห้อง/น้ำไฟงวดสุดท้าย) — ไม่มีบิล = ไม่ได้จ่าย
 * (ตรงกับใบขอเบิก ต.ค. 2569 ที่ฝ่ายบุคคลส่งบัญชี) · `getMonthTotals()` ใช้กติกาเดียวกัน
 */
export function reportRooms(rooms: BoardRoom[]): BoardRoom[] {
  return rooms.filter((r) => r.state !== "cancelled" || billHasAmount(r.bill));
}

export interface ReportApartment {
  apartment: RentalApartment;
  rooms: BoardRoom[];
  total: number;
}

/** จัดกลุ่มตามที่พัก (ลำดับเดียวกับกระดาน) พร้อมยอดรวม */
export function reportGroups(rooms: BoardRoom[]): ReportApartment[] {
  const out: ReportApartment[] = [];
  for (const r of reportRooms(rooms)) {
    const last = out.at(-1);
    if (last?.apartment.id === r.apartment.id) {
      last.rooms.push(r);
      last.total = round(last.total + r.charge.total);
    } else out.push({ apartment: r.apartment, rooms: [r], total: r.charge.total });
  }
  return out;
}

/** พ้นสภาพแล้ว ณ สิ้นเดือนนั้น — ไม่ทราบวันที่ถือว่าออกแล้ว · ออกเดือนหลังยังนับว่าพักอยู่ในเดือนนั้น */
export function exitedBy(person: RegistryPerson | null, month: string): boolean {
  if (!person || person.active) return false;
  return !person.exit?.on || person.exit.on <= monthEnd(month);
}

/** ผู้พักที่พ้นสภาพแล้วแต่ยังไม่บันทึกย้ายออกภายในเดือนนั้น — แจ้งเตือนบนหน้าห้องเช่า */
export function needsCheckOut(o: { stay: RentalStay; person: RegistryPerson | null }, month: string): boolean {
  return exitedBy(o.person, month) && (!o.stay.checkOut || o.stay.checkOut > monthEnd(month));
}

/** `ลาออก 2 พ.ย. 69` */
export function exitText(exit: PersonExit | null): string {
  if (!exit) return EXIT_KIND_LABEL.left;
  return `${EXIT_KIND_LABEL[exit.kind]}${exit.on ? ` ${thaiDate(exit.on)}` : ""}`;
}

/** ชื่อที่แสดงของผู้พัก — ทะเบียนก่อนเสมอ */
export function occupantName(o: { stay: RentalStay; person: RegistryPerson | null }): string {
  return o.person?.name || o.stay.nameAtEntry || o.stay.drivercode || "—";
}
