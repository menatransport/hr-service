import { NextRequest, NextResponse } from "next/server"
import { nextMonth } from "@/lib/partner/utils"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 })

  const pdb  = await partnerDb()
  const db      = pdb
  const entries = await partnerColOf(db, "payrollEntries").find({ month }).toArray()
  const drivers = await partnerColOf(db, "drivers").find({ status: "active" }).sort({ contractCode: 1 }).toArray()
  const startStr = `${month}-01`
  const endStr   = `${nextMonth(month)}-01`

  const tripAgg = await partnerColOf(db, "trips").aggregate([
    {
      $match: {
        date: { $gte: startStr, $lt: endStr },
      },
    },
    { $group: { _id: "$contractCode", tripCount: { $sum: 1 }, totalTripFee: { $sum: "$tripFee" } } },
  ]).toArray()

  const tripMap  = Object.fromEntries(tripAgg.map((t) => [t._id as string, t]))
  const entryMap = Object.fromEntries(entries.map((e) => [e.contractCode as string, e]))

  const rows = drivers.map((d) => {
    const entry = entryMap[d.contractCode as string]
    const trips = tripMap[d.contractCode as string]
    return {
      ...(entry ?? {}),                 // field รายบรรทัดทั้งหมด (transportFee, fuel, extrasItems, carry ฯลฯ)
      _id: undefined,                   // ไม่ส่ง ObjectId (JSON ตัด undefined ทิ้ง)
      contractCode:    d.contractCode,
      driverName:      d.driverName,
      truckNumber:     d.truckNumber ?? "",
      plant:           d.plant,
      tripCount:       trips?.tripCount ?? entry?.tripCount ?? 0,
      totalTripFee:    trips?.totalTripFee ?? entry?.transportFee ?? 0,
      workingDays:     entry?.workingDays ?? 0,
      totalIncome:     entry?.totalIncome ?? 0,
      totalDeductions: entry?.totalDeductions ?? 0,
      netPay:          entry?.netPay ?? 0,
      hasEntry:        !!entry,
    }
  })

  const summary = {
    totalDrivers:     drivers.length,
    driversWithEntry: entries.length,
    grandNetPay:      rows.reduce((s, r) => s + r.netPay, 0),
    grandIncome:      rows.reduce((s, r) => s + r.totalIncome, 0),
    grandDeductions:  rows.reduce((s, r) => s + r.totalDeductions, 0),
  }

  // Per-plant breakdown
  const plantMap: Record<string, { totalDrivers: number; driversWithEntry: number; grandNetPay: number; grandIncome: number }> = {}
  for (const r of rows) {
    const p = (r.plant as string | undefined) ?? "ไม่ระบุ"
    if (!plantMap[p]) plantMap[p] = { totalDrivers: 0, driversWithEntry: 0, grandNetPay: 0, grandIncome: 0 }
    plantMap[p].totalDrivers++
    if (r.hasEntry) { plantMap[p].driversWithEntry++; plantMap[p].grandNetPay += r.netPay; plantMap[p].grandIncome += r.totalIncome }
  }
  const plantBreakdown = Object.entries(plantMap)
    .map(([plant, stats]) => ({ plant, ...stats }))
    .sort((a, b) => a.plant.localeCompare(b.plant))

  return NextResponse.json({ month, summary, rows, plantBreakdown })
}
