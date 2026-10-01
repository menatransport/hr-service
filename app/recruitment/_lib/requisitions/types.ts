import type { ApplicationStatus } from "@/app/recruitment/_lib/types";
import { LEGACY_REPLACE_REASON_LABELS } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * คำขอสรรหา — ชนิดข้อมูล ค่าคงที่ และกฎที่ **ใช้ได้ทั้ง server และ client**
 *
 * ห้าม import `lib/mongo.ts` หรืออะไรที่แตะฐานข้อมูลในไฟล์นี้เด็ดขาด — ตาราง
 * กับฟอร์มเป็น client component และต้องอ่านป้ายภาษาไทยชุดเดียวกับที่เซิร์ฟเวอร์
 * ใช้ตรวจข้อมูล (กฎเดียวกับ `_lib/types.ts` ของใบสมัคร) · ตัวอ่าน/เขียนจริงอยู่ที่
 * `store.ts` ซึ่งเป็น server-only
 *
 * **หนึ่งเอกสาร = หนึ่งอัตรา** เสมอ — ขอ 3 อัตราคือสร้างสามใบที่เดินอิสระต่อกัน
 * (เจ้าของงานเลือกทางนี้ 21 ก.ย. 2026) เพราะทุกฟิลด์ปลายน้ำของคำขอเป็นของ
 * รายบุคคล: รถคันเดียว คนที่ถูกแทนคนเดียว ครูฝึกคนเดียว — ผูกหลายคนเข้าใบเดียว
 * เมื่อไหร่ ฟิลด์พวกนี้กำกวมทันที
 */

/* ------------------------------------------------------------ ตัวเลือกในฟอร์ม */

/**
 * คำศัพท์ทั้งหมดในไฟล์นี้**ลอกจากระบบที่ฝ่ายบุคคลใช้อยู่จริง**
 * (`mena-next-lb/src/lib/recruitment-requests.ts`) — ห้ามตั้งคำใหม่เอง
 * เขาอ่านคำชุดนี้อยู่ทุกวันแล้ว
 */
export const POSITIONS = [
  { value: "ML", label: "ML" },
  { value: "MS", label: "MS" },
  { value: "spare", label: "Spare driver" },
  { value: "other", label: "อื่นๆ" },
] as const;

export type RequisitionPosition = (typeof POSITIONS)[number]["value"];

export const CUSTOMERS = [
  "Acon",
  "Asia",
  "Cpac",
  "Fast",
  "Kpac",
  "ORC",
  "SCCO",
  "TN",
  "TPI",
  "UMO",
  "หจก.จิรโชติ",
  "RP Concreate",
  "KP99",
] as const;

/** ค่าพิเศษของช่องลูกค้าและตำแหน่ง — เลือกแล้วจะเปิดช่องพิมพ์เองข้างล่าง */
export const OTHER = "other";

/**
 * เหตุผลที่ต้องหาคนแทนคนเดิม — **ฟอร์มไม่ถามแล้ว** (ถอดตามคำสั่งเจ้าของงาน 29 ก.ย. 2026)
 * ใบใหม่เก็บค่าว่าง · ใบระหว่าง 23–29 ก.ย. ถือรหัส Reason Code Master (`P1` … `N2`)
 * · ใบก่อนนั้นถือค่าชุดเดิม (`resigned`, `dismissed` …) อ่านออกผ่าน
 * `LEGACY_REPLACE_REASON_LABELS`
 */
export type ReplaceReason = string;

export type HireType = "replace" | "new_rate";

export const HIRE_TYPES = [
  { value: "replace", label: "แทนคนเดิม" },
  { value: "new_rate", label: "อัตราใหม่" },
] as const;

/**
 * สีชิปประเภทอัตรา — ใช้โทนกลาง (เทา · primary อ่อน) **ไม่ใช่ชุด `st-*`**
 * ที่ `REQUISITION_STATUS_TONE` กับ `StatusPill` ของใบสมัครใช้อยู่แล้วในอีกสอง
 * คอลัมน์ของแถวเดียวกัน — กันคนอ่านตารางสับสนว่าสีนี้บอก “สถานะ” ไปด้วย ทั้งที่
 * ประเภทอัตราเป็นแค่ป้ายหมวดหมู่ที่ไม่เปลี่ยนตามเวลา
 */
export const HIRE_TYPE_TONE: Record<HireType, string> = {
  replace: "bg-base-200 text-ink",
  new_rate: "bg-primary/10 text-primary",
};

