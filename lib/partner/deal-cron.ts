import "server-only"
import { AUTO_CLOSE_DAYS, DAYS_TO_COMPLETE, isStage, STAGE_LABEL, type Stage } from "@/lib/partner/deal-stage"
import { LOSS_COLL, seedLossReasons } from "@/lib/partner/loss-reason"
import { DEAL_COLL, closeLost, moveStage } from "@/lib/partner/deal-actions"
import { partnerColOf, type PartnerDb } from "@/lib/db/partner-col"

/**
 * งานรายวันของไปป์ไลน์ (เรียกจาก /api/cron/deals)
 * 1) ดีลพักติดตามที่เลยวันนัด → แจ้งเซลล์
 * 2) ดีลที่ยังไม่จบและเงียบเกิน 30 วัน → ปิดอัตโนมัติพร้อมเหตุผลของระบบ แล้วให้เซลล์มาระบุเหตุผลจริง
 *    (ยกเว้นขั้นส่งมอบ เพราะกำลังรอครบ 90 วันตามปกติ)
 * 3) ดีลที่ส่งมอบครบ 90 วัน → ขยับเป็นครบ 90 วันแรกให้เอง
 * อีเมลยังไม่ทำ (ผู้ใช้สั่งข้ามไปก่อน) — แจ้งเตือนไปที่ระบบแจ้งเตือนในแอปแทน
 */

const SYSTEM: Actor = { email: "system@cron", isAdmin: true }
type Actor = { email: string; isAdmin: boolean }

export interface CronReport {
  /** false = พรีวิวเฉย ๆ ยังไม่เขียนอะไรลง DB */
  applied?: boolean
  followUpDue: { id: string; quotationNo: string; salesName: string; nextFollowUpDate: string }[]
  autoClosed: { id: string; quotationNo: string; stage: string; quietDays: number }[]
  completed: { id: string; quotationNo: string }[]
  errors: string[]
}

/** ขั้นที่ไม่นับว่า "เงียบ" เพราะกำลังรอตามกระบวนการ — รอรถมาส่งมอบ / รอครบ 90 วัน */
const QUIET_EXEMPT_STAGES = new Set(["CONTRACT_SIGNED", "DELIVERED"])

const daysBetween = (iso: string | undefined, now: Date) =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000) : Infinity

export interface DealForCron {
  stage?: string
  nextFollowUpDate?: string
  deliveredAt?: string
  lastActivityAt?: string
  updatedAt?: string
  createdAt?: string
}

/** ตัดสินว่าดีลใบนี้ต้องทำอะไรวันนี้ — logic ล้วน เทสต์ได้โดยไม่ต้องมี DB */
export function dealDailyActions(d: DealForCron, now = new Date()) {
  const stage = String(d.stage ?? "")
  const quietDays = daysBetween(String(d.lastActivityAt ?? d.updatedAt ?? d.createdAt ?? ""), now)
  const today = now.toISOString().slice(0, 10)
  const closedOrDone = stage === "CLOSED_LOST" || stage === "COMPLETED_90D"

  const complete = !closedOrDone && stage === "DELIVERED" &&
    daysBetween(String(d.deliveredAt ?? ""), now) >= DAYS_TO_COMPLETE
  // ดีลที่พักติดตามไว้และยังไม่ถึงวันนัด = รออยู่ตามที่เซลล์ตั้งใจ ไม่ใช่ปล่อยเงียบ
  const waitingOnPlan = stage === "ON_HOLD" && !!d.nextFollowUpDate && String(d.nextFollowUpDate) > today
  return {
    quietDays,
    followUpDue: !closedOrDone && stage === "ON_HOLD" && !!d.nextFollowUpDate && String(d.nextFollowUpDate) <= today,
    complete,
    waitingOnPlan,
    // ยกเว้นกฎเงียบ 30 วัน: ขั้นที่ "รอของ" ตามปกติ (รอรถ / รอครบ 90 วัน) และดีลที่พักไว้ยังไม่ถึงวันนัด
    autoClose: !closedOrDone && !complete && !waitingOnPlan
      && !QUIET_EXEMPT_STAGES.has(stage) && quietDays >= AUTO_CLOSE_DAYS,
  }
}

export async function runDealDailyJobs(db: PartnerDb, now = new Date(), opts: { apply?: boolean } = {}): Promise<CronReport> {
  const apply = opts.apply === true
  const report: CronReport = { applied: apply, followUpDue: [], autoClosed: [], completed: [], errors: [] }
  await seedLossReasons(db)

  const systemReason = await partnerColOf(db, "lossReasons").findOne({ code: "NO_ACTIVITY_30D" })
  const deals = await partnerColOf(db, "quotations")
    .find({ stage: { $nin: ["CLOSED_LOST", "COMPLETED_90D"] } })
    .project({ quotationNo: 1, stage: 1, stageBeforeHold: 1, salesName: 1, salesEmail: 1, lastActivityAt: 1, updatedAt: 1, createdAt: 1, nextFollowUpDate: 1, deliveredAt: 1 })
    .toArray()

  for (const d of deals) {
    const id = String(d._id)
    const stage = String(d.stage ?? "")
    const todo = dealDailyActions(d as DealForCron, now)
    const quiet = todo.quietDays

    try {
      // 1) เลยวันติดตาม
      if (todo.followUpDue) {
        report.followUpDue.push({
          id, quotationNo: String(d.quotationNo ?? ""), salesName: String(d.salesName ?? ""),
          nextFollowUpDate: String(d.nextFollowUpDate),
        })
      }

      // 3) ครบ 90 วันหลังส่งมอบ → จบดีลให้เอง (ทำก่อนกฎเงียบ 30 วัน)
      if (todo.complete) {
        const r = apply
          ? await moveStage(db, id, "COMPLETED_90D", SYSTEM, "ครบ 90 วันนับจากวันส่งมอบ (ระบบขยับอัตโนมัติ)")
          : { ok: true }
        if (r.ok) report.completed.push({ id, quotationNo: String(d.quotationNo ?? "") })
        else report.errors.push(`${d.quotationNo}: ${r.error}`)
        continue
      }

      // 2) เงียบเกิน 30 วัน → ปิดอัตโนมัติ (ยกเว้นขั้นส่งมอบที่กำลังรอครบ 90 วัน)
      if (todo.autoClose && systemReason) {
        const r = apply
          ? await closeLost(db, id, SYSTEM, String(systemReason._id),
              `ไม่มีความเคลื่อนไหว ${quiet} วัน — ระบบปิดให้อัตโนมัติ กรุณาระบุเหตุผลจริง`, { isAutomatic: true })
          : { ok: true }
        if (r.ok) {
          report.autoClosed.push({
            id, quotationNo: String(d.quotationNo ?? ""),
            stage: isStage(stage) ? STAGE_LABEL[stage as Stage] : String(d.stageBeforeHold ?? stage),
            quietDays: quiet,
          })
        } else report.errors.push(`${d.quotationNo}: ${r.error}`)
      }
    } catch (e) {
      report.errors.push(`${d.quotationNo}: ${e instanceof Error ? e.message : "error"}`)
    }
  }

  return report
}
