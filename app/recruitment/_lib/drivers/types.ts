import { CarFront, IdCard } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ExitType } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * ทะเบียนประวัติ พจส. — ชนิดข้อมูลและตัวช่วยแสดงผล **ใช้ได้ทั้ง server และ client**
 *
 * แยกจาก `registry.ts` เพราะไฟล์นั้น `import "mongodb"` — ตารางฝั่ง client
 * จะลากไดรเวอร์ทั้งก้อนเข้าบันเดิลทันทีถ้าเอาชนิดข้อมูลไปไว้ด้วยกัน
 * (ท่าเดียวกับ `lib/recruitment/types.ts`)
 *
 * **คำศัพท์กับรหัสทั้งหมดในไฟล์นี้ลอกมาจากระบบที่ใช้งานจริง** —
 * `mena-next-lb/src/lib/main-driver-registry.ts` หน้า `/registry-history`
 * ฝ่ายบุคคลอ่านคำเหล่านี้อยู่ทุกวันแล้ว **ห้ามเปลี่ยนคำเอง** ("ลูกค้า" ไม่ใช่
 * "กลุ่มรถ", "แพล้นท์" ไม่ใช่ "โรงงาน", "พจส." ไม่ใช่ "พนักงานประจำ")
 *
 * **ทุกอย่างที่ต้องอ่านนาฬิกาถูกคิดมาจากฝั่งเซิร์ฟเวอร์แล้ว** (`licenseDaysLeft`,
 * `tenureMonths`) — ถ้าให้ client คำนวณเอง วันที่ของเครื่องผู้ใช้กับของเซิร์ฟเวอร์
 * จะให้ผลต่างกันตอน hydrate แล้ว React จะเตือนทั้งหน้า
 */

/* ------------------------------------------------------- ประเภทพนักงาน */

export type OwnerTypeKey = "1" | "2" | "3" | "4";

/** 1=พจส. 2=พจร. 3=สนง 4=พจส.สแปร์ — ตรงกับที่ ATMS ใช้ */
export const OWNER_TYPE_LABELS: Record<OwnerTypeKey, string> = {
  "1": "พจส.",
  "2": "พจร.",
  "3": "สนง",
  "4": "พจส.สแปร์",
};

export const OWNER_TYPE_KEYS: OwnerTypeKey[] = ["1", "2", "3", "4"];

/**
 * ค่าดิบของ `owner_type` มาปนกันสองแบบ — รหัสตัวเลข (`1`, `2.0`) กับข้อความไทย
 * (`ซัพพลายเออร์`, `พจส.สแปร์`, `สนง`) — ตัวนี้ยุบให้เหลือรหัสเดียว
 *
 * ลำดับการตรวจสำคัญ: `สแปร์` ต้องมาก่อน `พจส` เพราะ "พจส.สแปร์" เข้าเงื่อนไขทั้งคู่
 */
export function resolveOwnerTypeKey(raw: string | null | undefined): OwnerTypeKey | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  if (/สแปร์/.test(value)) return "4";
  if (/สนง/.test(value)) return "3";
  if (/พจร/.test(value)) return "2";
  if (/พจส/.test(value)) return "1";

  const num = value.replace(/\.0$/, "");
  return OWNER_TYPE_KEYS.includes(num as OwnerTypeKey) ? (num as OwnerTypeKey) : null;
}

export function ownerTypeLabel(raw: string | null | undefined): string {
  const key = resolveOwnerTypeKey(raw);
  return key ? OWNER_TYPE_LABELS[key] : (raw ?? "").trim();
}

/* -------------------------------------------------------------- สาขา */

export type DriverSiteKey = "latkrabang" | "saraburi" | "bangpakong";

/** รหัสสาขาดิบ → สาขาที่ฝ่ายบุคคลเรียก (ลอกจาก `DRIVER_SITE_TABS` ของระบบเดิม) */
export const DRIVER_SITES: { key: DriverSiteKey; label: string; branches: string[] }[] = [
  { key: "latkrabang", label: "ลาดกระบัง", branches: ["2", "5"] },
  { key: "saraburi", label: "สระบุรี", branches: ["3"] },
  { key: "bangpakong", label: "บางปะกง", branches: ["7"] },
];

export function siteOfBranch(branch: string): DriverSiteKey | null {
  const value = branch.trim().replace(/\.0$/, "");
  return DRIVER_SITES.find((site) => site.branches.includes(value))?.key ?? null;
}

/** ชื่อสาขาที่อ่านออก — รหัสที่ไม่อยู่ในสามสาขาหลักคืนค่าดิบไป ไม่เดาชื่อให้ */
export function siteLabel(branch: string): string {
  const key = siteOfBranch(branch);
  if (key) return DRIVER_SITES.find((s) => s.key === key)!.label;
  return branch.trim().replace(/\.0$/, "");
}

/* --------------------------------------------------------------- รถ */

/** Mixer 6 ล้อ → MS · 10 ล้อ → ML */
export type VehicleMix = "MS" | "ML";

export function vehicleMixLabel(vehicleType: string): VehicleMix | null {
  const t = vehicleType.trim();
  if (!t) return null;
  if (/10\s*ล้อ/.test(t)) return "ML";
  if (/6\s*ล้อ/.test(t)) return "MS";
  return null;
}

export interface DriverVehicle {
  /** เลขรถ — รหัสภายในที่ลาดกระบังใช้เรียกกันเป็นหลัก */
  code: string;
  /** ทะเบียนรถ */
  plateNo: string;
  vehicleType: string;
  mix: VehicleMix | null;
  brand: string;
  model: string;
  /** `fleet` ในฐานข้อมูล = **ลูกค้า** ในภาษาที่ฝ่ายบุคคลใช้ */
  fleet: string;
  /** แพล้นท์ต้นทาง */
  plant: string;
}

/* ------------------------------------------------- สถานะการทำงานรายวัน */

