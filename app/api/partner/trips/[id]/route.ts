import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "trips"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const client = await clientPromise
  const col    = client.db(DB).collection(COLL)
  const item   = await col.findOne({ _id: new ObjectId(id) })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body   = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, ...update } = body
  const client = await clientPromise
  const col    = client.db(DB).collection(COLL)
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  )
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const client = await clientPromise
  const col    = client.db(DB).collection(COLL)
  await col.deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true })
}
