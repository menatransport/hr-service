import { NextResponse } from "next/server"
import { QUOTE_COLL } from "@/lib/partner/quotation"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)
const OPEN = (s: string) => s !== "won" && s !== "lost"

/** GET /api/quotations/dashboard — สรุปเชิงวิเคราะห์ของงานขาย (funnel/leaderboard/แนวโน้ม/ดีลค้าง) */
export async function GET() {
  const pdb = await partnerDb()
  const db = pdb
  const rows = await partnerColOf(db, "quotations")
    .find({}, { projection: { status: 1, totalSalePrice: 1, salesName: 1, salesEmail: 1, createdAt: 1, updatedAt: 1, customerName: 1, quotationNo: 1, licensePlate: 1 } })
    .limit(5000).toArray()

  const now = Date.now()
  const STATUSES = ["lead", "quoted", "booked", "won", "lost"]

  // ── funnel: จำนวน+มูลค่า ต่อสถานะ ──
  const funnel = STATUSES.map((s) => {
    const r = rows.filter((x) => x.status === s)
    return { status: s, count: r.length, value: r.reduce((a, x) => a + n(x.totalSalePrice), 0) }
  })

  // ── totals ──
  const total = rows.length
  const pipelineValue = rows.filter((x) => OPEN(x.status)).reduce((a, x) => a + n(x.totalSalePrice), 0)
  const wonCount = rows.filter((x) => x.status === "won").length
  const wonValue = rows.filter((x) => x.status === "won").reduce((a, x) => a + n(x.totalSalePrice), 0)
  const closed = rows.filter((x) => x.status === "won" || x.status === "lost").length
  const winRate = closed ? Math.round((wonCount / closed) * 100) : 0

  // ── leaderboard รายพนักงานขาย ──
  const byRep = new Map<string, { name: string; deals: number; won: number; wonValue: number; pipeline: number }>()
  for (const x of rows) {
    const name = (x.salesName || x.salesEmail || "ไม่ระบุ") as string
    const e = byRep.get(name) ?? { name, deals: 0, won: 0, wonValue: 0, pipeline: 0 }
    e.deals++
    if (x.status === "won") { e.won++; e.wonValue += n(x.totalSalePrice) }
    if (OPEN(x.status)) e.pipeline += n(x.totalSalePrice)
    byRep.set(name, e)
  }
  const leaderboard = [...byRep.values()]
    .map((e) => ({ ...e, winRate: e.deals ? Math.round((e.won / e.deals) * 100) : 0 }))
    .sort((a, b) => b.wonValue - a.wonValue || b.won - a.won || b.deals - a.deals)

  // ── แนวโน้มรายเดือน (ตาม createdAt, 6 เดือนล่าสุดที่มีข้อมูล) ──
  const byMonth = new Map<string, { month: string; deals: number; value: number; won: number }>()
  for (const x of rows) {
    const m = String(x.createdAt || "").slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(m)) continue
    const e = byMonth.get(m) ?? { month: m, deals: 0, value: 0, won: 0 }
    e.deals++; e.value += n(x.totalSalePrice); if (x.status === "won") e.won++
    byMonth.set(m, e)
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6)

  // ── aging: ดีลที่ยังไม่ปิด แยกตามจำนวนวันนับจากอัปเดตล่าสุด ──
  const BUCKETS = [{ k: "0-7 วัน", lo: 0, hi: 7 }, { k: "8-14 วัน", lo: 8, hi: 14 }, { k: "15-30 วัน", lo: 15, hi: 30 }, { k: "30+ วัน", lo: 31, hi: Infinity }]
  const aging = BUCKETS.map((b) => ({ bucket: b.k, count: 0, value: 0 }))
  const openDeals = rows.filter((x) => OPEN(x.status))
  const ageOf = (x: Record<string, unknown>) => Math.floor((now - (Date.parse(String(x.updatedAt || x.createdAt || "")) || now)) / 86400000)
  for (const x of openDeals) {
    const days = ageOf(x)
    let idx = BUCKETS.findIndex((b) => days >= b.lo && days <= b.hi)
    if (idx < 0) idx = BUCKETS.length - 1
    aging[idx].count++; aging[idx].value += n(x.totalSalePrice)
  }

  // ── ดีลค้าง/ต้องตามต่อ: ยังไม่ปิด + ค้าง ≥ 14 วัน (สูงสุด 15 รายการ) ──
  const stale = openDeals
    .map((x) => ({ id: String(x._id), quotationNo: x.quotationNo, customerName: x.customerName, status: x.status, licensePlate: x.licensePlate, salesName: x.salesName, value: n(x.totalSalePrice), days: ageOf(x) }))
    .filter((d) => d.days >= 14)
    .sort((a, b) => b.days - a.days)
    .slice(0, 15)

  return NextResponse.json({ total, pipelineValue, wonCount, wonValue, winRate, funnel, leaderboard, monthly, aging, stale })
}
