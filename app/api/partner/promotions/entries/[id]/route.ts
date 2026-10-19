import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("promotions")
  if (perm instanceof Response) return perm

  const body = await req.json() as {
    active?: boolean
    disabledReason?: string | null
    label?: string
    details?: Record<string, unknown>
  }

  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const now  = new Date()
  const $set: Record<string, unknown> = { updatedAt: now }

  if (typeof body.active === "boolean") {
    $set.active = body.active
    if (!body.active) {
      $set.disabledReason = body.disabledReason ?? null
      $set.disabledAt     = now
    } else {
      $set.disabledReason = null
      $set.disabledAt     = null
    }
  }
  if (body.label !== undefined)   $set.label   = body.label
  if (body.details !== undefined) $set.details = body.details

  const pdb = await partnerDb()
  const result = await partnerColOf(pdb, "promotionEntries").updateOne(
    { _id: oid },
    { $set }
  )

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const result = await partnerColOf(pdb, "promotionEntries").deleteOne({ _id: oid })

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
