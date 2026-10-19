/**
 * ค่าคอมมิชชั่นฝ่ายขาย — ขั้นบันไดแบบ marginal สะสมตลอดชีพ (ไม่รีเซ็ตรอบ)
 * ไฟล์นี้ pure ไม่แตะ DB/env — ใช้ได้ทั้ง server, client และ unit test
 *
 * นับ 1 คัน เมื่อใบเสนอราคามีสถานะ "won" (ปิดการขาย)
 */

/** ช่วงขั้นบันได: คันที่ 1..upTo ได้ rate บาท/คัน (upTo = null คือขั้นสุดท้าย ไม่จำกัด) */
export type CommissionTier = { upTo: number | null; rate: number }

export const COMMISSION_TIERS: CommissionTier[] = [
  { upTo: 5,    rate: 2000 },
  { upTo: 10,   rate: 3500 },
  { upTo: 15,   rate: 4000 },
  { upTo: null, rate: 5000 },
]

/** ค่าคอมของ "คันที่ n" (n เริ่มที่ 1) */
export function commissionForNth(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 0
  const i = Math.floor(n)
  for (const t of COMMISSION_TIERS) if (t.upTo === null || i <= t.upTo) return t.rate
  return 0
}

/** ค่าคอมสะสมของคนที่ขายไปแล้ว count คัน */
export function commissionTotal(count: number): number {
  if (!Number.isFinite(count) || count < 1) return 0
  let total = 0
  for (let i = 1; i <= Math.floor(count); i++) total += commissionForNth(i)
  return total
}

/** ขั้นถัดไป: อีกกี่คันถึงจะขึ้นอัตรา และขึ้นเป็นเท่าไหร่ (null = อยู่ขั้นสูงสุดแล้ว) */
export function nextTierInfo(count: number): { carsToNext: number; nextRate: number } | null {
  const done = Math.max(0, Math.floor(count || 0))
  const currentRate = commissionForNth(done + 1)
  for (const t of COMMISSION_TIERS) {
    if (t.upTo === null) break
    if (done < t.upTo && t.rate === currentRate) {
      const nextIdx = COMMISSION_TIERS.indexOf(t) + 1
      const next = COMMISSION_TIERS[nextIdx]
      if (!next || next.rate === currentRate) return null
      return { carsToNext: t.upTo - done, nextRate: next.rate }
    }
  }
  return null
}

/* ---------- สรุปรายคน ---------- */

/** ใบเสนอราคาเท่าที่การคำนวณค่าคอมต้องใช้ */
export type CommissionQuote = {
  _id?: string
  quotationNo: string
  status: string
  salesEmail?: string
  salesName?: string
  customerName?: string
  licensePlate?: string
  truckNumber?: string
  totalSalePrice?: number
  updatedAt?: string
  createdAt?: string
  timeline?: { at: string; by: string; action: string; note?: string }[]
}

export type CommissionSale = {
  nth: number            // คันที่เท่าไหร่ของคนนี้ (นับสะสมตลอดชีพ)
  wonAt: string          // วันปิดการขาย (ISO)
  quotationId: string
  quotationNo: string
  customerName: string
  licensePlate: string
  truckNumber: string
  salePrice: number
  commission: number     // ค่าคอมของคันนี้
  cumulative: number     // ค่าคอมสะสมถึงคันนี้
}

export type CommissionSummary = {
  key: string            // email (lowercase) หรือ name — ใช้เป็น id ของกลุ่ม
  name: string
  email: string
  unassigned: boolean    // true = ใบที่ไม่มีผู้ขาย (ข้อมูลไม่สมบูรณ์)
  count: number
  total: number          // ค่าคอมสะสมรวม
  salesValue: number     // มูลค่าขายรวม
  currentRate: number    // อัตราของคันถัดไป
  next: { carsToNext: number; nextRate: number } | null
  sales: CommissionSale[]
}

const WON = "won"

/** วันปิดการขาย: event ล่าสุดใน timeline ที่ลงท้าย "ปิดการขาย" ไม่มีก็ใช้ updatedAt/createdAt */
export function wonDateOf(q: CommissionQuote): string {
  const events = (q.timeline ?? []).filter((t) => /ปิดการขาย\s*$/.test(t.action ?? ""))
  const last = events[events.length - 1]
  return last?.at || q.updatedAt || q.createdAt || ""
}

/** สรุปค่าคอมรายคนจากใบเสนอราคาทั้งหมด (กรอง won ให้เอง) */
export function buildSalesCommission(quotes: CommissionQuote[]): CommissionSummary[] {
  const groups = new Map<string, { name: string; email: string; unassigned: boolean; rows: CommissionQuote[] }>()

  for (const q of quotes) {
    if (q.status !== WON) continue
    const email = (q.salesEmail ?? "").trim().toLowerCase()
    const name = (q.salesName ?? "").trim()
    const key = email || name || "__unassigned__"
    const g = groups.get(key) ?? {
      name: name || email || "ไม่ระบุผู้ขาย",
      email,
      unassigned: !email && !name,
      rows: [],
    }
    // ชื่อล่าสุดชนะ (กันเคสเปลี่ยนชื่อ/สะกดต่างกันในใบเก่า)
    if (name) g.name = name
    g.rows.push(q)
    groups.set(key, g)
  }

  const out: CommissionSummary[] = []
  for (const [key, g] of groups) {
    const sorted = [...g.rows].sort((a, b) => {
      const d = wonDateOf(a).localeCompare(wonDateOf(b))
      return d !== 0 ? d : (a.quotationNo ?? "").localeCompare(b.quotationNo ?? "")
    })
    let cumulative = 0
    const sales: CommissionSale[] = sorted.map((q, i) => {
      const nth = i + 1
      const commission = commissionForNth(nth)
      cumulative += commission
      return {
        nth,
        wonAt: wonDateOf(q),
        quotationId: String(q._id ?? ""),
        quotationNo: q.quotationNo ?? "",
        customerName: q.customerName ?? "",
        licensePlate: q.licensePlate ?? "",
        truckNumber: q.truckNumber ?? "",
        salePrice: Number(q.totalSalePrice) || 0,
        commission,
        cumulative,
      }
    })
    out.push({
      key,
      name: g.name,
      email: g.email,
      unassigned: g.unassigned,
      count: sales.length,
      total: cumulative,
      salesValue: sales.reduce((a, s) => a + s.salePrice, 0),
      currentRate: commissionForNth(sales.length + 1),
      next: nextTierInfo(sales.length),
      sales,
    })
  }

  // ขายมากสุดขึ้นก่อน · กลุ่มไม่ระบุผู้ขายไปท้ายเสมอ
  return out.sort((a, b) =>
    Number(a.unassigned) - Number(b.unassigned) || b.count - a.count || b.total - a.total)
}

/** label ของช่วงขั้นบันได สำหรับแสดงตารางกติกา */
export function tierLabel(i: number): string {
  const t = COMMISSION_TIERS[i]
  const from = i === 0 ? 1 : (COMMISSION_TIERS[i - 1].upTo ?? 0) + 1
  return t.upTo === null ? `คันที่ ${from} เป็นต้นไป` : `คันที่ ${from}–${t.upTo}`
}
