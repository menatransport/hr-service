import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

const STATUSES = ["active", "paid", "paused", "cancelled"] as const

/**
 * PUT /api/ledger/[id] — แก้ monthlyAmount / targetAmount / notes / status
 * (pause = status "paused", resume = "active", cancel = "cancelled")
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })
  const body = await req.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {}
  if (typeof body.monthlyAmount === "number") {
    if (!(body.monthlyAmount > 0)) return NextResponse.json({ error: "monthlyAmount must be > 0" }, { status: 400 })
    update.monthlyAmount = Math.round(body.monthlyAmount * 100) / 100
  }
  if (typeof body.targetAmount === "number") {
    if (!(body.targetAmount > 0)) return NextResponse.json({ error: "targetAmount must be > 0" }, { status: 400 })
    update.targetAmount = Math.round(body.targetAmount * 100) / 100
  } else if (body.targetAmount === null) {
    update.targetAmount = null
  }
  if (typeof body.notes === "string") update.notes = body.notes
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 })
    }
    update.status = body.status
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update (allowed: monthlyAmount, targetAmount, notes, status)" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "driverLedger")

  const before = await col.findOne({ _id: new ObjectId(id) })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" }
  )
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const changes = diffFields(before, result, ["monthlyAmount", "targetAmount", "notes", "status"])
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: PARTNER.driverLedger,
      entityId: (before.debtCode as string) ?? "",
      action: "edit",
      changes,
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }

  return NextResponse.json({ ...result, _id: result._id.toString() })
}

/** DELETE /api/ledger/[id] — ลบได้เฉพาะ entry ที่ยังไม่มี payment (ลบ skips/withdrawals ที่ค้างด้วย) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })

  const pdb = await partnerDb()
  const db     = pdb

  const entry = await partnerColOf(db, "driverLedger").findOne({ _id: new ObjectId(id) })
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const paymentCount = await partnerColOf(db, "ledgerPayments").countDocuments({ entryId: id })
  if (paymentCount > 0) {
    return NextResponse.json(
      { error: `entry has ${paymentCount} payment(s) — cancel it instead of deleting` },
      { status: 409 }
    )
  }

  await Promise.all([
    partnerColOf(db, "driverLedger").deleteOne({ _id: new ObjectId(id) }),
    partnerColOf(db, "ledgerSkips").deleteMany({ entryId: id }),
    partnerColOf(db, "ledgerWithdrawals").deleteMany({ entryId: id }),
  ])

  return NextResponse.json({ ok: true })
}
