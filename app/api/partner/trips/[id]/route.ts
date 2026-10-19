import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")
  const item   = await col.findOne({ _id: new ObjectId(id) })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("vehiclecost")
  if (perm instanceof Response) return perm

  const { id } = await params
  const body   = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, ...update } = body
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  )
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "trips")
  await col.deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
