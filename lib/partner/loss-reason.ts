import type { Stage } from "@/lib/partner/deal-stage"
import { partnerColOf, type PartnerDb } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"

/**
 * เหตุผลที่ดีลหลุด — master data แก้ได้ที่หน้าผู้ดูแล
 * แต่ละเหตุผลผูกกับกลุ่มขั้น ตอนปิดดีลจะเห็นเฉพาะเหตุผลของขั้นที่ดีลอยู่
 * หมายเหตุเพิ่มเติม (free text) กรอกได้เสมอ
 */

export const LOSS_COLL = PARTNER.lossReasons
export interface LossReason {
  _id?: string
  code: string
  label: string
  group: string
  applicableStages: (Stage | "ALL")[]
  isActive: boolean
  isSystem?: boolean   // ระบบใช้เอง (ปิดอัตโนมัติ) — ห้ามลบ
}

/** ชุดตั้งต้นตามสเปก — seed ครั้งแรก แล้วแก้ต่อได้ในระบบ */
export const LOSS_REASON_SEED: Omit<LossReason, "_id">[] = [
  ...[
    ["AGE_OVER", "อายุเกินเกณฑ์"],
    ["NO_LICENSE", "ไม่มีใบขับขี่ตามเกณฑ์"],
    ["CRIMINAL_RECORD", "พบประวัติอาชญากรรม"],
    ["DOWN_NOT_ENOUGH", "เงินดาวน์ไม่พอ"],
    ["BLACKLISTED", "ติดแบล็กลิสต์"],
    ["NO_GUARANTOR", "ไม่มีคนค้ำ"],
    ["UNREACHABLE", "ติดต่อไม่ได้"],
  ].map(([code, label]) => ({ code, label, group: "คัดกรอง", applicableStages: ["LEAD"] as Stage[], isActive: true })),

  ...[
    ["PRICE_TOO_HIGH", "ราคาสูงเกิน"],
    ["VEHICLE_NOT_LIKED", "ไม่ถูกใจรถ"],
    ["RETURN_NOT_ATTRACTIVE", "เงื่อนไขผลตอบแทนไม่จูงใจ"],
    ["NO_DECISION", "ไม่ตัดสินใจ/เงียบหาย"],
  ].map(([code, label]) => ({
    code, label, group: "การขาย",
    applicableStages: ["QUALIFIED", "QUOTED", "VIEWING_SCHEDULED"] as Stage[], isActive: true,
  })),

  { code: "RESERVATION_CANCELLED", label: "ลูกค้ายกเลิกการจอง", group: "หลังวางจอง",
    applicableStages: ["RESERVED"], isActive: true },

  ...[
    ["TRAIN_SKILL", "บริษัทไม่รับ – ฝีมือขับ"],
    ["TRAIN_DISCIPLINE", "บริษัทไม่รับ – วินัย"],
    ["TRAIN_SUBSTANCE", "บริษัทไม่รับ – สารเสพติด/แอลกอฮอล์"],
    ["WORK_TOO_HARD", "งานหนักกว่าที่คาด"],
    ["ROUTE_MISMATCH", "เส้นทาง/พื้นที่วิ่งไม่ตรงใจ"],
    ["INCOME_MISMATCH", "รายได้จริงไม่ตรงที่เข้าใจ"],
    ["FAMILY", "ครอบครัวไม่สนับสนุน"],
    ["HEALTH", "สุขภาพ/ร่างกายไม่ไหว"],
  ].map(([code, label]) => ({ code, label, group: "ฝึกงาน", applicableStages: ["TRAINING"] as Stage[], isActive: true })),

  ...[
    ["DOCS_INCOMPLETE", "เอกสารไม่ครบ/ผู้ค้ำไม่ผ่าน"],
    ["LAST_MINUTE_CHANGE", "ลูกค้าเปลี่ยนใจนาทีสุดท้าย"],
  ].map(([code, label]) => ({ code, label, group: "สัญญา", applicableStages: ["CONTRACT_SCHEDULED"] as Stage[], isActive: true })),

  { code: "QUIT_BEFORE_90D", label: "ลูกค้ายกเลิก/เลิกทำงานก่อนครบ 90 วัน", group: "หลังเซ็นสัญญา",
    applicableStages: ["CONTRACT_SIGNED", "DELIVERED"], isActive: true },

  { code: "NO_ACTIVITY_30D", label: "ไม่มีความเคลื่อนไหวเกิน 30 วัน", group: "ระบบ",
    applicableStages: ["ALL"], isActive: true, isSystem: true },
]

/** เหตุผลที่เลือกได้เมื่อดีลหลุดตอนอยู่ขั้นนี้ */
export const reasonsForStage = (all: LossReason[], stage: string) =>
  all.filter((r) => r.isActive && !r.isSystem &&
    (r.applicableStages.includes("ALL") || r.applicableStages.includes(stage as Stage)))

export async function listLossReasons(db: PartnerDb): Promise<LossReason[]> {
  // ตารางว่าง = ยังไม่เคย seed → เติมให้ก่อน ไม่งั้นปิดดีลไม่ได้เพราะไม่มีเหตุผลให้เลือก
  if (!(await partnerColOf(db, "lossReasons").findOne({}))) await seedLossReasons(db)
  const rows = await partnerColOf(db, "lossReasons").find({}).sort({ group: 1, label: 1 }).toArray()
  return rows.map((r) => ({ ...r, _id: String(r._id) })) as unknown as LossReason[]
}

/** seed ครั้งแรก (ไม่ทับของที่แก้ไว้แล้ว — ยึดตาม code) */
export async function seedLossReasons(db: PartnerDb): Promise<number> {
  const existing = new Set((await partnerColOf(db, "lossReasons").find({}, { projection: { code: 1 } }).toArray()).map((r) => r.code))
  const missing = LOSS_REASON_SEED.filter((r) => !existing.has(r.code))
  if (missing.length) await partnerColOf(db, "lossReasons").insertMany(missing.map((r) => ({ ...r })))
  return missing.length
}
