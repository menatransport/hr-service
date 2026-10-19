import "server-only"
import { ObjectId, type Db } from "mongodb"
import { checkTransition, isOpen, isStage, stageIndex, STAGE_LABEL, type DealFields, type Stage } from "@/lib/partner/deal-stage"
import { listLossReasons, reasonsForStage } from "@/lib/partner/loss-reason"
import { partnerColOf, type PartnerDb } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"

/**
 * การกระทำกับดีล — ที่เดียวที่เขียนสถานะลง DB
 * ทุกการกระทำ: อัปเดต lastActivityAt + เขียนประวัติลง deal_stage_history + ต่อ timeline ในเอกสาร
 * (ยังใช้ collection quotations เดิม ไม่ย้ายที่เก็บ)
 */

export const DEAL_COLL = PARTNER.quotations
export const HISTORY_COLL = PARTNER.dealStageHistory
export interface ActionResult { ok: boolean; error?: string; missing?: string[] }
export interface Actor { email: string; isAdmin: boolean }

const now = () => new Date().toISOString()

/** อัปเดตดีล — driver type ของ $push เข้มเกินไปกับ schema แบบหลวมของเรา (route เดิมก็ใช้ any) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const update = (db: PartnerDb, id: string, u: any) => partnerColOf(db, "quotations").updateOne({ _id: new ObjectId(id) }, u)

async function writeHistory(db: PartnerDb, dealId: string, from: string | null, to: string, by: string, note?: string, isAutomatic = false) {
  await partnerColOf(db, "dealStageHistory").insertOne({
    dealId, fromStage: from, toStage: to, changedBy: by, changedAt: now(), isAutomatic, ...(note ? { note } : {}),
  })
}

export async function getDeal(db: PartnerDb, id: string) {
  if (!ObjectId.isValid(id)) return null
  return partnerColOf(db, "quotations").findOne({ _id: new ObjectId(id) })
}

/** ทุกอย่างที่ถือว่าเป็น "ความเคลื่อนไหว" ของดีล (ใช้กับกฎปิดอัตโนมัติ 30 วัน) */
export async function touchDeal(db: PartnerDb, id: string, by: string, action: string, note?: string) {
  await update(db, id, {
    $set: { lastActivityAt: now(), updatedAt: now() },
    $push: { timeline: { $each: [{ at: now(), by, action, ...(note ? { note } : {}) }] } },
  })
}

/** ขยับขั้น (ไปหน้า 1 ขั้น หรือถอยขั้นสำหรับผู้ดูแล) */
export async function moveStage(db: PartnerDb, id: string, to: string, actor: Actor, note?: string): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }

  const check = checkTransition(deal as DealFields, to, { isAdmin: actor.isAdmin })
  if (!check.ok) return { ok: false, error: check.error, missing: check.missing }

  const from = String(deal.stage)
  const back = stageIndex(to) < stageIndex(from)
  if (back && !note?.trim()) return { ok: false, error: "ถอยขั้นต้องบันทึกเหตุผล" }

  await update(db, id, {
    $set: { stage: to, stageEnteredAt: now(), lastActivityAt: now(), updatedAt: now() },
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: `${back ? "ถอยขั้น" : "ขยับขั้น"} → ${STAGE_LABEL[to as Stage]}`, ...(note ? { note } : {}) }] } },
  })
  await writeHistory(db, id, from, to, actor.email, note)
  return { ok: true }
}

/** พักติดตาม — จำขั้นเดิมไว้ */
export async function holdDeal(db: PartnerDb, id: string, actor: Actor, holdReason: string, nextFollowUpDate: string): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }
  if (!isStage(deal.stage)) return { ok: false, error: "ดีลนี้พักหรือปิดไปแล้ว" }
  if (!holdReason.trim()) return { ok: false, error: "ต้องระบุเหตุผลที่พัก" }
  if (!nextFollowUpDate) return { ok: false, error: "ต้องระบุวันติดตามครั้งถัดไป" }
  if (new Date(nextFollowUpDate) <= new Date(now().slice(0, 10))) {
    return { ok: false, error: "วันติดตามต้องเป็นวันข้างหน้า" }
  }

  const from = String(deal.stage)
  await update(db, id, {
    $set: {
      stage: "ON_HOLD", stageBeforeHold: from, holdReason, nextFollowUpDate,
      stageEnteredAt: now(), lastActivityAt: now(), updatedAt: now(),
    },
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: `พักติดตาม (ติดตาม ${nextFollowUpDate})`, note: holdReason }] } },
  })
  await writeHistory(db, id, from, "ON_HOLD", actor.email, holdReason)
  return { ok: true }
}

