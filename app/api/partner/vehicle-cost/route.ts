import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q        = searchParams.get("q")?.trim() ?? ""
  const category = searchParams.get("category")?.trim() ?? ""

  const pdb = await partnerDb()
  const db     = pdb

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const match: Record<string, any> = {}
  if (category) match.category = category
  if (q) {
    match["$or"] = [
      { contractCode: { $regex: q, $options: "i" } },
      { licensePlate: { $regex: q, $options: "i" } },
      { driverName:   { $regex: q, $options: "i" } },
      { truckNumber:  { $regex: q, $options: "i" } },
      { description:  { $regex: q, $options: "i" } },
    ]
  }

  const entries = await partnerColOf(db, "vehicleCosts")
    .find(match)
    .sort({ date: -1 })
    .toArray()

  // Group by contractCode
  const groups: Record<string, {
    contractCode: string
    licensePlate: string
    driverName:   string
    truckNumber:  string
    repairTotal:      number
    maintenanceTotal: number
    tireTotal:        number
    total:            number
    entries: Record<string, unknown>[]
  }> = {}

  for (const e of entries) {
    const code = String(e.contractCode ?? "")
    if (!groups[code]) {
      groups[code] = {
        contractCode:     code,
        licensePlate:     String(e.licensePlate ?? ""),
        driverName:       String(e.driverName   ?? ""),
        truckNumber:      String(e.truckNumber   ?? ""),
        repairTotal:      0,
        maintenanceTotal: 0,
        tireTotal:        0,
        total:            0,
        entries:          [],
      }
    }
    const g = groups[code]
    const amt = Number(e.amount ?? 0)
    if (e.category === "repair")      g.repairTotal      += amt
    if (e.category === "maintenance") g.maintenanceTotal += amt
    if (e.category === "tire")        g.tireTotal        += amt
    g.total += amt
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _id, ...rest } = e
    g.entries.push({ _id: _id.toString(), ...rest })
  }

  return NextResponse.json(Object.values(groups).sort((a, b) =>
    a.contractCode.localeCompare(b.contractCode)
  ))
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("vehiclecost")
  if (perm instanceof Response) return perm

  const body = await req.json() as {
    contractCode: string
    licensePlate: string
    driverName?:  string
    truckNumber?: string
    date:         string
    category:     "repair" | "maintenance" | "tire"
    description:  string
    amount:       number
  }

  if (!body.contractCode || !body.date || !body.category || !body.description || body.amount == null) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const doc = {
    contractCode: body.contractCode.trim(),
    licensePlate: body.licensePlate?.trim() ?? "",
    driverName:   body.driverName?.trim()   ?? "",
    truckNumber:  body.truckNumber?.trim()  ?? "",
    date:         body.date,
    category:     body.category,
    description:  body.description.trim(),
    amount:       Number(body.amount),
    createdAt:    new Date(),
  }

  const result = await partnerColOf(pdb, "vehicleCosts").insertOne(doc)
  return NextResponse.json({ _id: result.insertedId.toString(), ...doc }, { status: 201 })
}