/**
 * เหตุผลที่ยกเลิกคำขอ — **แยกจากสถานะโดยตั้งใจ** (หลักเดียวกับ `EXIT_REASONS`
 * ของใบสมัคร) เพราะ “เดือนนี้ยกเลิกไปกี่อัตรา เพราะอะไร” เป็นตัวเลขที่ต้องรวมยอดได้
 * ถ้ายัดเหตุผลเข้าไปเป็นสถานะ จะได้สถานะสิบกว่าตัวที่ไม่มีใครไล่อ่านไหว
 */
export const CANCEL_REASONS = [
  { value: "customer_cancelled", label: "ลูกค้ายกเลิก" },
  { value: "filled_elsewhere", label: "ได้คนจากทางอื่น" },
  { value: "postponed", label: "ชะลออัตรา" },
  { value: "duplicate", label: "แจ้งซ้ำ" },
  { value: "other", label: "อื่นๆ" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];

/* ------------------------------------------------------------------- สถานะ */

/**
 * สถานะคำขอ — **สี่ตัว และจงใจไม่ซ้ำกับ `APPLICATION_STATUSES`**
 *
 * คำขอตอบคำถามว่า “อัตรานี้ยังต้องหาคนอยู่ไหม” · ใบสมัครตอบว่า “คนคนนี้เดินถึง
 * ไหนแล้ว” — สองคำถามคนละเรื่อง · ใส่ “กำลังสัมภาษณ์” ลงในสถานะคำขอเมื่อไหร่
 * คือการก๊อป `interview_scheduled` ไปไว้สองที่ แล้ววันหนึ่งสองที่จะไม่ตรงกัน
 * โดยไม่มีใครรู้ — **อย่าเพิ่ม**
 */
export const REQUISITION_STATUSES = [
  "open",
  "matched",
  "filled",
  "cancelled",
] as const;

export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  open: "เปิดรับ",
  matched: "ได้ผู้สมัครแล้ว",
  /* เดิมชื่อ "ได้คนแล้ว" — คลุมเครือกับ `matched` (แค่ผูกใบสมัคร ยังไม่เริ่มฝึก)
     เปลี่ยนตามคำขอ 22 ก.ย. 2026 ให้บอกตรงว่าทรานซิชันนี้เกิดตอนไหน */
  filled: "เริ่มฝึกงานแล้ว",
  cancelled: "ยกเลิกคำขอ",
};

/**
 * สีชิปสถานะคำขอ — **จงใจไม่ให้ซ้ำหน้าตากับ `StatusPill` ของใบสมัคร**
 * ที่อยู่แถวเดียวกันในตาราง คนจะได้ไม่สับสนว่ากำลังอ่านสถานะของอะไร
 *
 * `filled` ใช้ `st-live` ไม่ใช่ `bg-primary` เพราะ primary ทึบถูกสงวนไว้ให้
 * `training` ของใบสมัคร ซึ่งขึ้นอยู่ในคอลัมน์ถัดไปพอดี
 */
export const REQUISITION_STATUS_TONE: Record<RequisitionStatus, string> = {
  open: "bg-st-new text-st-new-ink",
  matched: "bg-st-wait text-st-wait-ink",
  filled: "bg-st-live text-st-live-ink",
  cancelled: "bg-alert/12 text-alert",
};

