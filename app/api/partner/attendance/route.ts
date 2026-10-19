import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { ATT_COLL } from "@/lib/partner/attendance"

const DB = PARTNER_DB

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? ""
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 })
  const client = await clientPromise
  const rows = await client.db(DB).collection(ATT_COLL).find({ month }).sort({ driverName: 1 }).toArray()
  return NextResponse.json(rows.map((r) => ({ ...r, _id: r._id.toString() })))
}