/** ตัวย่อสถานะจาก ATMS → ความหมายเต็ม (ลอกทั้งชุดจากระบบเดิม) */
export const WORK_STATUS_LABELS: Record<string, string> = {
  A: "ทำงานปกติ",
  A75: "ทำงาน 6 ชม.",
  A50: "ทำงาน 4 ชม.",
  A25: "ทำงาน 2 ชม.",
  "Aส": "พจส มาทำงานสาย",
  "Aป": "พจส.ปฏิเสธโอนย้าย",
  "Aน": "พจส.หนีกลับก่อนเวลา",
  "Aด": "พจส.ด่าว่าบริษัทฯเสียหาย",
  "Aค": "รถและคนทำงานเต็มวัน เป็นครูฝึก",
  "Aซ": "รถพจส.ซ่อมและพจส.ไปขับคันอื่นแทน",
  "Aล": "รถพจส.ซ่อมและพจส.ไปขับแทนคันที่ พจส.ลา",
  AX: "วันทำงานรถเช่าเหมา (จ่ายครึ่งราคา)",
  "ฝ": "พจส.ฝึกงาน",
  "ล": "พจส.จองลาล่วงหน้า",
  "ก": "พจส.ลากิจฉุกเฉิน",
  "ป": "พจส.ลาป่วยฉุกเฉิน",
  "กด": "พจส.กักตัวได้ประกันรายได้",
  "กม": "พจส.กักตัวไม่ได้ประกันรายได้",
  "ย": "พจส.หยุดไม่ได้รับเงิน",
  "จ": "พจส.บาดเจ็บในการทำงาน",
  "ลอ": "พจส.ลาออก",
  "ปอ": "พจส.ถูกปลด",
  X: "ตกคิว/ไม่ได้งาน",
  "ลส": "พจส.อบรม ต่อบัตร สอบ",
  "ลพ": "รถว่างจากพจส.ถูกพักงาน",
  "ลข": "รถว่างจากพจส.ขาดงาน",
  "ลซ": "รถซ่อม ปฏิเสธไม่ขึ้นคันอื่น",
};

export function workStatusFullLabel(code: string): string {
  const key = code.trim();
  if (!key) return "";
  if (WORK_STATUS_LABELS[key]) return WORK_STATUS_LABELS[key];

  const upper = key.toUpperCase();
  const match = Object.keys(WORK_STATUS_LABELS).find((k) => k.toUpperCase() === upper);
  return match ? WORK_STATUS_LABELS[match] : key;
}

/**
 * รหัสที่แปลว่า **พ้นสภาพ** — ลาออกเอง (`ลอ`) หรือถูกปลด (`ปอ`)
 *
 * สองตัวนี้ไม่ใช่ “วันที่ไม่ได้ทำงาน” เหมือน `ล` หรือ `X` แต่เป็น **วันสุดท้ายของ
 * การเป็นพนักงาน** · ทั้งระบบใช้สีแดง (`alert`) กับการพ้นสภาพอยู่แล้ว
 * (วงรูปใน `DriverAvatar` · ป้ายสถานะใน `DriverStatusControl`) รหัสสองตัวนี้
 * จึงต้องเป็นสีเดียวกันทุกที่ที่โผล่ ไม่ใช่จมอยู่กับกองลาหรือกองอื่น ๆ
 */
export const EXIT_STATUS_CODES = ["ลอ", "ปอ"];

export function isExitStatus(code: string): boolean {
  return EXIT_STATUS_CODES.includes(code.trim());
}

/**
 * โทนของชิปสถานะ — เขียว = ได้ออกงาน, เหลือง = ลา, **แดง = พ้นสภาพ**, ฟ้า = อื่น ๆ
 * ใช้ token ของธีม ไม่ใช่สี tailwind ดิบ (ดู `.claude/docs/design-system.md`)
 *
 * **ลำดับการตรวจสำคัญ** — `ลอ` ขึ้นต้นด้วย “ล” จึงเข้าเงื่อนไขของกองลาด้วย
 * ถ้าไม่เช็กการพ้นสภาพก่อน วันที่คนลาออกจะถูกย้อมเหลืองเหมือนวันลาธรรมดา
 * (เหตุผลเดียวกับที่ `resolveOwnerTypeKey()` ต้องเช็ก “สแปร์” ก่อน “พจส”)
 */
export function workStatusTone(code: string): "work" | "leave" | "exit" | "other" {
  const key = code.trim();
  if (!key) return "other";
  if (isExitStatus(key)) return "exit";
  if (key.toUpperCase().startsWith("A")) return "work";
  if (/^[ลL]/.test(key)) return "leave";
  return "other";
}

/* ------------------------------------------- ตัวเลือกสำหรับกรอกเอง */

export interface WorkStatusOption {
  value: string;
  /** `ฝ — พจส.ฝึกงาน` — โค้ดกับความหมายอยู่ด้วยกันเสมอ ดูเหตุผลที่ `WORK_STATUS_GROUPS` */
  label: string;
}

export interface WorkStatusGroup {
  label: string;
  options: WorkStatusOption[];
}

/**
 * รหัสสถานะจัดกลุ่มไว้ให้ dropdown ที่ฝ่ายบุคคลกรอกเอง — **โค้ดคู่กับความหมายเสมอ**
 *
 * คนกรอกจำ `ฝ` กับ `ล` ได้อยู่แล้ว แต่จำ `Aซ` กับ `ลซ` สลับกันได้ง่ายมาก
 * (ตัวหนึ่งคือรถซ่อมแล้วไปขับคันอื่น อีกตัวคือรถซ่อมแล้วปฏิเสธไม่ขึ้นคันอื่น) —
 * ป้ายจึงเป็น `โค้ด — ความหมายเต็ม` ทั้งในรายการและในช่องค้นหา พิมพ์ "ฝ" ก็เจอ
 * พิมพ์ "ฝึกงาน" ก็เจอ · **ความหมายลอกจาก {@link WORK_STATUS_LABELS} ทั้งหมด
 * ห้ามตั้งคำใหม่เอง** — ฝ่ายบุคคลอ่านคำชุดนี้อยู่ทุกวันแล้ว
 *
 * ลำดับกลุ่มเรียงตามความถี่ที่หน้าติดตามฝึกงานต้องใช้ ไม่ใช่ตามตัวอักษร —
 * ทั้งหน้าคือเรื่องการฝึก `ฝ` จึงอยู่บนสุดและเป็นกลุ่มของตัวเอง
 */
