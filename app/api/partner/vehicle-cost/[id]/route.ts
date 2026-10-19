import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  const pdb  = await partnerDb()
  const result  = await partnerColOf(pdb, "vehicleCosts").deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