/** กลับมาดำเนินการต่อ — คืนขั้นเดิม */
export async function resumeDeal(db: PartnerDb, id: string, actor: Actor): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }
  if (deal.stage !== "ON_HOLD") return { ok: false, error: "ดีลนี้ไม่ได้พักติดตามอยู่" }
  const back = isStage(deal.stageBeforeHold) ? String(deal.stageBeforeHold) : "LEAD"

  await update(db, id, {
    $set: { stage: back, stageEnteredAt: now(), lastActivityAt: now(), updatedAt: now() },
    $unset: { stageBeforeHold: "", holdReason: "", nextFollowUpDate: "" },
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: `กลับมาดำเนินการต่อ → ${STAGE_LABEL[back as Stage]}` }] } },
  })
  await writeHistory(db, id, "ON_HOLD", back, actor.email)
  return { ok: true }
}

/** ปิดดีล (ปุ่ม Pass on) — บังคับเลือกเหตุผลของกลุ่มขั้นที่ดีลอยู่ */
export async function closeLost(
  db: PartnerDb, id: string, actor: Actor,
  lossReasonId: string, lossNote?: string,
  opts: { isAutomatic?: boolean } = {},
): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }
  if (!isOpen(String(deal.stage))) return { ok: false, error: "ดีลนี้ปิดหรือจบไปแล้ว" }

  // ขั้นที่ถือว่า "หลุด" = ขั้นปัจจุบัน หรือขั้นก่อนพัก ถ้ากำลังพักติดตามอยู่
  const lostAt = deal.stage === "ON_HOLD" ? String(deal.stageBeforeHold ?? "LEAD") : String(deal.stage)

  const reasons = await listLossReasons(db)
  const reason = reasons.find((r) => String(r._id) === lossReasonId || r.code === lossReasonId)
  if (!reason) return { ok: false, error: "ต้องเลือกเหตุผลที่ดีลหลุด" }
  if (!opts.isAutomatic && !reasonsForStage(reasons, lostAt).some((r) => String(r._id) === String(reason._id))) {
    return { ok: false, error: `เหตุผลนี้ใช้กับขั้น ${STAGE_LABEL[lostAt as Stage] ?? lostAt} ไม่ได้` }
  }

  await update(db, id, {
    $set: {
      stage: "CLOSED_LOST", lostAtStage: lostAt, lossReasonId: String(reason._id), lossReasonLabel: reason.label,
      ...(lossNote ? { lossNote } : {}), lostAt: now(), lastActivityAt: now(), updatedAt: now(),
    },
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: `ปิดดีล – ไม่สำเร็จ (${reason.label})`, ...(lossNote ? { note: lossNote } : {}) }] } },
  })
  await writeHistory(db, id, String(deal.stage), "CLOSED_LOST", actor.email, reason.label, opts.isAutomatic)
  return { ok: true }
}

/**
 * ระบุเหตุผลจริงให้ดีลที่ระบบปิดเอง (เงียบเกิน 30 วัน)
 * แก้ได้เฉพาะดีลที่เหตุผลปัจจุบันเป็นของระบบ — ดีลที่คนปิดเองพร้อมเหตุผทางธุรกิจแล้วห้ามแก้ย้อนหลัง
 */