export const WORK_STATUS_GROUPS: WorkStatusGroup[] = [
  { label: "ฝึกงาน", options: [opt("ฝ")] },
  {
    label: "มาทำงาน",
    options: ["A", "A75", "A50", "A25", "AX", "Aค", "Aซ", "Aล", "Aส", "Aป", "Aน", "Aด"].map(opt),
  },
  { label: "ลา / หยุด", options: ["ล", "ก", "ป", "ลส", "จ", "กด", "กม", "ย"].map(opt) },
  { label: "ไม่ได้งาน / รถว่าง", options: ["X", "ลพ", "ลข", "ลซ"].map(opt) },
  { label: "พ้นสภาพ", options: ["ลอ", "ปอ"].map(opt) },
];

function opt(value: string): WorkStatusOption {
  return { value, label: `${value} — ${WORK_STATUS_LABELS[value]}` };
}

/** รหัสที่กรอกเองได้ = รหัสที่มีความหมายกำกับเท่านั้น ไม่รับตัวอักษรมั่ว ๆ */
export function isWorkStatusCode(value: string): boolean {
  return Object.hasOwn(WORK_STATUS_LABELS, value.trim());
}

/* ------------------------------------------- บันทึกรายวันที่กรอกเอง */

/**
 * หนึ่งวันที่ฝ่ายบุคคลกรอกเอง — **ฟิลด์ของ hr-service ไม่ใช่ของ ETL**
 *
 * เก็บแยกคอลเลกชัน (`hr_service.trainee_daily`) แล้วประกบตอนอ่าน ด้วยเหตุผล
 * เดียวกับ `statusOverride`: `Boom_ETL` เป็นกระจกเงาที่ ETL ทับเป็นรอบ
 * เขียนลงไปตรง ๆ เมื่อไหร่ก็หายเมื่อนั้น
 */
export interface TraineeDailyEntry {
  /** ตัวย่อสถานะที่เลือกจาก {@link WORK_STATUS_GROUPS} */
  code: string;
  note: string;
  /** ISO timestamp */
  recordedAt: string;
  recordedBy: string;
}

/** จำนวนวันออกงานรายเดือน — `key` เป็น `YYYY-MM` ของปี ค.ศ. */
export interface DriverWorkMonth {
  key: string;
  year: number;
  month: number;
  days: number;
}

export interface DriverWorkStatus {
  /** ตัวย่อสถานะล่าสุด เช่น `A`, `ล`, `X` */
  latestStatus: string;
  latestWorkDateISO: string;
  /**
   * สถานะรายวัน — คีย์เป็น `YYYY-MM-DD` (ค.ศ.) ค่าเป็นตัวย่อสถานะ
   *
   * นี่คือชุดที่ปฏิทินทั้งปีใช้ · ว่างได้ถ้าต้นทางส่งมาเป็นยอดรวมรายเดือนอย่างเดียว
   * (ดู `toWorkDays()` ใน `registry.ts` ว่ารับรูปแบบไหนได้บ้าง)
   */
  days: Record<string, string>;
  /** ยอดรวมรายเดือน — คิดจาก `days` ถ้ามี ไม่งั้นใช้ตัวเลขที่ต้นทางส่งมาตรง ๆ */
  months: DriverWorkMonth[];
}

/** ชื่อวันในสัปดาห์แบบสั้น เริ่มวันอาทิตย์ — ปฏิทินไทยขึ้นต้นด้วยอาทิตย์ */
export const THAI_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/* ------------------------------------------------- การพ้นสภาพ */

/**
 * สถานะการจ้างที่ **hr-service เป็นเจ้าของ** — ทับค่า `active` ที่มาจาก ETL
 *
 * `active` ของ `Boom_ETL.main_driver` ถูก sync ทับทุกรอบ ถ้าฝ่ายบุคคลกดพ้นสภาพ
 * แล้วเราเขียนลงฟิลด์นั้นตรง ๆ รอบ sync ถัดไปจะดันกลับเป็นปฏิบัติงานเงียบ ๆ
 * จึงเก็บเป็นฟิลด์แยก (`statusOverride`) แล้วค่อยทับตอนอ่าน
 * (`null` = ไม่ทับ ใช้ค่าจาก ETL ตามเดิม)
 */
export type DriverStatus = "active" | "resigned";

/**
 * เหตุผลการพ้นสภาพมาจาก **Reason Code Master** ใน MongoDB (ก.ย. 2026) — แก้ได้ที่
 * หน้า `/recruitment/admin/settings/resign-reasons` ดู `_lib/resign-reasons/`
 * (ชุด `voluntary-*` / `dismiss-*` / `end-*` ที่เคยฝังอยู่ตรงนี้ถูกแทนทั้งชุดแล้ว)
 *
 * เก็บทั้ง `reasonCode` และ `reasonLabel` ลงฐานข้อมูล — ถ้าวันหนึ่งแก้ป้ายใน master
 * รายการเก่าจะยังอ่านได้ว่าตอนนั้นเลือกคำว่าอะไร
 */
export interface DriverResignation {
  /** วันที่พ้นสภาพ `YYYY-MM-DD` (ค.ศ.) */
  dateISO: string;
  reasonCode: string;
  /** ป้ายเหตุผล ณ เวลาที่บันทึก — กันรายการเหตุผลถูกแก้ทีหลังแล้วของเก่าอ่านไม่ออก */
  reasonLabel: string;
  /** หมวดใหญ่ ณ เวลาที่บันทึก · ว่างในระเบียนก่อนมี master */
  categoryLabel: string;
  /** ประเภทการออก (Vol/Inv/Disap) · ว่างในระเบียนก่อนมี master */
  exitType: ExitType | "";
  note: string;
  /** เวลาที่กดบันทึก (ISO) — คนละเรื่องกับวันที่พ้นสภาพ */
  recordedAt: string;
  /** รหัสพนักงานของคนที่กดบันทึก */
  recordedBy: string;
}

/* ------------------------------------------------- เอกสารในแฟ้มประวัติ */

