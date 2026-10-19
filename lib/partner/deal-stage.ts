/**
 * กติกา Pipeline ขายรถร่วม 10 สถานะ (สเปกผู้ใช้ 2026-09-24)
 * ไฟล์นี้เป็น logic ล้วน ไม่แตะ DB — ใช้ร่วมกันทั้งฝั่งหน้าเว็บและฝั่ง API
 * หลักการ: ขยับทีละขั้นไปข้างหน้าเท่านั้น · ข้อมูลบังคับไม่ครบ = ขยับไม่ได้ · ถอยขั้นเฉพาะผู้ดูแลและต้องมีเหตุผล
 */

export const STAGES = [
  "LEAD", "QUALIFIED", "QUOTED", "VIEWING_SCHEDULED", "RESERVED",
  "TRAINING", "CONTRACT_SCHEDULED", "CONTRACT_SIGNED", "DELIVERED", "COMPLETED_90D",
] as const
export type Stage = (typeof STAGES)[number]

/** สถานะพิเศษ ใช้ได้ทุกขั้นที่ยังไม่จบ */
export type DealStatus = Stage | "ON_HOLD" | "CLOSED_LOST"

export const STAGE_LABEL: Record<Stage, string> = {
  LEAD: "ผู้สนใจ",
  QUALIFIED: "ผ่านคุณสมบัติ",
  QUOTED: "เสนอราคาแล้ว",
  VIEWING_SCHEDULED: "นัดดูรถ",
  RESERVED: "วางจองแล้ว",
  TRAINING: "ฝึกงาน",
  CONTRACT_SCHEDULED: "นัดเซ็นสัญญา",
  CONTRACT_SIGNED: "เซ็นสัญญาแล้ว รอส่งมอบ",
  DELIVERED: "ส่งมอบรถสำเร็จ",
  COMPLETED_90D: "ครบ 90 วันแรก",
}

export const STATUS_LABEL: Record<DealStatus, string> = {
  ...STAGE_LABEL,
  ON_HOLD: "พักติดตาม",
  CLOSED_LOST: "ปิด–ไม่สำเร็จ",
}

export const PHASES: { no: number; label: string; stages: Stage[] }[] = [
  { no: 1, label: "คัดกรอง", stages: ["LEAD", "QUALIFIED"] },
  { no: 2, label: "โน้มน้าว", stages: ["QUOTED", "VIEWING_SCHEDULED"] },
  { no: 3, label: "ผูกมัด", stages: ["RESERVED", "TRAINING"] },
  { no: 4, label: "ปิดดีล", stages: ["CONTRACT_SCHEDULED", "CONTRACT_SIGNED"] },
  { no: 5, label: "ส่งมอบ", stages: ["DELIVERED", "COMPLETED_90D"] },
]

/** สีประจำด่าน ไล่เข้มขึ้นตามความใกล้ปิดดีล — ค่าจริงอยู่ที่ token ใน globals.css
 *  (ชี้ไปที่ตัวแปร CSS เพื่อให้สลับโทนมืดเองได้ และผ่าน contrast ทั้งสองโทน) */
export const PHASE_COLOR: Record<number, string> = {
  1: "var(--phase-1)", 2: "var(--phase-2)", 3: "var(--phase-3)", 4: "var(--phase-4)", 5: "var(--phase-5)",
}
export const PHASE_COLOR_NONE = "var(--phase-0)"
export const phaseColorOf = (stage?: string) => {
  const p = PHASES.find((x) => x.stages.includes(stage as Stage))
  return p ? PHASE_COLOR[p.no] : PHASE_COLOR_NONE
}

export const phaseOf = (stage: Stage) => PHASES.find((p) => p.stages.includes(stage))!
export const stageIndex = (stage: string) => STAGES.indexOf(stage as Stage)
export const isStage = (v: unknown): v is Stage => STAGES.includes(v as Stage)
/** ขั้นที่ยังไม่จบ = ยังเดินต่อได้ (ไม่ใช่ COMPLETED_90D และไม่ใช่ปิดดีล) */
export const isOpen = (status: string) => status === "ON_HOLD" || (isStage(status) && status !== "COMPLETED_90D")
export const nextStage = (stage: Stage): Stage | null => STAGES[stageIndex(stage) + 1] ?? null

// ─── ข้อมูลของดีลที่กติกาใช้ตัดสิน ─────────────────────────────────────────────

export interface DealScreening {
  birthDate?: string            // คำนวณอายุ ไม่ให้ติ๊กเอง
  licenseIssueDate?: string     // วันออกใบขับขี่ — ต้องถือมาแล้ว ≥ 1 ปี
  licenseType?: string          // ท.2 ขึ้นไป
  noCriminalRecord?: boolean
  notBlacklisted?: boolean
  downPaymentReady?: boolean
  canDriveMixer?: boolean
  hasGuarantor?: boolean
}

