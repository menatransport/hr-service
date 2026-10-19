import { NextRequest, NextResponse } from "next/server"
import { ensureFirstVersion } from "@/lib/partner/company-config"
import type { Contract, Driver } from "@/lib/partner/types"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q      = searchParams.get("q")?.trim() ?? ""
  const status = searchParams.get("status")?.trim() ?? ""
  const plant  = searchParams.get("plant")?.trim() ?? ""

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "contracts")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (q) {
    filter["$or"] = [
      { contractCode: { $regex: q, $options: "i" } },
      { buyerName:    { $regex: q, $options: "i" } },
      { driverName:   { $regex: q, $options: "i" } },
      { licensePlate: { $regex: q, $options: "i" } },
      { truckNumber:  { $regex: q, $options: "i" } },
      { phone:        { $regex: q, $options: "i" } },
      { plant:        { $regex: q, $options: "i" } },
    ]
  }
  if (status) filter.status = status
  if (plant)  filter.plant  = { $regex: plant, $options: "i" }

  const items = await col
    .find(filter)
    .sort({ contractCode: 1 })
    .project({ notes: 0 })
    .toArray()

  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("contracts")
  if (perm instanceof Response) return perm

  const body: Contract = await req.json()

  if (!body.contractCode || !body.buyerName || !body.driverName) {
    return NextResponse.json({ error: "contractCode, buyerName, driverName required" }, { status: 400 })
  }

  const pdb    = await partnerDb()
  const contracts = partnerColOf(pdb, "contracts")
  const drivers   = partnerColOf(pdb, "drivers")

  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...rest } = body
  // จำเวอร์ชันข้อมูลบริษัท/ผู้ลงนามที่ใช้ตอนสร้าง — พิมพ์เอกสารซ้ำภายหลังต้องได้ชื่อชุดเดิม
  const company = await ensureFirstVersion(pdb)
  const doc = { ...rest, companyVersion: company.version, createdAt: now, updatedAt: now }

  const existing = await contracts.findOne({ contractCode: body.contractCode })
  if (existing) {
    return NextResponse.json({ error: "contractCode already exists" }, { status: 409 })
  }

  const result = await contracts.insertOne(doc)

  // Auto-create driver document
  const driverDoc: Driver = {
    firstName:    body.driverName ?? body.buyerName ?? "",
    lastName:     "",
    contractCode: body.contractCode,
    buyerName:    body.buyerName,
    driverName:   body.driverName,
    truckNumber:  body.truckNumber,
    licensePlate: body.licensePlate,
    phone:        body.phone,
    status:       "active",
    createdAt:    now,
  }
  await drivers.updateOne(
    { contractCode: body.contractCode },
    { $setOnInsert: driverDoc },
    { upsert: true }
  )

  revalidatePublicTrucks()   // สัญญาใหม่ = รถคันนี้หายจากหน้า /trucks ทันที
  return NextResponse.json({ _id: result.insertedId, ...doc }, { status: 201 })
}
