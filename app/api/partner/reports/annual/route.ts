import { NextRequest, NextResponse } from "next/server"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const year = searchParams.get("year")?.trim() ?? String(new Date().getFullYear())

  const pdb = await partnerDb()
  const db     = pdb

  // All payroll entries for the year
  const entries = await partnerColOf(db, "payrollEntries").aggregate([
    { $match: { month: { $regex: `^${year}-` } } },
    {
      $group: {
        _id:             "$contractCode",
        totalIncome:     { $sum: "$totalIncome" },
        totalDeductions: { $sum: "$totalDeductions" },
        netPay:          { $sum: "$netPay" },
        tripCount:       { $sum: "$tripCount" },
        months:          { $addToSet: "$month" },
        workingDays:     { $sum: "$workingDays" },
      },
    },
  ]).toArray()

  // All trips for the year
  const tripAgg = await partnerColOf(db, "trips").aggregate([
    { $match: { date: { $gte: `${year}-01-01`, $lt: `${Number(year) + 1}-01-01` } } },
    { $group: { _id: "$contractCode", tripFeeTotal: { $sum: "$tripFee" }, tripCount: { $sum: 1 } } },
  ]).toArray()
  const tripMap = Object.fromEntries(tripAgg.map((t) => [t._id as string, t]))

  // Active drivers for metadata
  const drivers = await partnerColOf(db, "drivers").find({ status: "active" }, {
    projection: { contractCode: 1, driverName: 1, plant: 1, truckNumber: 1 }
  }).sort({ contractCode: 1 }).toArray()
  const entryMap = Object.fromEntries(entries.map((e) => [e._id as string, e]))

  const rows = drivers
    .map((d) => {
      const code  = d.contractCode as string
      const e     = entryMap[code]
      const trips = tripMap[code]
      return {
        contractCode:    code,
        driverName:      d.driverName as string,
        plant:           d.plant as string,
        truckNumber:     (d.truckNumber ?? "") as string,
        months:          e ? (e.months as string[]).sort().length : 0,
        workingDays:     e ? (e.workingDays as number) : 0,
        tripCount:       e ? (e.tripCount as number) : 0,
        tripCountActual: trips ? (trips.tripCount as number) : 0,
        tripFeeTotal:    trips ? (trips.tripFeeTotal as number) : 0,
        totalIncome:     e ? (e.totalIncome as number) : 0,
        totalDeductions: e ? (e.totalDeductions as number) : 0,
        netPay:          e ? (e.netPay as number) : 0,
        hasEntry:        !!e,
      }
    })
    .filter((r) => r.hasEntry)

  // Month list for this year from DB
  const monthList = await partnerColOf(db, "payrollEntries")
    .distinct("month", { month: { $regex: `^${year}-` } }) as string[]
  monthList.sort()

  const summary = {
    year,
    monthCount:      monthList.length,
    driverCount:     rows.length,
    grandIncome:     rows.reduce((s, r) => s + r.totalIncome, 0),
    grandDeductions: rows.reduce((s, r) => s + r.totalDeductions, 0),
    grandNetPay:     rows.reduce((s, r) => s + r.netPay, 0),
    grandTrips:      rows.reduce((s, r) => s + r.tripCountActual, 0),
  }

  // Per-month totals for the trend table
  const monthTotals = await partnerColOf(db, "payrollEntries").aggregate([
    { $match: { month: { $regex: `^${year}-` } } },
    {
      $group: {
        _id:             "$month",
        totalIncome:     { $sum: "$totalIncome" },
        totalDeductions: { $sum: "$totalDeductions" },
        netPay:          { $sum: "$netPay" },
        count:           { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  const monthBreakdown = monthTotals.map((m) => ({
    month:           m._id as string,
    totalIncome:     m.totalIncome as number,
    totalDeductions: m.totalDeductions as number,
    netPay:          m.netPay as number,
    count:           m.count as number,
  }))

  return NextResponse.json({ year, summary, rows, monthBreakdown })
}
