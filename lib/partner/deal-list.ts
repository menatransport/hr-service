import { PHASES, PHASE_COLOR, STAGES, isOpen, stageIndex } from "@/lib/partner/deal-stage"

/**
 * ตัวช่วยของหน้ารายการดีล — กรอง/นับ/เรียง ฝั่งหน้าเว็บทั้งหมด
 *
 * ทำไมต้องกรองฝั่งนี้: ตัวเลขบนชิปด่านและการ์ด KPI ต้องคิดจากดีล "ทุกใบ" เสมอ
 * ถ้าให้ server กรองตามด่านที่เลือกแล้วค่อยนับ ด่านอื่นจะกลายเป็น 0 ทันทีที่กดเลือกด่านหนึ่ง
 */

export interface ListDeal {
  _id: string
  stage?: string
  stageEnteredAt?: string
  nextFollowUpDate?: string
  totalSalePrice?: number
  salesName?: string
  salesEmail?: string
}

export interface Bucket { key: string; label: string; short: string; stages: string[]; color: string }

export const PHASE_BUCKETS: Bucket[] = PHASES.map((p) => ({
  key: `phase${p.no}`, label: `${p.no}. ${p.label}`, short: p.label,
  stages: p.stages as string[], color: PHASE_COLOR[p.no],
}))
export const SIDE_BUCKETS: Bucket[] = [
  { key: "ON_HOLD", label: "พักติดตาม", short: "พักติดตาม", stages: ["ON_HOLD"], color: "#D4A72C" },
  { key: "CLOSED_LOST", label: "ปิด–ไม่สำเร็จ", short: "ปิด–ไม่สำเร็จ", stages: ["CLOSED_LOST"], color: "#8C959F" },
]
export const BUCKETS: Bucket[] = [...PHASE_BUCKETS, ...SIDE_BUCKETS]

export const bucketOf = (stage?: string) => BUCKETS.find((b) => b.stages.includes(stage ?? ""))?.key ?? ""

/** ค้างขั้นนี้มากี่วัน */
export function daysIn(iso?: string, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((now.getTime() - t) / 86400000)
}

export const STUCK_WARN = 14
export const STUCK_BAD = 30

const today = (now: Date) => now.toISOString().slice(0, 10)
const price = (d: ListDeal) => Number(d.totalSalePrice ?? 0) || 0

/** ตัวกรองด่วนจากการ์ด KPI */
export type Quick = "" | "followup" | "stuck"

export function matchesQuick(d: ListDeal, quick: Quick, now: Date = new Date()): boolean {
  if (!quick) return true
  if (quick === "followup") return !!d.nextFollowUpDate && d.nextFollowUpDate <= today(now)
  return isOpen(d.stage ?? "") && (daysIn(d.stageEnteredAt, now) ?? 0) > STUCK_BAD
}

export interface ListFilter {
  bucket?: string          // "" = ทุกด่าน
  quick?: Quick
  mine?: boolean
  me?: { email?: string | null; name?: string | null }
}

export function filterDeals<T extends ListDeal>(rows: T[], f: ListFilter = {}, now: Date = new Date()): T[] {
  return rows.filter((d) => {
    if (f.bucket && bucketOf(d.stage) !== f.bucket) return false
    if (!matchesQuick(d, f.quick ?? "", now)) return false
    if (f.mine) {
      const email = f.me?.email ?? ""
      const name = f.me?.name ?? ""
      // ผูกด้วยอีเมลก่อน (แม่นกว่า) — ดีลที่เลือกเซลล์คนอื่นจะไม่มี salesEmail จึงเทียบชื่อสำรอง
      const isMine = (email && d.salesEmail === email) || (!d.salesEmail && name && d.salesName === name)
      if (!isMine) return false
    }
    return true
  })
}

/** จำนวน + มูลค่าของแต่ละด่าน — คิดจากรายการที่ยังไม่กรองด่านเสมอ */
export function bucketStats(rows: ListDeal[]) {
  const stats: Record<string, { count: number; value: number }> = {}
  for (const b of BUCKETS) stats[b.key] = { count: 0, value: 0 }
  for (const d of rows) {
    const k = bucketOf(d.stage)
    if (!stats[k]) continue
    stats[k].count++
    stats[k].value += price(d)
  }
  return stats
}

/** จำนวนดีลแยกตามขั้นย่อย (ใช้โชว์ใต้ชื่อด่านว่าอยู่ขั้นไหนกี่ใบ) */
export function stageCounts(rows: ListDeal[]) {
  const c: Record<string, number> = {}
  for (const d of rows) { const k = d.stage ?? ""; if (k) c[k] = (c[k] ?? 0) + 1 }
  return c
}

