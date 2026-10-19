import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/ledger/[id]/withdraw — รายการถอนของ entry (ใหม่สุดก่อน) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })

  const pdb = await partnerDb()
  const db     = pdb
  const withdrawals = await partnerColOf(db, "ledgerWithdrawals")
    .find({ entryId: id })
    .sort({ at: -1 })
    .toArray()

  return NextResponse.json({ withdrawals: withdrawals.map((w) => ({ ...w, _id: w._id.toString() })) })
}

/**
 * POST /api/ledger/[id]/withdraw — {amount, note?, refMR?}
 * deposit เท่านั้น: บันทึก ledger_withdrawals + เพิ่ม withdrawnAmount
 * guard: ถอนเกิน balance (paidAmount − withdrawnAmount) ไม่ได้
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })
  const body = await req.json()

  const amount = body.amount
  if (typeof amount !== "number" || !(amount > 0)) {
    return NextResponse.json({ error: "amount must be > 0" }, { status: 400 })
  }
  const rounded = Math.round(amount * 100) / 100

  const pdb = await partnerDb()
  const db     = pdb

  const entry = await partnerColOf(db, "driverLedger").findOne({ _id: new ObjectId(id) })
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 })
  if (entry.kind !== "deposit") {
    return NextResponse.json({ error: "withdraw is for deposit entries only" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const session = await getPartnerSession()

  // atomic guard: เพิ่ม withdrawnAmount เฉพาะเมื่อ balance พอ (กัน race ถอนซ้อน)
  const updated = await partnerColOf(db, "driverLedger").findOneAndUpdate(
    {
      _id: new ObjectId(id),
      kind: "deposit",
      $expr: {
        $gte: [
          { $subtract: [{ $ifNull: ["$paidAmount", 0] }, { $add: [{ $ifNull: ["$withdrawnAmount", 0] }, rounded] }] },
          -0.005,
        ],
      },
    },
    { $inc: { withdrawnAmount: rounded }, $set: { updatedAt: now } },
    { returnDocument: "after" }
  )

  if (!updated) {
    const balance = ((entry.paidAmount as number) ?? 0) - ((entry.withdrawnAmount as number) ?? 0)
    return NextResponse.json(
      { error: `amount exceeds balance (${Math.round(balance * 100) / 100})` },
      { status: 400 }
    )
  }

  const withdrawal = {
    entryId: id,
    amount: rounded,
    note: (body.note as string | undefined)?.trim() ?? "",
    refMR: (body.refMR as string | undefined)?.trim() || null,
    by: session?.user?.email ?? "unknown",
    at: now,
  }
  const result = await partnerColOf(db, "ledgerWithdrawals").insertOne(withdrawal)

  await logActivity({
    entity: PARTNER.driverLedger,
    entityId: (entry.debtCode as string) ?? "",
    action: "withdraw",
    changes: {
      ถอนเงินสะสม: { from: null, to: rounded },
      ...(withdrawal.note ? { หมายเหตุ: { from: null, to: withdrawal.note } } : {}),
    },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  const balance = ((updated.paidAmount as number) ?? 0) - ((updated.withdrawnAmount as number) ?? 0)
  return NextResponse.json(
    { ...withdrawal, _id: result.insertedId.toString(), balance: Math.round(balance * 100) / 100 },
    { status: 201 }
  )
}
