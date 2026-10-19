import { NextRequest, NextResponse } from "next/server"
import { prevMonth } from "@/lib/partner/utils"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * GET /api/payroll/[month]/approval-summary
 * ข้อมูลครบชุดสำหรับหน้าอนุมัติผู้บริหาร (Executive Summary):
 * ยอดรวม + MoM + ต่อแพล้นท์ + Top/ผิดปกติ + หนี้-เงินสะสมทั้ง fleet + สถานะงวด
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db     = pdb

  const [entries, prevEntries, drivers, status] = await Promise.all([
    partnerColOf(db, "payrollEntries").find({ month }).toArray(),
    partnerColOf(db, "payrollEntries").find({ month: prevMonth(month) })
      .project({ totalIncome: 1, totalDeductions: 1, netPay: 1 }).toArray(),
    partnerColOf(db, "drivers").find({}).project({ contractCode: 1, driverName: 1, plant: 1 }).toArray(),
    partnerColOf(db, "monthStatus").findOne({ month }),
  ])

  const dMap = Object.fromEntries(drivers.map((d) => [d.contractCode as string, d]))
  const name = (c: string) => (dMap[c]?.driverName as string) ?? ""
  const num  = (v: unknown) => (typeof v === "number" ? v : 0)

  const totals = {
    drivers:    entries.length,
    income:     r2(entries.reduce((s, e) => s + num(e.totalIncome), 0)),
    deductions: r2(entries.reduce((s, e) => s + num(e.totalDeductions), 0)),
    netPay:     r2(entries.reduce((s, e) => s + num(e.netPay), 0)),
    payable:    r2(entries.reduce((s, e) => s + Math.max(0, num(e.payable ?? e.netPay)), 0)),
    carryIn:    r2(entries.reduce((s, e) => s + num(e.carryIn), 0)),
    carryOut:   r2(entries.reduce((s, e) => s + num(e.carryOut), 0)),
    trips:      entries.reduce((s, e) => s + num(e.tripCount), 0),
    fuel:       r2(entries.reduce((s, e) => s + num(e.fuel) + num(e.fuelOverCharge) - num(e.fuelUnderRefund), 0)),
    wht:        r2(entries.reduce((s, e) => s + num(e.whtAmount), 0)),
    paidNet:    r2(entries.reduce((s, e) => s + (typeof e.paidNet === "number" ? (e.paidNet as number) : Math.max(0, num(e.payable ?? e.netPay)) - num(e.whtAmount)), 0)),
  }
  const prev = {
    drivers: prevEntries.length,
    income:  r2(prevEntries.reduce((s, e) => s + num(e.totalIncome), 0)),
    netPay:  r2(prevEntries.reduce((s, e) => s + num(e.netPay), 0)),
  }

  // ── ต่อแพล้นท์ ──
  const plantMap: Record<string, { drivers: number; income: number; netPay: number }> = {}
  for (const e of entries) {
    const p = (dMap[e.contractCode as string]?.plant as string) || "ไม่ระบุ"
    plantMap[p] ??= { drivers: 0, income: 0, netPay: 0 }
    plantMap[p].drivers++
    plantMap[p].income = r2(plantMap[p].income + num(e.totalIncome))
    plantMap[p].netPay = r2(plantMap[p].netPay + num(e.netPay))
  }
  const plants = Object.entries(plantMap).map(([plant, v]) => ({ plant, ...v }))
    .sort((a, b) => b.netPay - a.netPay)

  // ── Top & ผิดปกติ ──
  const brief = (e: Record<string, unknown>) => ({
    contractCode: e.contractCode as string,
    driverName:   name(e.contractCode as string),
    netPay: num(e.netPay), totalIncome: num(e.totalIncome), totalDeductions: num(e.totalDeductions),
    carryIn: num(e.carryIn), carryOut: num(e.carryOut), workingDays: num(e.workingDays), tripCount: num(e.tripCount),
  })
  const topPay   = [...entries].sort((a, b) => num(b.netPay) - num(a.netPay)).slice(0, 10).map(brief)
  const carryList = entries.filter((e) => num(e.carryOut) > 0)
    .sort((a, b) => num(b.carryOut) - num(a.carryOut)).map(brief)
  const anomalies = entries.flatMap((e) => {
    const list: { type: string; detail: string; row: ReturnType<typeof brief> }[] = []
    if (num(e.netPay) < 0) list.push({ type: "สุทธิติดลบ", detail: `NetPay ${num(e.netPay).toLocaleString()}`, row: brief(e) })
    if (num(e.workingDays) > 0 && num(e.tripCount) === 0) list.push({ type: "มีวันทำงานแต่ไม่มีเที่ยว", detail: `${num(e.workingDays)} วัน / 0 เที่ยว`, row: brief(e) })
    if (num(e.totalIncome) > 0 && num(e.totalDeductions) > num(e.totalIncome) * 1.5) list.push({ type: "หักเกินรับ >150%", detail: `หัก ${num(e.totalDeductions).toLocaleString()} / รับ ${num(e.totalIncome).toLocaleString()}`, row: brief(e) })
    return list
  })

  // ── หนี้/เงินสะสมทั้ง fleet (driver_ledger) ──
  const ledger = await partnerColOf(db, "driverLedger").aggregate([
    { $match: { status: "active" } },
    { $group: {
      _id: "$kind",
      n: { $sum: 1 },
      outstanding: { $sum: { $cond: [{ $eq: ["$kind", "debt"] },
        { $subtract: [{ $ifNull: ["$principal", 0] }, { $ifNull: ["$paidAmount", 0] }] },
        { $subtract: [{ $ifNull: ["$paidAmount", 0] }, { $ifNull: ["$withdrawnAmount", 0] }] }] } },
    } },
  ]).toArray()
  const debt    = ledger.find((l) => l._id === "debt")
  const deposit = ledger.find((l) => l._id === "deposit")

  return NextResponse.json({
    month,
    phase: (status?.phase as string) === "review" ? "checked" : ((status?.phase as string) ?? "draft"),
    history: (status?.history as unknown[]) ?? [],
    totals,
    prev,
    mom: {
      income: prev.income ? r2(((totals.income - prev.income) / prev.income) * 100) : null,
      netPay: prev.netPay ? r2(((totals.netPay - prev.netPay) / prev.netPay) * 100) : null,
    },
    plants,
    topPay,
    carryList,
    anomalies,
    ledger: {
      debtCount: (debt?.n as number) ?? 0,       debtOutstanding: r2((debt?.outstanding as number) ?? 0),
      depositCount: (deposit?.n as number) ?? 0, depositBalance: r2((deposit?.outstanding as number) ?? 0),
    },
  })
}