export function kpis(rows: ListDeal[], now: Date = new Date()) {
  const t = today(now)
  const withFollowUp = rows.filter((d) => !!d.nextFollowUpDate)
  const open = rows.filter((d) => isOpen(d.stage ?? ""))
  return {
    total: rows.length,
    followUpToday: withFollowUp.filter((d) => d.nextFollowUpDate! <= t).length,
    followUpOverdue: withFollowUp.filter((d) => d.nextFollowUpDate! < t).length,
    stuck: open.filter((d) => (daysIn(d.stageEnteredAt, now) ?? 0) > STUCK_BAD).length,
    openCount: open.length,
    openValue: open.reduce((s, d) => s + price(d), 0),
    delivered: rows.filter((d) => d.stage === "DELIVERED").length,
    completed: rows.filter((d) => d.stage === "COMPLETED_90D").length,
  }
}

// ─── หน้าตาของสถานะ ────────────────────────────────────────────────────────

export type BadgeKind = "open" | "final" | "hold" | "lost"

export const badgeKind = (stage?: string): BadgeKind =>
  stage === "ON_HOLD" ? "hold"
  : stage === "CLOSED_LOST" ? "lost"
  : PHASES.find((p) => (p.stages as string[]).includes(stage ?? ""))?.no === 5 ? "final"
  : "open"

export const BADGE_CLASS: Record<BadgeKind, string> = {
  open: "bg-[#E8F3EE] text-[#165443] dark:bg-[#12362B] dark:text-[#7EE787]",
  final: "bg-[#FBF4DD] text-[#6B5212] dark:bg-[#3A2F12] dark:text-[#E7C86E]",
  hold: "bg-[#FFF8C5] text-[#7A4E00] dark:bg-[#3D2E05] dark:text-[#EAC54F]",
  lost: "bg-[#EFF2F5] text-[#59636E] dark:bg-zinc-800 dark:text-zinc-300",
}
export const DOT_COLOR: Record<BadgeKind, string> = { open: "", final: "#C9A227", hold: "#D4A72C", lost: "#8C959F" }

/** สี 10 ช่องของแถบความคืบหน้าย่อ — ช่องที่ถึงแล้วใช้สีด่านของช่องนั้น */
export function progressSegments(stage?: string): string[] {
  const idx = stageIndex(stage ?? "")
  const paused = stage === "ON_HOLD" || stage === "CLOSED_LOST"
  return STAGES.map((s, i) =>
    !paused && idx >= 0 && i <= idx
      ? PHASE_COLOR[PHASES.find((p) => p.stages.includes(s))!.no]
      : "#E6EDF3")
}

export type FollowTone = "overdue" | "today" | "normal" | "none"
export function followTone(date?: string, now: Date = new Date()): FollowTone {
  if (!date) return "none"
  const t = today(now)
  return date < t ? "overdue" : date === t ? "today" : "normal"
}
export const FOLLOW_CLASS: Record<FollowTone, string> = {
  overdue: "text-[#CF222E] font-bold dark:text-red-400",
  today: "text-[#9A6700] font-bold dark:text-amber-400",
  normal: "text-zinc-900 dark:text-zinc-100",
  none: "text-zinc-500",
}

/** สีของ "ค้าง N วัน" — เตือนที่ 14 วัน แดงที่ 30 วัน */
export const stuckClass = (days: number | null) =>
  days === null ? "text-zinc-500"
  : days > STUCK_BAD ? "text-[#CF222E] dark:text-red-400 font-semibold"
  : days > STUCK_WARN ? "text-[#9A6700] dark:text-amber-400 font-semibold"
  : "text-zinc-500"

/** เรียงตามวันติดตาม: เลยกำหนดขึ้นก่อน → ใกล้ถึง → ดีลที่ยังไม่มีนัด (ค้างนานสุดก่อน) */
export function sortDeals<T extends ListDeal>(rows: T[], now: Date = new Date()): T[] {
  return [...rows].sort((a, b) => {
    const fa = a.nextFollowUpDate ?? "", fb = b.nextFollowUpDate ?? ""
    if (fa && fb) return fa.localeCompare(fb)
    if (fa) return -1
    if (fb) return 1
    return (daysIn(b.stageEnteredAt, now) ?? 0) - (daysIn(a.stageEnteredAt, now) ?? 0)
  })
}
