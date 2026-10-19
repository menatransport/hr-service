import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractCode: string }> }
) {
  const { contractCode } = await params
  const client = await clientPromise
  const db     = client.db(PARTNER_DB)

  const doc = await db
    .collection("repair_monthly")
    .findOne({ contractCode }, { sort: { month: -1 } })

  if (!doc) return NextResponse.json(null)
  return NextResponse.json(doc)
}