/**
 * ประเภทเอกสารในแฟ้มประวัติ พจส. — **ชุดตั้งต้นสำหรับให้ฝ่ายบุคคลตรวจก่อนใช้จริง**
 * (ท่าเดียวกับ `RESIGN_REASON_GROUPS` ข้างบน)
 *
 * `required` คือ “ต้องมีในแฟ้มของทุกคน” ไม่ใช่ “ห้ามบันทึกถ้าไม่มี” — ที่ขาด
 * จะถูกนับให้เห็นบนหน้าประวัติ ไม่ได้ไปขวางการทำงานอะไร เพราะคนขับส่วนใหญ่
 * เข้าระบบมาทาง ETL ตั้งแต่ก่อนมีที่เก็บเอกสาร แฟ้มจึงว่างกันทั้งทะเบียน
 * การบล็อกอะไรสักอย่างเพราะเอกสารไม่ครบ = บล็อกทุกคนตั้งแต่วันแรก
 *
 * เก็บทั้ง `docType` (รหัส) ลงฐานข้อมูล แล้วแปลป้ายตอนอ่าน — ป้ายในนี้แก้ได้
 * โดยของเก่ายังอ่านออก · รหัสที่ไม่รู้จัก (เช่นลบประเภทออกทีหลัง) ตกไปอยู่
 * `เอกสารอื่น ๆ` แทนที่จะหายไปจากหน้าจอ
 */
export interface DriverDocType {
  code: string;
  label: string;
  /** ต้องมีในแฟ้มของทุกคน — ที่ขาดขึ้นโทนเตือนและถูกนับใน `missingRequiredDocs()` */
  required: boolean;
  /** บอกว่าเอกสารใบนั้นต้องเห็นอะไร — เขียนไว้ตรงจุดที่กดแนบ ไม่ใช่ในคู่มือเล่มอื่น */
  hint?: string;
}

/** รหัสของกองที่รับเอกสารซึ่งไม่เข้าประเภทไหน — **ต้องมีอยู่ใน `DRIVER_DOC_TYPES` เสมอ** */
export const DRIVER_DOC_OTHER = "other";

export const DRIVER_DOC_TYPES: DriverDocType[] = [
  {
    code: "id-card",
    label: "บัตรประชาชน",
    required: true,
    hint: "หน้าที่เห็นเลขบัตรและวันหมดอายุชัด พร้อมลายมือชื่อรับรอง",
  },
  { code: "house-registration", label: "ทะเบียนบ้าน", required: true },
  {
    code: "driver-license",
    label: "ใบขับขี่",
    required: true,
    hint: "ต้องเห็นประเภทใบขับขี่และวันหมดอายุ — ใช้ยืนยันวันที่ในทะเบียนว่าตรงกัน",
  },
  {
    code: "medical",
    label: "ใบรับรองแพทย์",
    required: true,
    hint: "ฉบับที่ใช้ตอนเริ่มงาน หรือฉบับล่าสุดถ้ามีการตรวจซ้ำ",
  },
  { code: "criminal-record", label: "ผลตรวจประวัติอาชญากรรม", required: true },
  {
    code: "contract",
    label: "สัญญาจ้าง",
    required: true,
    hint: "ฉบับที่ลงลายมือชื่อครบทั้งสองฝ่ายแล้ว",
  },
  {
    code: "bank-book",
    label: "หน้าสมุดบัญชีธนาคาร",
    required: true,
    hint: "ใช้โอนค่าจ้าง — ต้องเห็นชื่อบัญชีและเลขบัญชี",
  },
  {
    code: "training",
    label: "ใบรับรองการอบรม / บัตรประจำตัวผู้ขับรถ",
    required: false,
    hint: "เช่น อบรมขับขี่ปลอดภัย หรือใบอนุญาตขับรถวัตถุอันตราย",
  },
  {
    code: "resignation",
    label: "ใบลาออก / หนังสือแจ้งพ้นสภาพ",
    required: false,
    hint: "มักได้มาหลังคนคนนั้นออกไปแล้ว — แนบย้อนหลังได้ตลอด",
  },
  { code: DRIVER_DOC_OTHER, label: "เอกสารอื่น ๆ", required: false },
];

export function driverDocType(code: string): DriverDocType {
  return (
    DRIVER_DOC_TYPES.find((t) => t.code === code) ??
    DRIVER_DOC_TYPES.find((t) => t.code === DRIVER_DOC_OTHER)!
  );
}

export function driverDocTypeLabel(code: string): string {
  return driverDocType(code).label;
}

export function isDriverDocType(code: string): boolean {
  return DRIVER_DOC_TYPES.some((t) => t.code === code);
}

/**
 * เอกสารหนึ่งใบในแฟ้มประวัติ
 *
 * เก็บเป็น **id ของไฟล์ใน GridFS ไม่ใช่ URL** ต่างจาก `photoUrl` ที่อยู่บน Spaces
 * แบบเปิดสาธารณะ — สำเนาบัตรประชาชนกับสัญญาจ้างปล่อยให้ใครมีลิงก์ก็เปิดได้ไม่ได้
 * (เหตุผลเต็มอยู่ที่หัวไฟล์ `app/recruitment/_lib/drivers/documents.ts`)
 *
 * รูปร่างสี่ฟิลด์แรกตรงกับ `RecordAttachment` ของบันทึกเคสโดยตั้งใจ — ตัวช่วย
 * `attachmentKind()` / `formatFileSize()` ใน `lib/record-case-flow.ts` จึงใช้ซ้ำได้
 * ทั้งก้อน ไม่ต้องมีตารางไอคอนไฟล์ชุดที่สองในระบบ
 */
export interface DriverDocument {
  /** id ในแฟ้ม (ชื่อไฟล์ท้าย `key`) — ใช้ใน `/api/drivers/{code}/documents/{fileId}` */
  fileId: string;
  /** key บน S3 (`mass-image/drivers/…`) — เปิดตรงไม่ได้ ต้องผ่าน route ที่ตรวจสิทธิ์ */
  key: string;
  /** ชื่อไฟล์เดิมของผู้ใช้ */
  name: string;
  /** MIME type ตอนอัปโหลด */
  type: string;
  size: number;
  /** รหัสใน `DRIVER_DOC_TYPES` — ค่าที่ไม่รู้จักถือเป็น `other` ตอนแสดงผล */
  docType: string;
  note: string;
  /** เวลาที่อัปโหลด (ISO) */
  uploadedAt: string;
  /** รหัสพนักงานของคนที่อัป */
  uploadedBy: string;
}

