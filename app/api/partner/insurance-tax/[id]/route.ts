import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { normPlateIT } from "@/lib/partner/insurance-tax"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { id } = await params
  const body   = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, platePlain: _pp, ...update } = body

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "vehicleInsuranceTax")
  const now    = new Date().toISOString()

  // ทะเบียนเปลี่ยน → คำนวณ platePlain ใหม่
  if (typeof update.licensePlate === "string") {
    update.platePlain = normPlateIT(update.licensePlate) || update.licensePlate
  }

  const before = await col.findOne({ _id: new ObjectId(id) })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: now } },
    { returnDocument: "after" }
  )
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const changes = diffFields(before, result, [
    "amount", "effectiveDate", "expiryDate", "company",
    "monthlyInstallment", "installmentCount", "collectStart", "collectEnd", "status",
  ])
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "insurance_tax",
      entityId: (before.platePlain as string) ?? "",
      action: "edit",
      changes: { ประเภท: { from: null, to: before.itemType ?? null }, ...changes },
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }

  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "vehicleInsuranceTax")
  await col.deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
