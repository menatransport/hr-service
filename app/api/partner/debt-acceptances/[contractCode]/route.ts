import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractCode: string }> }
) {
  const { contractCode } = await params
  const client = await clientPromise
  const db     = client.db(PARTNER_DB)

  const docs = await db
    .collection("debt_acceptances")
    .find({ contractCode }, { projection: { _id: 1, debtAcceptanceNo: 1, repairOrderNo: 1, repairType: 1, issueDate: 1, startDate: 1, endDate: 1, liabilityAmount: 1, installmentCount: 1, monthlyInstallment: 1, status: 1, description: 1 } })
    .sort({ startDate: -1 })
    .toArray()

  const total = docs.reduce((s, d) => s + (d.liabilityAmount as number), 0)

  return NextResponse.json({ docs, total })
}