export interface DriverDocGroup {
  type: DriverDocType;
  /** ใหม่สุดอยู่บน — ฉบับล่าสุดคือฉบับที่คนเปิดหน้านี้ตามหา */
  files: DriverDocument[];
}

/**
 * จัดเอกสารเข้ากองตามประเภท — **คืนครบทุกประเภทเสมอ รวมกองที่ยังว่าง**
 *
 * กองว่างต้องขึ้นบนหน้าจอด้วย ไม่งั้นแฟ้มที่ขาดสำเนาบัตรประชาชนจะดูเหมือน
 * แฟ้มที่ไม่ต้องมีสำเนาบัตรประชาชน — คนละเรื่องกันคนละครึ่งของงาน
 */
export function groupDriverDocuments(documents: DriverDocument[]): DriverDocGroup[] {
  return DRIVER_DOC_TYPES.map((type) => ({
    type,
    files: documents
      .filter((doc) => driverDocType(doc.docType).code === type.code)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
  }));
}

/** ประเภทที่ต้องมีแต่ยังไม่มีสักใบ */
export function missingRequiredDocs(documents: DriverDocument[]): DriverDocType[] {
  const present = new Set(documents.map((doc) => driverDocType(doc.docType).code));
  return DRIVER_DOC_TYPES.filter((type) => type.required && !present.has(type.code));
}

export const REQUIRED_DOC_COUNT = DRIVER_DOC_TYPES.filter((t) => t.required).length;

/** ลิงก์เปิดไฟล์ — ผ่าน API ที่ตรวจ session ไม่ใช่ลิงก์ตรงไปที่ไฟล์ */
export function driverDocumentUrl(drivercode: string, fileId: string): string {
  return `/api/drivers/${encodeURIComponent(drivercode)}/documents/${fileId}`;
}

/* ------------------------------------------------------------ คนขับ */

export interface DriverRecord {
  drivercode: string;
  name: string;
  phone: string;
  /**
   * รูปประจำตัวที่ฝ่ายบุคคลอัปเองผ่านหน้านี้ — ว่าง = ยังไม่มีรูป
   *
   * **เป็นฟิลด์ของ hr-service ไม่ใช่ของ ETL** เก็บไว้ใน `master_driver` ซึ่ง ETL ไม่เคยเขียน
   * (ดู `master.ts`)
   */
  photoUrl: string;
  /** ค่าดิบของ `owner_type` — เก็บไว้ให้ตามกลับไปที่ต้นทางได้เวลาแปลไม่ออก */
  ownerType: string;
  ownerTypeKey: OwnerTypeKey | null;
  ownerTypeLabel: string;
  branch: string;
  siteKey: DriverSiteKey | null;
  siteLabel: string;
  /** ค่าดิบของ `main_driver.vehicle` — เป็นทะเบียนหรือเลขรถก็ได้แล้วแต่สาขา */
  vehicleRef: string;
  vehicle: DriverVehicle | null;
  startDateISO: string;
  tenureMonths: number | null;
  tenureDays: number | null;
  licenseExpiryISO: string;
  /** บวก = ยังไม่หมดอายุ · ลบ = หมดอายุมาแล้วกี่วัน · null = ไม่มีวันที่ให้คิด */
  licenseDaysLeft: number | null;
  /**
   * วันหมดอายุบัตรประชาชน — **ฟิลด์ของ hr-service ไม่ใช่ของ ETL** เหมือน `photoUrl`
   *
   * `Boom_ETL.main_driver` มีแต่ `driver_expiry_date` (ใบขับขี่) ไม่มีวันหมดอายุ
   * บัตรประชาชนอยู่ที่ไหนเลย ค่านี้จึงมาจากการที่ฝ่ายบุคคลกรอกเองในหน้าประวัติ
   * (`setDriverIdCardExpiry()`) · ว่างเป็นปกติ — ทะเบียนทั้งชุดเข้ามาทาง ETL
   * ตั้งแต่ก่อนมีช่องนี้ ศูนย์เอกสารจึงต้องบอกได้ว่า “ยังไม่ได้กรอก” ไม่ใช่ “ไม่หมดอายุ”
   */
  idCardExpiryISO: string;
  /** กติกาเดียวกับ `licenseDaysLeft` */
  idCardDaysLeft: number | null;
  /**
   * สถานะที่ใช้จริงบนหน้าจอ — `statusOverride` ถ้ามี ไม่งั้นตกไปใช้ `etlActive`
   * (ยกเว้น `noWorkRecord` ที่นับเป็นไม่ได้ปฏิบัติงาน)
   * **อ่านตัวนี้เสมอ** อย่าไปอ่าน `etlActive` ตรง ๆ นอกจากจะอยากรู้ว่า ETL ว่าอย่างไร
   */
  active: boolean;
  /** ค่าดิบจาก ETL ก่อนถูกทับ */
  etlActive: boolean;
  /**
   * ETL ว่ายังทำงาน แต่ **ไม่มีแถวใน `employee_work_status` เลย** (ไม่นับคนที่วันเริ่มงานคือวันนี้
   * หรือยังมาไม่ถึง และคนที่ฝ่ายบุคคลกดสถานะไว้แล้ว) — น่าจะออกไปแล้วโดยไม่มีใครบันทึก · `active` เป็น `false`
   * แต่ **ยังไม่ใช่การพ้นสภาพ** ไม่มีวันที่/เหตุผล ต้องให้ฝ่ายบุคคลยืนยันทางใดทางหนึ่ง
   */
  noWorkRecord: boolean;
  /** `null` = ไม่ได้ทับ ใช้ตาม ETL */
  statusOverride: DriverStatus | null;
  /** มีค่าเมื่อฝ่ายบุคคลบันทึกการพ้นสภาพไว้ — ไม่ผูกกับ `active` ของ ETL */
  resignation: DriverResignation | null;
  /**
   * เวลาที่รูปประจำตัวและเอกสารในแฟ้มถูกลบตามนโยบายเก็บ 1 เดือนหลังพ้นสภาพ (ISO) ·
   * ว่าง = ยังไม่ถูกลบ — ดู `resignedMediaPurgeDate()` และ `media-retention.ts`
   */
  mediaPurgedAt: string;
  /**
   * เอกสารในแฟ้มประวัติ — **ฟิลด์ของ hr-service ไม่ใช่ของ ETL** เหมือน `photoUrl`
   * ว่างเป็นปกติ เพราะทะเบียนทั้งชุดเข้ามาทาง ETL ตั้งแต่ก่อนมีที่เก็บเอกสาร
   */
  documents: DriverDocument[];
  work: DriverWorkStatus | null;
  /**
   * สถานะรายวันที่ฝ่ายบุคคลกรอกเอง — คีย์เป็น `YYYY-MM-DD` (ค.ศ.) เหมือน `work.days`
   *
   * **อยู่นอก `work` โดยตั้งใจ** ถึงจะเป็นข้อมูลชนิดเดียวกันก็ตาม — `work` คือก้อน
   * ที่ยกมาจาก `Boom_ETL` ทั้งดุ้นและเป็น `null` ได้เมื่อ ATMS ยังไม่มีแฟ้มของคนนี้
   * ถ้าเอาของที่กรอกเองไปฝากไว้ข้างใน วันที่กรอกไปจะหายทั้งชุดในกรณีนั้น ·
   * แยกสองแผนที่ไว้ยังทำให้ตอบได้เสมอว่าค่าไหนมาจากไหน (ดู `TRAINEE_DAILY`)
   */
  manualDays: Record<string, TraineeDailyEntry>;
}

