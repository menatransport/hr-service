import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET() {
  const pdb = await partnerDb()
  const docs = await partnerColOf(pdb, "promotionEntries")
    .find({})
    .sort({ licensePlate: 1, proType: 1 })
    .toArray()

  // Group by licensePlate
  const grouped: Record<string, object[]> = {}
  for (const d of docs) {
    const plate = d.licensePlate as string
    if (!grouped[plate]) grouped[plate] = []
    grouped[plate].push({
      id:             (d._id as ObjectId).toHexString(),
      licensePlate:   d.licensePlate,
      proType:        d.proType,
      label:          d.label,
      active:         d.active,
      disabledReason: d.disabledReason ?? null,
      disabledAt:     d.disabledAt ?? null,
      details:        d.details ?? {},
      createdAt:      d.createdAt,
      updatedAt:      d.updatedAt,
    })
  }

  return NextResponse.json(grouped)
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("promotions")
  if (perm instanceof Response) return perm

  const body = await req.json() as {
    licensePlate: string
    proType: string
    label: string
    details: Record<string, unknown>
  }

  if (!body.licensePlate || !body.proType || !body.label) {
    return NextResponse.json({ error: "licensePlate, proType and label required" }, { status: 400 })
  }

  const now = new Date()
  const pdb = await partnerDb()
  const result = await partnerColOf(pdb, "promotionEntries").insertOne({
    licensePlate:   body.licensePlate,
    proType:        body.proType,
    label:          body.label,
    active:         true,
    disabledReason: null,
    disabledAt:     null,
    details:        body.details ?? {},
    createdAt:      now,
    updatedAt:      now,
  })

  return NextResponse.json({ ok: true, id: result.insertedId.toHexString() })
}
