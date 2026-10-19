import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ contractCode: string }> }
) {
  const { contractCode } = await params
  const pdb = await partnerDb()
  const db     = pdb

  const docs = await     partnerColOf(db, "debtAcceptances")
    .find({ contractCode }, { projection: { _id: 1, debtAcceptanceNo: 1, repairOrderNo: 1, repairType: 1, issueDate: 1, startDate: 1, endDate: 1, liabilityAmount: 1, installmentCount: 1, monthlyInstallment: 1, status: 1, description: 1 } })
    .sort({ startDate: -1 })
    .toArray()

  const total = docs.reduce((s, d) => s + (d.liabilityAmount as number), 0)

  return NextResponse.json({ docs, total })
}