export interface DriverRegistry {
  drivers: DriverRecord[];
  /** เวลาที่ ETL mirror `Boom_ETL.main_driver` ล่าสุด — ISO หรือ null ถ้าไม่รู้ */
  syncedAt: string | null;
  /** ต่อ `Boom_ETL` เพื่อดึงรถ/สถานะงานไม่ติด — รายชื่อยังใช้ได้ แค่ข้อมูลเสริมหาย */
  enrichmentFailed: boolean;
  /**
   * อ่าน `trainee_daily` ไม่สำเร็จ — รายชื่อยังใช้ได้ แต่ **ห้ามให้กรอกทับ**
   * เพราะหน้าจอจะขึ้นว่ายังไม่มีใครกรอก ทั้งที่จริงแค่อ่านไม่ได้
   */
  manualFailed: boolean;
}

/* ------------------------------------------------------------ อายุงาน */

/** อายุงานน้อยกว่านี้ถือว่ายังอยู่ในช่วงต้น ต้องตามดูใกล้ ๆ (เกณฑ์เดียวกับระบบเดิม) */
export const PROBATION_MONTHS = 4;

export function isProbation(tenureMonths: number | null): boolean {
  return tenureMonths !== null && tenureMonths < PROBATION_MONTHS;
}

/** 90 → `7 ปี 6 เดือน` · น้อยกว่าหนึ่งเดือนจะบอกเป็นวันแทน ไม่ปัดเป็น 0 เดือน */
export function formatTenure(months: number | null, days: number | null = null): string {
  if (months === null) return "—";
  if (months === 0) return days === null ? "ไม่ถึง 1 เดือน" : `${days} วัน`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} เดือน`;
  return rest ? `${years} ปี ${rest} เดือน` : `${years} ปี`;
}

/* ------------------------------------------------------------ ใบขับขี่ */

/**
 * เบอร์เดียวสำหรับแสดงผล — ใน `master_driver` มีราว 6% ที่เก็บสองเบอร์ไว้ในช่องเดียว
 * คั่นด้วย `/` หรือ `,` (เช่น `092-634-2803/062-397-5549`)
 *
 * ตารางมีที่ให้บรรทัดเดียว สองเบอร์ต่อกันจึงล้นออกนอกช่องหรือโดนตัดกลางคัน
 * — เอาเบอร์แรกมาตัวเดียว **ค่าเต็มยังอยู่ครบในหน้าประวัติและในช่องค้นหา** ค้นด้วย
 * เบอร์ที่สองจึงยังเจอคนนั้น ของที่หายไปคือพื้นที่บนจอ ไม่ใช่ข้อมูล
 */
export function primaryPhone(phone: string): string {
  return phone.split(/[/,;|]/)[0].trim();
}

/** ใกล้หมดอายุภายในกี่วันถึงจะเตือน — ต่ออายุใช้เวลาราวหนึ่งเดือน จึงเผื่อสองเท่า */
export const LICENSE_WARN_DAYS = 60;

export type LicenseState = "expired" | "soon" | "ok" | "unknown";

export function licenseState(daysLeft: number | null): LicenseState {
  if (daysLeft === null) return "unknown";
  if (daysLeft < 0) return "expired";
  return daysLeft <= LICENSE_WARN_DAYS ? "soon" : "ok";
}

/** ระยะถึงวันหมดอายุ เป็นคำพูด */
export function formatLicenseGap(daysLeft: number | null): string {
  if (daysLeft === null) return "ไม่มีข้อมูลวันหมดอายุ";
  if (daysLeft < 0) return `หมดอายุแล้ว ${formatSpan(-daysLeft)}`;
  if (daysLeft === 0) return "หมดอายุวันนี้";
  return `เหลือ ${formatSpan(daysLeft)}`;
}

function formatSpan(days: number): string {
  if (days < 60) return `${days} วัน`;

  const months = Math.round(days / 30);
  if (months < 18) return `${months} เดือน`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} ปี ${rest} เดือน` : `${years} ปี`;
}

/* --------------------------------------------- เอกสารที่มีวันหมดอายุ */

/**
 * เอกสารสองชนิดที่ “หมดอายุ” แล้วมีผลกับการทำงานจริง — ใบขับขี่กับบัตรประชาชน
 *
 * **ชุดนี้ไม่ใช่ `DRIVER_DOC_TYPES`** ถึงจะมีรหัสซ้ำกันสองตัว · แฟ้มประวัติเก็บ
 * *สำเนา* เอกสารสิบกว่าชนิด (ทะเบียนบ้าน สัญญาจ้าง หน้าสมุดบัญชี…) ซึ่งไม่มี
 * วันหมดอายุให้เตือน · ที่นี่คือ **วันหมดอายุที่อยู่ในทะเบียน** ซึ่งมีแค่สองใบ
 * และกรอกไว้เป็นวันที่ ไม่ใช่ไฟล์แนบ — คนละก้อนข้อมูลกันคนละที่เก็บ
 * (รหัสตั้งให้ตรงกันโดยตั้งใจ ให้คนอ่านโค้ดโยงสองเรื่องนี้เข้าหากันได้)
 *
 * สีเป็น **คู่ชิปที่ผ่านการวัดคอนทราสต์มาแล้ว** ไม่ใช่สีใหม่ · เลี่ยงเขียว (ที่ทั้ง
 * ระบบใช้กับ “ปกติ”) และแดง (ที่ใช้กับ “หมดอายุ”) โดยตั้งใจ — ในปฏิทินหนึ่งช่อง
 * ต้องอ่านสองเรื่องพร้อมกัน คือ *เอกสารอะไร* กับ *ด่วนแค่ไหน* ถ้าใช้จานสีเดียวกัน
 * ทั้งสองเรื่อง ช่องที่เป็นบัตรประชาชนกับช่องที่หมดอายุแล้วจะแยกกันไม่ออก
 */
