import { NextRequest, NextResponse } from "next/server"
import { ATT_COLL } from "@/lib/partner/attendance"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? ""
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 })
  const pdb = await partnerDb()
  const rows = await partnerColOf(pdb, "attendanceMonthly").find({ month }).sort({ driverName: 1 }).toArray()
  return NextResponse.json(rows.map((r) => ({ ...r, _id: r._id.toString() })))
}
