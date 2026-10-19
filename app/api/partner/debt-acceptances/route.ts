import { NextRequest, NextResponse } from "next/server"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q           = searchParams.get("q")?.trim()          ?? ""
  const repairType  = searchParams.get("repairType")?.trim() ?? ""
  const status      = searchParams.get("status")?.trim()     ?? ""

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}

  if (repairType) filter.repairType = repairType
  if (status)     filter.status     = status

  if (q) {
    filter["$or"] = [
      { debtAcceptanceNo: { $regex: q, $options: "i" } },
      { employeeCode:     { $regex: q, $options: "i" } },
      { employeeName:     { $regex: q, $options: "i" } },
      { contractCode:     { $regex: q, $options: "i" } },
      { licensePlate:     { $regex: q, $options: "i" } },
      { truckNumber:      { $regex: q, $options: "i" } },
      { repairOrderNo:    { $regex: q, $options: "i" } },
    ]
  }

  const pdb = await partnerDb()
  const db     = pdb

  const docs = await     partnerColOf(db, "debtAcceptances")
    .find(filter)
    .sort({ issueDate: -1 })
    .toArray()

  return NextResponse.json(docs.map((d) => ({ ...d, _id: d._id.toString() })))
}
