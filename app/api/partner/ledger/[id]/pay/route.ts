import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
const MONTH_RE = /^\d{4}-\d{2}$/
const round2 = (n: number) => Math.round(n * 100) / 100

type Ctx = { params: Promise<{ id: string }> }

// GET — ประวัติการจ่ายของ entry นี้ (พร้อมหลักฐาน)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })
  const pdb = await partnerDb()
  const db = pdb
  const rows = await partnerColOf(db, "ledgerPayments")
    .find({ entryId: id })
    .sort({ month: 1 })
    .toArray()
  return NextResponse.json(rows.map((r) => ({ ...r, _id: r._id.toString() })))
}

// POST — บันทึกจ่ายรายงวด (manual) + แนบหลักฐาน
export async function POST(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })

  const body = await req.json() as {
    month?: string
    amount?: number
    evidenceUrl?: string
    note?: string
  }

  const pdb = await partnerDb()
  const db = pdb
  const entry = await partnerColOf(db, "driverLedger").findOne({ _id: new ObjectId(id) })
  if (!entry) return NextResponse.json({ error: "ไม่พบรายการหนี้" }, { status: 404 })

  const month = (body.month ?? "").trim()
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month ต้องเป็น YYYY-MM" }, { status: 400 })

  const amount = typeof body.amount === "number" && body.amount > 0
    ? round2(body.amount)
    : round2((entry.monthlyAmount as number) ?? 0)
  if (!(amount > 0)) return NextResponse.json({ error: "amount ต้องมากกว่า 0" }, { status: 400 })

  // กันจ่ายซ้ำเดือนเดียวกัน
  const dup = await partnerColOf(db, "ledgerPayments").findOne({ entryId: id, month })
  if (dup) return NextResponse.json({ error: `เดือน ${month} บันทึกจ่ายไปแล้ว` }, { status: 409 })

  const session = await getPartnerSession()
  const now = new Date().toISOString()

  await partnerColOf(db, "ledgerPayments").insertOne({
    entryId:      id,
    debtCode:     entry.debtCode,
    contractCode: entry.contractCode ?? null,
    month,
    amount,
    evidenceUrl:  body.evidenceUrl?.trim() || null,
    note:         body.note?.trim() || null,
    payrollRef:   null,                    // จ่ายมือ ไม่ผูกรอบ payroll
    by:           session?.user?.email ?? null,
    at:           now,
  })

  const updated = await partnerColOf(db, "driverLedger").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $inc: { paidAmount: amount }, $set: { updatedAt: now } },
    { returnDocument: "after" }
  )

  // debt ครบยอด → ปิดเป็น paid
  if (updated && updated.kind === "debt" && updated.principal != null &&
      (updated.paidAmount as number) >= (updated.principal as number) - 0.005) {
    await partnerColOf(db, "driverLedger").updateOne(
      { _id: new ObjectId(id), status: "active" },
      { $set: { status: "paid", updatedAt: now } }
    )
  }

  await logActivity({
    entity: PARTNER.driverLedger,
    entityId: entry.debtCode as string,
    action: "pay",
    changes: {
      month:  { from: null, to: month },
      amount: { from: null, to: amount },
      ...(body.evidenceUrl ? { evidence: { from: null, to: "แนบหลักฐาน" } } : {}),
    },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  return NextResponse.json({ ok: true, paidAmount: updated?.paidAmount ?? null })
}

// DELETE — ยกเลิกการจ่ายของเดือน (คืนยอด)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })
  const { month } = await req.json() as { month?: string }
  if (!month || !MONTH_RE.test(month)) return NextResponse.json({ error: "month ต้องเป็น YYYY-MM" }, { status: 400 })

  const pdb = await partnerDb()
  const db = pdb
  const pay = await partnerColOf(db, "ledgerPayments").findOne({ entryId: id, month })
  if (!pay) return NextResponse.json({ error: "ไม่พบรายการจ่ายเดือนนี้" }, { status: 404 })
  if (pay.payrollRef) return NextResponse.json({ error: "รายการนี้ตัดจากรอบเงินเดือน ยกเลิกที่นี่ไม่ได้" }, { status: 400 })

  const now = new Date().toISOString()
  await partnerColOf(db, "ledgerPayments").deleteOne({ _id: pay._id })
  await partnerColOf(db, "driverLedger").updateOne(
    { _id: new ObjectId(id) },
    { $inc: { paidAmount: -(pay.amount as number) }, $set: { status: "active", updatedAt: now } }
  )
  return NextResponse.json({ ok: true })
}
