import { NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

export async function GET() {
  const pdb = await partnerDb()
  const db     = pdb

  const agg = await partnerColOf(db, "payrollEntries").aggregate([
    {
      $group: {
        _id:            "$month",
        totalNetPay:    { $sum: "$netPay" },
        totalIncome:    { $sum: "$totalIncome" },
        totalDeductions:{ $sum: "$totalDeductions" },
        count:          { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).toArray()

  return NextResponse.json(
    agg.map((r) => ({
      month:           r._id as string,
      totalNetPay:     r.totalNetPay as number,
      totalIncome:     r.totalIncome as number,
      totalDeductions: r.totalDeductions as number,
      count:           r.count as number,
    }))
  )
}
