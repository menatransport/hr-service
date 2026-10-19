import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractCode: string }> }
) {
  const { contractCode } = await params
  const pdb = await partnerDb()
  const db     = pdb

  const doc = await     partnerColOf(db, "repairMonthly")
    .findOne({ contractCode }, { sort: { month: -1 } })

  if (!doc) return NextResponse.json(null)
  return NextResponse.json(doc)
}
