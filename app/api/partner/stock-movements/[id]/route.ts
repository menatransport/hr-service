import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
type Ctx = { params: Promise<{ id: string }> }

// PATCH — set which promotion covers this movement item: "" | "repair" | "pm"
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body   = await req.json() as { promoType?: string }

  const promoType = body.promoType ?? ""
  if (!["", "repair", "pm"].includes(promoType)) {
    return NextResponse.json({ error: "invalid promoType" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const result = await partnerColOf(pdb, "stockMovements").updateOne(
    { _id: new ObjectId(id) },
    { $set: { promoType, updatedAt: new Date() } }
  )
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return NextResponse.json({ ok: true, promoType })
}