export async function setLossReason(
  db: PartnerDb, id: string, actor: Actor, lossReasonId: string, lossNote?: string,
): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }
  if (String(deal.stage) !== "CLOSED_LOST") return { ok: false, error: "ดีลนี้ยังไม่ได้ปิด" }

  const reasons = await listLossReasons(db)
  const current = reasons.find((r) => String(r._id) === String(deal.lossReasonId))
  if (!current?.isSystem) return { ok: false, error: "แก้ได้เฉพาะดีลที่ระบบปิดให้อัตโนมัติ" }

  const lostAt = String(deal.lostAtStage ?? "LEAD")
  const reason = reasons.find((r) => String(r._id) === lossReasonId || r.code === lossReasonId)
  if (!reason) return { ok: false, error: "ต้องเลือกเหตุผลที่ดีลหลุด" }
  if (!reasonsForStage(reasons, lostAt).some((r) => String(r._id) === String(reason._id))) {
    return { ok: false, error: `เหตุผลนี้ใช้กับขั้น ${STAGE_LABEL[lostAt as Stage] ?? lostAt} ไม่ได้` }
  }

  await update(db, id, {
    $set: {
      lossReasonId: String(reason._id), lossReasonLabel: reason.label,
      ...(lossNote ? { lossNote } : {}), updatedAt: now(),
    },
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: `ระบุเหตุผลจริง: ${reason.label}`, ...(lossNote ? { note: lossNote } : {}) }] } },
  })
  await writeHistory(db, id, "CLOSED_LOST", "CLOSED_LOST", actor.email, `ระบุเหตุผลจริง: ${reason.label}`)
  return { ok: true }
}

/** ข้อมูลรายขั้นที่แก้ได้จากแผงไปป์ไลน์ — จำกัดรายชื่อไว้ กัน client ยัด field อื่น */
const FIELD_KEYS = [
  "sourceChannel", "experienceLevel", "preferredArea", "motivation", "interestedVehicle",
  "quotationSentAt", "viewingDate", "reservationAmount",
  "trainingStartDate", "trainingResult", "contractDate", "deliveryDate", "deliveredAt",
] as const
const SCREENING_KEYS = [
  "birthDate", "licenseIssueDate", "licenseType",
  "noCriminalRecord", "notBlacklisted", "downPaymentReady", "canDriveMixer", "hasGuarantor",
] as const

export async function saveFields(db: PartnerDb, id: string, actor: Actor, fields: Record<string, unknown>): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }

  const $set: Record<string, unknown> = { lastActivityAt: now(), updatedAt: now() }
  for (const k of FIELD_KEYS) if (fields[k] !== undefined) $set[k] = fields[k]
  // เงินจองมีสองชื่อในระบบ (reservationAmount ของไปป์ไลน์ / depositAmount ของการ์ดการเงิน)
  // เขียนพร้อมกันเสมอ ไม่งั้นกติกาขยับขั้นกับยอดที่เซลล์เห็นจะไม่ตรงกัน
  if (fields.reservationAmount !== undefined) {
    const amt = Number(fields.reservationAmount) || 0
    $set.reservationAmount = amt
    $set.depositAmount = amt
    if (amt > 0 && !deal.depositPaidAt) $set.depositPaidAt = now().slice(0, 10)
  }
  const sc = (fields.screening ?? {}) as Record<string, unknown>
  for (const k of SCREENING_KEYS) if (sc[k] !== undefined) $set[`screening.${k}`] = sc[k]
  if (Object.keys($set).length === 2) return { ok: false, error: "ไม่มีข้อมูลที่จะบันทึก" }

  await update(db, id, {
    $set,
    $push: { timeline: { $each: [{ at: now(), by: actor.email, action: "บันทึกข้อมูลขั้นตอน" }] } },
  })
  return { ok: true }
}

/** แนบไฟล์ประกอบขั้น (ใบเสนอราคา/สลิปจอง/สัญญาลงนาม/รูปส่งมอบ) */
export async function attachFile(db: PartnerDb, id: string, actor: Actor, type: string, url: string, label?: string): Promise<ActionResult> {
  const deal = await getDeal(db, id)
  if (!deal) return { ok: false, error: "ไม่พบดีล" }
  if (!url.trim()) return { ok: false, error: "ไม่มีไฟล์" }
  // สลิปเงินจองไปโผล่ในการ์ดการเงินด้วย (depositSlips) — สลิปชุดเดียว ไม่ให้แนบซ้ำสองที่
  const alsoSlip = type === "RESERVATION_SLIP" && !(deal.depositSlips ?? []).includes(url)
  await update(db, id, {
    $set: { lastActivityAt: now(), updatedAt: now() },
    $push: {
      attachments: { $each: [{ type, url, label: label ?? "", uploadedBy: actor.email, uploadedAt: now() }] },
      timeline: { $each: [{ at: now(), by: actor.email, action: `แนบไฟล์ ${label || type}` }] },
      ...(alsoSlip ? { depositSlips: { $each: [url], $slice: -10 } } : {}),
    },
  })
  return { ok: true }
}
