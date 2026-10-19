import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB = PARTNER_DB

export async function GET() {
  const client = await clientPromise
  const db     = client.db(DB)

  const agg = await db.collection("payroll_entries").aggregate([
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
