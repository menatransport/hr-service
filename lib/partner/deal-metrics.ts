import { STAGES, STAGE_LABEL, isStage, type Stage } from "@/lib/partner/deal-stage"

/**
 * ตัวเลขสำหรับแดชบอร์ดไปป์ไลน์ — คำนวณจากดีล + ประวัติการเปลี่ยนขั้น (deal_stage_history)
 * logic ล้วน ไม่แตะ DB เพื่อให้เทสต์ได้ตรง ๆ
 */

export interface MetricDeal {
  _id?: string
  quotationNo?: string
  stage?: string
  stageBeforeHold?: string
  stageEnteredAt?: string
  lostAtStage?: string
  lossReasonLabel?: string
  lostAt?: string
  trainingResult?: string
  deliveredAt?: string
  nextFollowUpDate?: string
  holdReason?: string
  salesName?: string
  sourceChannel?: string
  createdAt?: string
  totalSalePrice?: number
}

export interface HistoryRow {
  dealId: string
  fromStage: string | null
  toStage: string
  changedAt: string
}

export interface MetricFilter {
  from?: string        // YYYY-MM-DD (ดูจากวันที่สร้างดีล)
  to?: string
  salesName?: string
  sourceChannel?: string
}

export function applyFilter(deals: MetricDeal[], f: MetricFilter = {}): MetricDeal[] {
  return deals.filter((d) => {
    const created = String(d.createdAt ?? "").slice(0, 10)
    if (f.from && created && created < f.from) return false
    if (f.to && created && created > f.to) return false
    if (f.salesName && d.salesName !== f.salesName) return false
    if (f.sourceChannel && d.sourceChannel !== f.sourceChannel) return false
    return true
  })
}

/** 1) ดีลค้างแต่ละขั้น (พักติดตามแยกให้เห็น) */
export function openByStage(deals: MetricDeal[]) {
  const rows = STAGES.filter((s) => s !== "COMPLETED_90D").map((stage) => ({
    stage, label: STAGE_LABEL[stage],
    active: deals.filter((d) => d.stage === stage).length,
    onHold: deals.filter((d) => d.stage === "ON_HOLD" && d.stageBeforeHold === stage).length,
  }))
  return rows
}

/** 2) ดีลหลุดที่ขั้นไหนมากที่สุด */
export function lostByStage(deals: MetricDeal[]) {
  const lost = deals.filter((d) => d.stage === "CLOSED_LOST")
  return STAGES.map((stage) => ({
    stage, label: STAGE_LABEL[stage],
    count: lost.filter((d) => d.lostAtStage === stage).length,
  })).filter((r) => r.count > 0).sort((a, b) => b.count - a.count)
}