export function isRequisitionStatus(v: unknown): v is RequisitionStatus {
  return (
    typeof v === "string" &&
    (REQUISITION_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * ใบสมัครสถานะไหนผูกกับคำขอได้ — **ทุกสถานะยกเว้น “ยกเลิก”**
 *
 * 🔀 **เปลี่ยนตามคำสั่งเจ้าของงาน 29 ก.ย. 2026** — เดิมผูกได้เฉพาะ `interview_passed`
 * กับ `training` (กันจองอัตราก่อนรู้ผลสัมภาษณ์) · ตอนนี้ฝ่ายบุคคลเลือก RQ ให้ผู้สมัคร
 * ได้ตั้งแต่ขั้นแรกผ่านกล่องทำเอกสาร และให้คำขอเป็น `matched` ทันที · ความเสี่ยงที่
 * อัตราค้างถูกปิดด้วย `syncRequisitionForApplication()` ซึ่งปลดการผูกและเปิดรับใหม่
 * ให้เองเมื่อใบสมัครกลายเป็น `cancelled` · **อย่ากลับไปบังคับแบบเดิมถ้าไม่ได้สั่ง**
 *
 * `cancelled` ยังผูกไม่ได้ — ผูกปุ๊บ sync ก็จะปลดทิ้งทันทีอยู่ดี
 *
 * **เซิร์ฟเวอร์บังคับซ้ำใน `linkApplication()`** ไม่ใช่แค่กรองรายการในดรอปดาวน์
 * — เส้น API ยิงตรงได้
 */
export const LINKABLE_STATUSES: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "training",
  "working",
];

/* ---------------------------------------------------------------- รูปข้อมูล */

export interface RequisitionPerson {
  drivercode: string;
  name: string;
}

export interface RequisitionReplace extends RequisitionPerson {
  /** รหัสเหตุผล เช่น `P4` · ใบก่อนมี master เป็นค่าชุดเดิม เช่น `resigned` */
  reason: ReplaceReason;
  /** ป้าย ณ เวลาที่บันทึก · ว่างในใบก่อนมี master */
  reasonLabel: string;
  reasonNote: string;
}

export interface RequisitionVehicle {
  code: string;
  plateNo: string;
  brand: string;
}

export interface RequisitionMatch {
  applicationId: string;
  /** เลขที่ใบสมัครที่อ่านออก — เก็บสำเนาไว้เพื่อโชว์ในตารางโดยไม่ต้อง join */
  ref: string;
  fullName: string;
  /** สถานะใบสมัคร ณ ตอนที่อ่าน — `store.ts` เติมให้สดทุกครั้งที่ลิสต์ */
  status: ApplicationStatus | null;
  linkedAt: string;
  linkedBy: string;
}

export interface RequisitionHistory {
  at: string;
  by: string;
  from: RequisitionStatus | null;
  to: RequisitionStatus;
  note: string;
}

export interface Requisition {
  id: string;
  code: string;
  requestedOn: string;

  position: RequisitionPosition;
  positionOther: string;
  customer: string;
  customerOther: string;
  plant: string;

  hireType: HireType;
  /** `null` เมื่อ `hireType === "new_rate"` — ต้องล้างค่าจริง ไม่ใช่แค่ซ่อนบนจอ */
  replace: RequisitionReplace | null;

  vehicle: RequisitionVehicle | null;
  /** 👑 ครูฝึก — **แหล่งความจริงที่เดียวของทั้งระบบ** ห้ามก๊อปไปเก็บที่อื่น */
  trainer: RequisitionPerson | null;

  status: RequisitionStatus;
  cancelReason: CancelReason | "";
  filledOn: string;

  match: RequisitionMatch | null;
  /** 🔗 สะพานไปหน้าติดตามฝึกงาน — ว่าง = ยังไม่ขึ้นทะเบียน พจส. */
  drivercode: string;

  note: string;
  requester: { employeeId: string; name: string };
  history: RequisitionHistory[];
  createdAt: string;
  updatedAt: string;
}

/**
 * สิ่งที่ `PATCH /api/recruitment/requisitions/[id]` รับได้ — **แก้ทีละเรื่อง**
 * ไม่ใช่ส่งทั้งก้อนมาทับ เพราะแต่ละเรื่องมีกติกาของตัวเอง (ผูกผู้สมัครขยับสถานะ
 * ให้เอง · ยกเลิกต้องมีเหตุผล) และแต่ละครั้งต้องลงประวัติเป็นบรรทัดที่อ่านรู้เรื่อง
 *
 * อยู่ในไฟล์นี้ไม่ใช่ใน `store.ts` เพราะ **client เป็นคนประกอบก้อนนี้** —
 * ช่องในตารางส่งมันขึ้นไป ส่วน `store.ts` เป็นคนตรวจและบังคับกติกา
 */
export interface RequisitionPatch {
  /** รหัส พจส. ของครูฝึก · `null` = ถอดครูฝึกออก */
  trainerDrivercode?: string | null;
  /** เลขรถหรือทะเบียน · `null` = ถอดรถออก */
  vehicleCode?: string | null;
  /** ผูกใบสมัคร · `null` = ปลดการผูก */
  applicationId?: string | null;
  /** ยกเลิกคำขอ (`cancelled`) หรือเปิดรับอีกครั้ง (`open`) — สถานะอื่นระบบตั้งเอง */
  status?: string;
  cancelReason?: string;
  /** รหัส พจส. ที่ผู้สมัครได้รับหลังขึ้นทะเบียน — สะพานไปหน้าติดตามฝึกงาน */
  drivercode?: string;
  note?: string;
}

/* ------------------------------------------------------------------ ป้ายชื่อ */

const label = <T extends { value: string; label: string }>(
  list: readonly T[],
  value: string,
  fallback = "",
) => list.find((o) => o.value === value)?.label ?? fallback;

/** ตำแหน่งที่อ่านออก — `other` คืนข้อความที่ผู้ใช้พิมพ์เอง ไม่ใช่คำว่า “อื่นๆ” */
export function positionLabel(r: Requisition): string {
  if (r.position === OTHER) return r.positionOther || "อื่นๆ";
  return label(POSITIONS, r.position, r.position);
}

export function customerLabel(r: Requisition): string {
  return r.customer === OTHER ? r.customerOther || "อื่นๆ" : r.customer;
}

/** ป้ายเหตุผลแทนคนเดิม — รหัส master ขึ้นเป็น `P4 · ป้าย` · ค่าชุดเดิมแปลงเป็นคำไทย */
export function replaceReasonLabel(replace: RequisitionReplace): string {
  if (!replace.reason) return "";
  if (replace.reasonLabel) return `${replace.reason} · ${replace.reasonLabel}`;
  return LEGACY_REPLACE_REASON_LABELS[replace.reason] ?? replace.reason;
}

export function hireTypeLabel(t: HireType): string {
  return label(HIRE_TYPES, t, t);
}

export function cancelReasonLabel(reason: string): string {
  return label(CANCEL_REASONS, reason, reason);
}

/** บรรทัดรองใต้ชิปประเภทอัตรา — `อัตราใหม่` ไม่มีบรรทัดนี้ (ถูกต้องแล้ว) */
export function replaceSummary(r: Requisition): string {
  if (!r.replace) return "";
  const who = r.replace.name || r.replace.drivercode;
  const why =
    r.replace.reason === "other"
      ? r.replace.reasonNote || "อื่นๆ"
      : replaceReasonLabel(r.replace);
  /* ใบที่แจ้งหลังถอดช่องเหตุผล (29 ก.ย. 2026) ไม่มีรหัส — ขึ้นแค่ชื่อ */
  return why ? `${who} · ${why}` : who;
}

/* ------------------------------------------------------------ จำนวนวันที่รอ */

/**
 * เลขลำดับวันตามปฏิทินไทย — ลอกจาก `bangkokDay()` ใน `lib/case-flow.ts`
 * เพื่อให้ทั้งระบบนับ “วัน” ด้วยวิธีเดียวกัน
 */
const bangkokDay = (ms: number) => Math.floor((ms + 7 * 60 * 60 * 1000) / 86_400_000);

/**
 * รอมาแล้วกี่วัน — นับถึงวันนี้ หรือถึงวันที่ได้คน/ยกเลิกถ้าปิดไปแล้ว
 *
 * นับเป็น**วันตามปฏิทิน** ไม่ใช่ชั่วโมงหาร 24 ค่าจึงคงที่ตลอดทั้งวัน และ HTML
 * ที่เซิร์ฟเวอร์เรนเดอร์กับตอน client hydrate ตรงกัน (หารเวลาดิบจะขยับทุกวินาที
 * → hydration mismatch) · คืน `null` เมื่อวันที่แจ้งไม่ถูกรูป ปล่อยให้จอขึ้น “—”
 */
export function waitingDays(r: Requisition): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.requestedOn)) return null;
  const start = Date.parse(`${r.requestedOn}T00:00:00+07:00`);
  if (Number.isNaN(start)) return null;

  const closedOn = r.status === "filled" ? r.filledOn : "";
  const end =
    closedOn && /^\d{4}-\d{2}-\d{2}$/.test(closedOn)
      ? Date.parse(`${closedOn}T00:00:00+07:00`)
      : Date.now();

  return Math.max(0, bangkokDay(end) - bangkokDay(start));
}

/** คำขอที่ปิดไปแล้ว — คอลัมน์ “รอมาแล้ว” ขึ้นคำว่าปิดแล้วแทนตัวเลขที่ไม่มีความหมาย */
export function isClosed(r: Requisition): boolean {
  return r.status === "filled" || r.status === "cancelled";
}

/** เกณฑ์ “ค้างนาน” ของการ์ดสรุปและสีเตือนในคอลัมน์ — วันตามปฏิทิน */
export const STALE_DAYS = 30;

export function isStale(r: Requisition): boolean {
  if (isClosed(r)) return false;
  const days = waitingDays(r);
  return days !== null && days > STALE_DAYS;
}
