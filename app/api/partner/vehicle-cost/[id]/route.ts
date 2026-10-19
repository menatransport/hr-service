import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb  = await partnerDb()
  const result  = await partnerColOf(pdb, "vehicleCosts").deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