export type ExpiryDocKind = "driver-license" | "id-card";

export const EXPIRY_DOC_KINDS: {
  kind: ExpiryDocKind;
  /** ป้ายเต็มในตารางและคำอธิบายสี */
  label: string;
  /** ป้ายสั้นในช่องปฏิทิน ซึ่งกว้างไม่ถึงสิบตัวอักษร */
  short: string;
  /**
   * ไอคอนบนหัวคอลัมน์และปุ่มกรอง — **เลือกให้แยกออกจากกันด้วยรูปร่าง ไม่ใช่ด้วยสี**
   *
   * `CarFront` (รถ) กับ `IdCard` (บัตรมีรูปคน) ต่างกันตั้งแต่เงา คนที่แยกสีฟ้า–เหลือง
   * ไม่ออกจึงยังอ่านได้ · ถ้าเลือกไอคอนที่เป็น “บัตร” ทั้งคู่ (เช่น `IdCard` กับ
   * `CreditCard`) สีจะกลับมาเป็นตัวแยกหลักอีก ซึ่งเสียประโยชน์ที่ใส่ไอคอนมาแต่ต้น
   */
  icon: LucideIcon;
  /** คู่พื้น–ตัวหนังสือสำหรับป้ายเล็ก */
  chip: string;
  /** สีตัวหนังสือของคู่เดียวกัน — ใช้ย้อมไอคอน และเป็นพื้นของจุดสี */
  ink: string;
  /** จุดสีในคำอธิบายสี — ใช้สีตัวหนังสือของคู่เดียวกันเป็นพื้น */
  dot: string;
}[] = [
  {
    kind: "driver-license",
    label: "ใบขับขี่",
    short: "ใบขับขี่",
    icon: CarFront,
    chip: "bg-st-new text-st-new-ink",
    ink: "text-st-new-ink",
    dot: "bg-st-new-ink",
  },
  {
    kind: "id-card",
    label: "บัตรประชาชน",
    short: "บัตร ปชช.",
    icon: IdCard,
    chip: "bg-st-wait text-st-wait-ink",
    ink: "text-st-wait-ink",
    dot: "bg-st-wait-ink",
  },
];

export function expiryDocKind(kind: ExpiryDocKind) {
  return EXPIRY_DOC_KINDS.find((k) => k.kind === kind)!;
}

/**
 * เอกสารหนึ่งใบของคนหนึ่งคนที่มีวันหมดอายุ — **แถวเดียวของปฏิทินและของตาราง**
 *
 * แบนราบโดยตั้งใจ (ไม่ใช่ `{ driver, kind }` ที่ซ้อน `DriverRecord` ไว้ข้างใน)
 * เพราะทั้งปฏิทินและตารางอ่านสี่ห้าฟิลด์เท่ากัน แล้วต้องเรียง/กรองด้วยวันที่
 * เป็นหลัก — คนขับคนหนึ่งจึงปรากฏได้สองแถว คนละวัน ซึ่งเป็นสิ่งที่ต้องการ
 */
export interface DocExpiry {
  drivercode: string;
  name: string;
  phone: string;
  siteLabel: string;
  siteKey: DriverSiteKey | null;
  /** ทะเบียนรถที่ประจำ — ว่างเมื่อยังไม่ได้ประจำคันไหน */
  plateNo: string;
  kind: ExpiryDocKind;
  /** `YYYY-MM-DD` (ค.ศ.) — มีค่าเสมอ แถวที่ไม่มีวันที่ไม่ถูกสร้างขึ้นมาตั้งแต่ต้น */
  dateISO: string;
  daysLeft: number | null;
}

/**
 * ทะเบียนทั้งชุด → รายการเอกสารที่มีวันหมดอายุ เรียงตามวันที่จากเก่าไปใหม่
 *
 * **นับแค่คนที่ยังปฏิบัติงานอยู่** — คนที่พ้นสภาพแล้วไม่ต้องต่อใบขับขี่ให้บริษัท
 * และถ้านับรวม ตัวเลข “หมดอายุแล้ว” จะบวมด้วยคนที่ออกไปหลายปีแล้วจนอ่านไม่ได้
 * (กติกาเดียวกับที่หน้าประวัติซ่อนวันหมดอายุของคนที่พ้นสภาพ)
 */
export function collectDocExpiries(drivers: DriverRecord[]): DocExpiry[] {
  const rows: DocExpiry[] = [];

  for (const driver of drivers) {
    if (!driver.active) continue;

    const base = {
      drivercode: driver.drivercode,
      name: driver.name,
      phone: driver.phone,
      siteLabel: driver.siteLabel,
      siteKey: driver.siteKey,
      plateNo: driver.vehicle?.plateNo ?? "",
    };

    if (driver.licenseExpiryISO) {
      rows.push({
        ...base,
        kind: "driver-license",
        dateISO: driver.licenseExpiryISO,
        daysLeft: driver.licenseDaysLeft,
      });
    }

    if (driver.idCardExpiryISO) {
      rows.push({
        ...base,
        kind: "id-card",
        dateISO: driver.idCardExpiryISO,
        daysLeft: driver.idCardDaysLeft,
      });
    }
  }

  return rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO) || a.name.localeCompare(b.name));
}

