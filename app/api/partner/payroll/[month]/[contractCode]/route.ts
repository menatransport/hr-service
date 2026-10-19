import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { computePayroll } from "@/lib/partner/utils"

const DB   = PARTNER_DB
const COLL = "payroll_entries"

type Ctx = { params: Promise<{ month: string; contractCode: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { month, contractCode } = await params
  const client = await clientPromise
  const col    = client.db(DB).collection(COLL)
  const item   = await col.findOne({ month, contractCode })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { month, contractCode } = await params
  const body   = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, ...update } = body
  const computed = computePayroll(update)
  const now    = new Date().toISOString()

  const client = await clientPromise
  if (await monthClosed(client.db(DB), month)) return NextResponse.json(closedError(month), { status: 423 })
  const col    = client.db(DB).collection(COLL)

  const result = await col.findOneAndUpdate(
    { month, contractCode },
    { $set: { ...update, ...computed, updatedAt: now } },
    { returnDocument: "after", upsert: true }
  )
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { month, contractCode } = await params
  const client = await clientPromise
  if (await monthClosed(client.db(DB), month)) return NextResponse.json(closedError(month), { status: 423 })
  const col    = client.db(DB).collection(COLL)
  const result = await col.deleteOne({ month, contractCode })
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