export interface DealFields {
  stage?: string
  screening?: DealScreening
  quotationSentAt?: string
  viewingDate?: string
  // เงินจอง = ก้อนเดียวกัน แค่มีสองชื่อในระบบ (ชื่อเดิม depositAmount) — ฝั่งเขียนต้องเซ็ตให้ตรงกันทั้งคู่
  reservationAmount?: number
  depositAmount?: number
  // สลิปเงินจองก็ก้อนเดียวกัน: แนบผ่านไปป์ไลน์ = attachments(RESERVATION_SLIP) · แนบจากการ์ดการเงินเดิม = depositSlips
  depositSlips?: string[]
  depositSlipUrl?: string
  trainingStartDate?: string
  trainingResult?: "PASSED" | "FAILED" | ""
  contractDate?: string
  deliveryDate?: string
  deliveredAt?: string
  attachments?: { type: string; url: string }[]
}

export const ATTACHMENT_TYPES = ["QUOTATION", "RESERVATION_SLIP", "SIGNED_CONTRACT", "DELIVERY_PHOTO"] as const
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number]

const hasFile = (d: DealFields, type: AttachmentType) =>
  (d.attachments ?? []).some((a) => a.type === type && String(a.url ?? "").trim())

/** เงินจองที่วางไว้ (สองชื่อ ความจริงเดียว) */
export const reservationAmountOf = (d: DealFields) => Number(d.reservationAmount ?? d.depositAmount ?? 0) || 0
/** หลักฐานโอนเงินจอง — นับทั้งไฟล์ที่แนบผ่านไปป์ไลน์และสลิปในการ์ดการเงิน */
export const hasReservationSlip = (d: DealFields) =>
  hasFile(d, "RESERVATION_SLIP")
  || (d.depositSlips ?? []).some((u) => String(u ?? "").trim())
  || !!String(d.depositSlipUrl ?? "").trim()

/** อายุ ณ วันนี้ จากวันเกิด (ปี ค.ศ. ISO) */
export function ageFrom(birthDate?: string, now = new Date()): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (Number.isNaN(b.getTime())) return null
  let age = now.getFullYear() - b.getFullYear()
  const before = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())
  if (before) age--
  return age
}

/** ถือใบขับขี่มาแล้วกี่ปี (ทศนิยม) */
export function yearsHeld(issueDate?: string, now = new Date()): number | null {
  if (!issueDate) return null
  const d = new Date(issueDate)
  if (Number.isNaN(d.getTime())) return null
  return (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
}

export const MAX_AGE = 52
export const LICENSE_TYPES = ["ท.2", "ท.3", "ท.4"]

/** เช็กลิสต์คัดกรอง 7 ข้อ — 2 ข้อแรกคำนวณจากวันที่ ไม่ให้เซลล์ติ๊กเอง */
export function screeningChecklist(d: DealFields, now = new Date()) {
  const s = d.screening ?? {}
  const age = ageFrom(s.birthDate, now)
  const held = yearsHeld(s.licenseIssueDate, now)
  const licenseOk = !!s.licenseType && LICENSE_TYPES.includes(s.licenseType) && held !== null && held >= 1
  return [
    { key: "age", label: `อายุไม่เกิน ${MAX_AGE} ปี`, pass: age !== null && age <= MAX_AGE, auto: true,
      detail: age === null ? "ยังไม่กรอกวันเกิด" : `อายุ ${age} ปี` },
    { key: "license", label: "ใบขับขี่ ท.2 ขึ้นไป ถือมาแล้วไม่น้อยกว่า 1 ปี", pass: licenseOk, auto: true,
      detail: !s.licenseType ? "ยังไม่ระบุชนิดใบขับขี่"
        : held === null ? "ยังไม่กรอกวันออกใบขับขี่"
        : `${s.licenseType} · ถือมา ${held.toFixed(1)} ปี` },
    { key: "noCriminalRecord", label: "ไม่มีประวัติอาชญากรรมตามที่กำหนด", pass: !!s.noCriminalRecord, auto: false },
    { key: "notBlacklisted", label: "ไม่ติดแบล็กลิสต์", pass: !!s.notBlacklisted, auto: false },
    { key: "downPaymentReady", label: "มีเงินดาวน์ครบตามโปรโมชั่น", pass: !!s.downPaymentReady, auto: false },
    { key: "canDriveMixer", label: "มีความสามารถในการขับรถโม่", pass: !!s.canDriveMixer, auto: false },
    { key: "hasGuarantor", label: "มีผู้ค้ำประกันตามหลักเกณฑ์", pass: !!s.hasGuarantor, auto: false },
  ]
}

// ─── เงื่อนไขก่อนขยับขั้น ────────────────────────────────────────────────────

/** สิ่งที่ยังขาดก่อนขยับจากขั้นปัจจุบันไปขั้นถัดไป — ว่าง = ขยับได้ */
export function missingToAdvance(d: DealFields, from: Stage, now = new Date()): string[] {
  const miss: string[] = []
  const amount = reservationAmountOf(d)
  switch (from) {
    case "LEAD": {
      const failed = screeningChecklist(d, now).filter((c) => !c.pass)
      if (failed.length) miss.push(`เช็กลิสต์คัดกรองยังไม่ผ่าน ${failed.length} ข้อ: ${failed.map((f) => f.label).join(" · ")}`)
      break
    }
    case "QUALIFIED":
      if (!hasFile(d, "QUOTATION")) miss.push("แนบใบเสนอราคา")
      if (!d.quotationSentAt) miss.push("วันที่ส่งใบเสนอราคา")
      break
    case "QUOTED":
      if (!d.viewingDate) miss.push("วันนัดดูรถ")
      break
    case "VIEWING_SCHEDULED":
      if (!hasReservationSlip(d)) miss.push("หลักฐานการโอนเงินจอง")
      if (amount <= 0) miss.push("จำนวนเงินจอง")
      break
    case "RESERVED":
      if (!d.trainingStartDate) miss.push("วันเริ่มฝึกงาน")
      break
    case "TRAINING":
      if (d.trainingResult !== "PASSED") miss.push("ผลฝึกงานต้องเป็น ผ่าน (ถ้าไม่ผ่านให้ปิดดีลพร้อมเหตุผล)")
      if (!d.contractDate) miss.push("วันนัดเซ็นสัญญา")
      break
    case "CONTRACT_SCHEDULED":
      if (!hasFile(d, "SIGNED_CONTRACT")) miss.push("ไฟล์สัญญาที่ลงนามแล้ว")
      if (!d.deliveryDate) miss.push("วันนัดรับรถ")
      break
    case "CONTRACT_SIGNED":
      if (!hasFile(d, "DELIVERY_PHOTO")) miss.push("รูปลูกค้าคู่กับรถตอนส่งมอบ")
      if (!d.deliveredAt) miss.push("วันที่ส่งมอบจริง")
      break
    case "DELIVERED": {
      const days = daysSinceDelivery(d, now)
      if (days === null) miss.push("วันที่ส่งมอบจริง")
      else if (days < DAYS_TO_COMPLETE) miss.push(`ต้องครบ ${DAYS_TO_COMPLETE} วันนับจากวันส่งมอบ (ตอนนี้ ${days} วัน)`)
      break
    }
    case "COMPLETED_90D":
      miss.push("ดีลจบแล้ว ขยับต่อไม่ได้")
      break
  }
  return miss
}

export const DAYS_TO_COMPLETE = 90
export const AUTO_CLOSE_DAYS = 30

export function daysSinceDelivery(d: DealFields, now = new Date()): number | null {
  if (!d.deliveredAt) return null
  const t = new Date(d.deliveredAt).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / (24 * 3600 * 1000))
}

