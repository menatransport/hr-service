import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { isAdminRole } from "@/lib/partner/rbac"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { nextMonth } from "@/lib/partner/utils"

const DB = PARTNER_DB

/**
 * GET /api/admin/month-summary?month=YYYY-MM
 *
 * Returns checklist data and problem drivers for the admin month dashboard.
 */
export async function GET(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session || !isAdminRole(session.user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const month = req.nextUrl.searchParams.get("month")?.trim() ?? ""
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const start = `${month}-01`
  const end   = `${nextMonth(month)}-01`

  const client = await clientPromise
  const db     = client.db(DB)

  const [
    tripsCount,
    fuelCount,
    repairCount,
    adjustCount,
    entries,
    activeDrivers,
  ] = await Promise.all([
    db.collection("trips").countDocuments({ date: { $gte: start, $lt: end } }),
    db.collection("fuel_records").countDocuments({ month }),
    db.collection("repair_monthly").countDocuments({ month }),
    db.collection("monthly_adjustments").countDocuments({
      month,
      $or: [
        { otherIncomeWHT: { $ne: 0 } },
        { otherIncomeNoWHT: { $ne: 0 } },
        { otherDeductWHT: { $ne: 0 } },
        { otherDeductNoWHT: { $ne: 0 } },
      ],
    }),
    db.collection("payroll_entries")
      .find({ month }, { projection: { contractCode: 1, netPay: 1, transportFee: 1, fuel: 1, totalIncome: 1, totalDeductions: 1 } })
      .toArray(),
    db.collection("drivers").countDocuments({ status: "active" }),
  ])

  const totalNetPay    = entries.reduce((s, e) => s + (e.netPay as number ?? 0), 0)
  const totalIncome    = entries.reduce((s, e) => s + (e.totalIncome as number ?? 0), 0)
  const entryCount     = entries.length

  // Problem drivers
  const noFuel    = entries.filter((e) => !(e.fuel as number)).map((e) => e.contractCode as string)
  const negPay    = entries
    .filter((e) => (e.netPay as number) < 0)
    .map((e) => ({ contractCode: e.contractCode as string, netPay: e.netPay as number }))

  // Driver name lookup for problem list
  const problemCodes = Array.from(new Set([...noFuel, ...negPay.map((n) => n.contractCode)]))
  const driverDocs = problemCodes.length > 0
    ? await db.collection("drivers")
        .find({ contractCode: { $in: problemCodes } }, { projection: { contractCode: 1, driverName: 1 } })
        .toArray()
    : []
  const nameMap = Object.fromEntries(driverDocs.map((d) => [d.contractCode as string, d.driverName as string]))

  return NextResponse.json({
    month,
    checklist: {
      trips:     { count: tripsCount,  ok: tripsCount > 0 },
      fuel:      { count: fuelCount,   ok: fuelCount > 0 },
      repair:    { count: repairCount, ok: repairCount > 0 },
      adjustments: { count: adjustCount, total: activeDrivers },
    },
    summary: {
      driverCount: entryCount,
      activeDrivers,
      totalIncome:  Math.round(totalIncome),
      totalNetPay:  Math.round(totalNetPay),
    },
    problems: {
      noFuel: noFuel.map((code) => ({ contractCode: code, driverName: nameMap[code] ?? code })),
      negativePay: negPay.map((n) => ({ ...n, driverName: nameMap[n.contractCode] ?? n.contractCode })),
    },
  })
}
