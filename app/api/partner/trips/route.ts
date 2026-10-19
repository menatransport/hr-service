import { NextRequest, NextResponse } from "next/server"
import { nextMonth } from "@/lib/partner/utils"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const contractCode = searchParams.get("contractCode")?.trim() ?? ""
  const month        = searchParams.get("month")?.trim() ?? ""
  const plant        = searchParams.get("plant")?.trim() ?? ""

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (contractCode) filter.contractCode = contractCode
  if (plant)        filter.plant = { $regex: plant, $options: "i" }
  if (month) {
    const [yearStr, monthStr] = month.split("-")
    const startStr = `${yearStr}-${monthStr.padStart(2, "0")}-01`
    const endStr   = `${nextMonth(month)}-01`
    filter.date = { $gte: startStr, $lt: endStr }
  }

  const items = await col.find(filter).sort({ date: -1, contractCode: 1 }).limit(500).toArray()
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("vehiclecost")
  if (perm instanceof Response) return perm

  const body = await req.json()
  if (!body.contractCode || !body.date) {
    return NextResponse.json({ error: "contractCode and date required" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")
  const doc    = { ...body, createdAt: new Date().toISOString() }
  const result = await col.insertOne(doc)
  return NextResponse.json({ _id: result.insertedId, ...doc }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { searchParams } = req.nextUrl
  const contractCode = searchParams.get("contractCode")?.trim() ?? ""
  const month        = searchParams.get("month")?.trim() ?? ""

  if (!month) {
    return NextResponse.json({ error: "month is required" }, { status: 400 })
  }

  const [yearStr, monthStr] = month.split("-")
  const startStr = `${yearStr}-${monthStr.padStart(2, "0")}-01`
  const endStr   = `${nextMonth(month)}-01`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { date: { $gte: startStr, $lt: endStr } }
  if (contractCode) filter.contractCode = contractCode

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")
  const result = await col.deleteMany(filter)
  return NextResponse.json({ deleted: result.deletedCount })
}