export interface AdvanceCheck { ok: boolean; to: Stage | null; missing: string[]; error?: string }

/** ขยับไปขั้นถัดไปได้ไหม (ขยับทีละขั้นเท่านั้น) */
export function checkAdvance(d: DealFields, now = new Date()): AdvanceCheck {
  const from = d.stage
  if (!isStage(from)) return { ok: false, to: null, missing: [], error: "ดีลนี้ไม่ได้อยู่ในขั้นที่ขยับได้ (พักติดตามหรือปิดดีลแล้ว)" }
  const to = nextStage(from)
  if (!to) return { ok: false, to: null, missing: [], error: "ดีลจบแล้ว ขยับต่อไม่ได้" }
  const missing = missingToAdvance(d, from, now)
  return { ok: missing.length === 0, to, missing }
}

/** ตรวจการเปลี่ยนสถานะที่ API ได้รับมา (กันเรียก API ตรงข้ามขั้น) */
export function checkTransition(d: DealFields, to: string, opts: { isAdmin?: boolean; now?: Date } = {}): AdvanceCheck {
  const now = opts.now ?? new Date()
  const from = d.stage
  if (!isStage(to)) return { ok: false, to: null, missing: [], error: "สถานะปลายทางไม่ถูกต้อง" }
  if (!isStage(from)) return { ok: false, to: null, missing: [], error: "ดีลนี้พักติดตามหรือปิดแล้ว ต้องกลับมาดำเนินการต่อก่อน" }
  if (to === from) return { ok: false, to: null, missing: [], error: "อยู่ขั้นนี้อยู่แล้ว" }
  if (stageIndex(to) < stageIndex(from)) {
    return opts.isAdmin
      ? { ok: true, to, missing: [] }   // ถอยขั้น: ผู้ดูแลเท่านั้น และ API บังคับให้มีเหตุผล
      : { ok: false, to: null, missing: [], error: "ถอยขั้นได้เฉพาะผู้ดูแลระบบ" }
  }
  if (stageIndex(to) > stageIndex(from) + 1) {
    return { ok: false, to: null, missing: [], error: `ข้ามขั้นไม่ได้ ต้องไป ${STAGE_LABEL[nextStage(from)!]} ก่อน` }
  }
  const missing = missingToAdvance(d, from, now)
  return { ok: missing.length === 0, to, missing }
}