/** 3) เหตุผลที่หลุด แยกรายเดือน (เดือนล่าสุดก่อน) */
export function lossReasonByMonth(deals: MetricDeal[]) {
  const map = new Map<string, Map<string, number>>()
  for (const d of deals) {
    if (d.stage !== "CLOSED_LOST" || !d.lostAt) continue
    const month = String(d.lostAt).slice(0, 7)
    const reason = d.lossReasonLabel ?? "ไม่ระบุ"
    if (!map.has(month)) map.set(month, new Map())
    const m = map.get(month)!
    m.set(reason, (m.get(reason) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, reasons]) => ({
      month,
      reasons: [...reasons.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    }))
}

/** 4) เวลาเฉลี่ยที่ค้างแต่ละขั้น (วัน) — จากประวัติ: เข้าออกขั้นนั้นห่างกันเท่าไหร่ */
export function avgDaysPerStage(history: HistoryRow[], now = new Date()) {
  const byDeal = new Map<string, HistoryRow[]>()
  for (const h of history) {
    if (!byDeal.has(h.dealId)) byDeal.set(h.dealId, [])
    byDeal.get(h.dealId)!.push(h)
  }
  const spans = new Map<string, number[]>()
  for (const rows of byDeal.values()) {
    const sorted = [...rows].sort((a, b) => a.changedAt.localeCompare(b.changedAt))
    sorted.forEach((row, i) => {
      if (!isStage(row.toStage)) return
      const next = sorted[i + 1]
      const end = next ? new Date(next.changedAt).getTime() : now.getTime()
      const days = (end - new Date(row.changedAt).getTime()) / 86400000
      if (!Number.isFinite(days) || days < 0) return
      if (!spans.has(row.toStage)) spans.set(row.toStage, [])
      spans.get(row.toStage)!.push(days)
    })
  }
  return STAGES.map((stage) => {
    const list = spans.get(stage) ?? []
    const avg = list.length ? list.reduce((s, x) => s + x, 0) / list.length : 0
    return { stage, label: STAGE_LABEL[stage], days: Math.round(avg * 10) / 10, samples: list.length }
  }).filter((r) => r.samples > 0)
}

const reached = (deals: MetricDeal[], history: HistoryRow[], stage: Stage) => {
  const ids = new Set(history.filter((h) => h.toStage === stage).map((h) => h.dealId))
  // ดีลที่อยู่ขั้นนั้นพอดีก็นับว่าเคยถึง (เผื่อประวัติขาดจากการย้ายข้อมูล)
  for (const d of deals) if (d.stage === stage && d._id) ids.add(String(d._id))
  return ids
}

/** 5) อัตราผ่านฝึกงาน → รับรถจริง */
export function trainingToDelivered(deals: MetricDeal[], history: HistoryRow[]) {
  const passed = deals.filter((d) => d.trainingResult === "PASSED")
  const deliveredIds = reached(deals, history, "DELIVERED")
  const delivered = passed.filter((d) => d._id && deliveredIds.has(String(d._id))).length
  return { passed: passed.length, delivered, rate: passed.length ? delivered / passed.length : 0 }
}

/** 6) อัตราเซ็นสัญญา → อยู่ครบ 90 วัน (นับเฉพาะดีลที่เซ็นมานานพอจะครบแล้ว) */
export function signedToCompleted(deals: MetricDeal[], history: HistoryRow[], now = new Date()) {
  const signedIds = reached(deals, history, "CONTRACT_SIGNED")
  const signedAt = new Map<string, string>()
  for (const h of history) if (h.toStage === "CONTRACT_SIGNED") signedAt.set(h.dealId, h.changedAt)

  const eligible = [...signedIds].filter((id) => {
    const at = signedAt.get(id)
    if (!at) return false
    return (now.getTime() - new Date(at).getTime()) / 86400000 >= 90
  })
  const completedIds = reached(deals, history, "COMPLETED_90D")
  const completed = eligible.filter((id) => completedIds.has(id)).length
  return { eligible: eligible.length, completed, rate: eligible.length ? completed / eligible.length : 0 }
}

/** 7) Conversion funnel — เคยถึงขั้นไหนกี่ดีล + อัตราผ่านจากขั้นก่อนหน้า */
export function funnel(deals: MetricDeal[], history: HistoryRow[]) {
  const counts = STAGES.map((stage) => ({ stage, label: STAGE_LABEL[stage], count: reached(deals, history, stage).size }))
  return counts.map((c, i) => ({
    ...c,
    rateFromPrev: i === 0 || counts[i - 1].count === 0 ? 1 : c.count / counts[i - 1].count,
  }))
}

/** 8) ดีลพักติดตามที่เลยวันนัดแล้ว */
export function followUpOverdue(deals: MetricDeal[], now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  return deals
    .filter((d) => d.stage === "ON_HOLD" && d.nextFollowUpDate && String(d.nextFollowUpDate) <= today)
    .map((d) => ({
      id: String(d._id ?? ""), quotationNo: d.quotationNo ?? "", salesName: d.salesName ?? "ไม่ระบุ",
      holdReason: d.holdReason ?? "",
      nextFollowUpDate: String(d.nextFollowUpDate),
      overdueDays: Math.floor((now.getTime() - new Date(String(d.nextFollowUpDate)).getTime()) / 86400000),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays)
}

export function buildDashboard(deals: MetricDeal[], history: HistoryRow[], f: MetricFilter = {}, now = new Date()) {
  const rows = applyFilter(deals, f)
  const ids = new Set(rows.map((d) => String(d._id)))
  const hist = history.filter((h) => ids.has(h.dealId))
  return {
    total: rows.length,
    openByStage: openByStage(rows),
    lostByStage: lostByStage(rows),
    lossReasonByMonth: lossReasonByMonth(rows),
    avgDaysPerStage: avgDaysPerStage(hist, now),
    trainingToDelivered: trainingToDelivered(rows, hist),
    signedToCompleted: signedToCompleted(rows, hist, now),
    funnel: funnel(rows, hist),
    followUpOverdue: followUpOverdue(rows, now),
    salesPeople: [...new Set(rows.map((d) => d.salesName).filter(Boolean))].sort() as string[],
    sourceChannels: [...new Set(rows.map((d) => d.sourceChannel).filter(Boolean))].sort() as string[],
  }
}