/**
 * คนขับหนึ่งคนพร้อมวันหมดอายุ **ทุกใบที่เขามี** — หนึ่งแถวของตารางในศูนย์เอกสาร
 *
 * ตารางเลิกเป็น “หนึ่งแถวต่อหนึ่งใบ” แล้ว (23 ก.ย. 2026 ตามคำสั่งเจ้าของงาน) —
 * เดิมคนที่มีสองใบหมดอายุเดือนเดียวกันจะขึ้นสองแถว ชื่อ เบอร์ สาขา ทะเบียนรถ
 * ซ้ำกันทั้งคู่ แล้วต้องกวาดตาหาว่าอีกใบของคนนี้อยู่แถวไหน · คราวนี้ **คนละแถว
 * และเอกสารเป็นคอลัมน์** จึงอ่านจบในบรรทัดเดียวว่าคนนี้ต้องต่ออะไรเมื่อไรบ้าง
 * (คอลัมน์ “เอกสาร” ที่เคยอยู่หน้าสุดจึงไม่จำเป็นอีก — หัวคอลัมน์บอกแทนแล้ว)
 */
export interface DriverExpiryRow {
  drivercode: string;
  name: string;
  phone: string;
  siteLabel: string;
  plateNo: string;
  /** คีย์ที่ไม่มี = คนนี้ไม่มีวันหมดอายุของเอกสารชนิดนั้นในทะเบียน */
  docs: Partial<Record<ExpiryDocKind, DocExpiry>>;
}

/**
 * รวมรายการเอกสารเป็นแถวต่อคน — **ต้องส่ง `rows` ทั้งชุด ไม่ใช่ชุดที่กรองแล้ว**
 *
 * ตารางเลือกว่าจะโชว์ *ใคร* จากชุดที่กรองตามเดือน/ชนิดเอกสาร แต่ตอนโชว์ต้องเห็น
 * วันหมดอายุ **ทั้งสองใบ** ของคนนั้น รวมใบที่หมดอายุคนละเดือนกับที่กำลังดูอยู่ —
 * ไม่งั้นคอลัมน์ที่เพิ่งเพิ่มเข้ามาจะว่างเป็นส่วนใหญ่ทั้งที่ข้อมูลมีอยู่
 */
export function groupExpiriesByDriver(rows: DocExpiry[]): Map<string, DriverExpiryRow> {
  const map = new Map<string, DriverExpiryRow>();

  for (const row of rows) {
    let entry = map.get(row.drivercode);
    if (!entry) {
      entry = {
        drivercode: row.drivercode,
        name: row.name,
        phone: row.phone,
        siteLabel: row.siteLabel,
        plateNo: row.plateNo,
        docs: {},
      };
      map.set(row.drivercode, entry);
    }
    entry.docs[row.kind] = row;
  }

  return map;
}

/**
 * เกณฑ์กับคำพูดของ “เหลืออีกกี่วัน” **ใช้ชุดเดียวกับใบขับขี่ทุกเอกสาร**
 *
 * ไม่ได้เขียนตรรกะใหม่ — ตั้งชื่อกลางให้ของเดิม เพราะ `licenseState()` ไม่เคยรู้
 * ว่าตัวเลขที่รับมาเป็นของใบขับขี่จริงหรือเปล่า มันคิดจาก `daysLeft` เฉย ๆ ·
 * ที่เรียกอยู่แล้วทั่วทะเบียนจึงไม่ต้องแก้ตาม และเกณฑ์เตือนไม่มีทางหลุดเป็นสองค่า
 */
export const expiryState = licenseState;
export const formatExpiryGap = formatLicenseGap;
export type ExpiryState = LicenseState;

/* ------------------------------------------------------- วันที่แบบไทย */

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** ชื่อเดือนเต็ม — ใช้ในหัวปฏิทินของศูนย์เอกสาร ซึ่งมีที่ให้เขียนเต็มคำ */
export const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/**
 * `YYYY-MM-DD` (ค.ศ.) → `12 มี.ค. 2562` (พ.ศ.)
 *
 * **เป็น พ.ศ. ไม่ใช่ ค.ศ.** — ระบบเดิมโชว์ `12/03/2019` ในตาราง ซึ่งอ่านแล้ว
 * สะดุดทุกครั้งเพราะทั้งบริษัทพูดเป็น พ.ศ. · ชื่อเดือนไทยที่ติดอยู่ข้างปีทำให้
 * ไม่มีทางอ่านสลับกับ ค.ศ. ได้ ต่างจากรูปแบบตัวเลขล้วน
 *
 * เขียนเองแทน `Intl.DateTimeFormat("th-TH")` เพราะต้องได้ผลเหมือนกันเป๊ะทั้ง
 * ฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ — ICU คนละเวอร์ชันให้ช่องว่างกับจุดไม่ตรงกันได้
 * แล้ว hydration จะไม่ตรง
 */
/**
 * วันที่รูปและเอกสารของคนที่พ้นสภาพจะถูกลบ — **วันที่พ้นสภาพ + 1 เดือน** (ตามคำสั่ง
 * เจ้าของงาน 1 ต.ค. 2026) · 31 ม.ค. + 1 เดือน = วันสุดท้ายของ ก.พ. ไม่ล้นไป มี.ค.
 * · ค่าเสีย = `""` · ใช้ทั้งตัวลบ (`media-retention.ts`) และป้ายบอกล่วงหน้าบนหน้าประวัติ
 */
export function resignedMediaPurgeDate(resignedISO: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(resignedISO);
  if (!m) return "";
  const y = Number(m[1]);
  const month = Number(m[2]); // เดือนถัดไปแบบ 0-based = เดือนปัจจุบันแบบ 1-based
  const last = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  const day = Math.min(Number(m[3]), last);
  return new Date(Date.UTC(y, month, day)).toISOString().slice(0, 10);
}

export function formatThaiDate(iso: string, style: "short" | "full" = "short"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";

  const [, y, mo, d] = m;
  const names = style === "full" ? THAI_MONTHS_FULL : THAI_MONTHS_SHORT;
  return `${Number(d)} ${names[Number(mo) - 1]} ${Number(y) + 543}`;
}

/** `2026-09-16T06:00:00Z` → `16 ก.ย. 2569 06:00 น.` (เวลาไทย) */
export function formatThaiDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = formatThaiDate(`${get("year")}-${get("month")}-${get("day")}`);
  return `${day} ${get("hour")}:${get("minute")} น.`;
}
