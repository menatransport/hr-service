import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "vehicle_costs"

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const client  = await clientPromise
  const result  = await client.db(DB).collection(COLL).deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
