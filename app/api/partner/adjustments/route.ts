import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { calculatePayrollEntry } from "@/lib/partner/payroll-engine"

const DB = PARTNER_DB

/** GET /api/adjustments?month=YYYY-MM — list all adjustments for a month */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 })

  const client = await clientPromise
  const db     = client.db(DB)
  const docs   = await db.collection("monthly_adjustments")
    .find({ month })
    .sort({ contractCode: 1 })
    .toArray()

  return NextResponse.json(docs)
}

/** PUT /api/adjustments — upsert one adjustment, then recalculate payroll for that driver */
export async function PUT(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session || !hasPerm(session.user?.role, "finance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const { contractCode, month, ...fields } = body as {
    contractCode: string
    month: string
    otherIncomeWHT?: number
    otherIncomeNoWHT?: number
    otherDeductWHT?: number
    otherDeductNoWHT?: number
    note?: string
  }

  if (!contractCode || !month) {
    return NextResponse.json({ error: "contractCode and month required" }, { status: 400 })
  }
  {
    const client = await clientPromise
    if (await monthClosed(client.db(DB), month)) return NextResponse.json(closedError(month), { status: 423 })
  }

  const client = await clientPromise
  const db     = client.db(DB)
  const now    = new Date().toISOString()

  await db.collection("monthly_adjustments").updateOne(
    { contractCode, month },
    { $set: { contractCode, month, ...fields, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  )

  // Recalculate payroll immediately after saving adjustment
  const result = await calculatePayrollEntry(db, contractCode, month)
  if (result) {
    await db.collection("payroll_entries").updateOne(
      { contractCode, month },
      { $set: { ...result, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    )
  }

  return NextResponse.json({ ok: true, netPay: result?.netPay ?? null })
}
