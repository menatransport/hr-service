import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { calculatePayrollEntry } from "@/lib/partner/payroll-engine"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

/** GET /api/adjustments?month=YYYY-MM — list all adjustments for a month */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 })

  const pdb = await partnerDb()
  const db     = pdb
  const docs   = await partnerColOf(db, "monthlyAdjustments")
    .find({ month })
    .sort({ contractCode: 1 })
    .toArray()

  return NextResponse.json(docs)
}

/** PUT /api/adjustments — upsert one adjustment, then recalculate payroll for that driver */
export async function PUT(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

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
    const pdb = await partnerDb()
    if (await monthClosed(pdb, month)) return NextResponse.json(closedError(month), { status: 423 })
  }

  const pdb = await partnerDb()
  const db     = pdb
  const now    = new Date().toISOString()

  await partnerColOf(db, "monthlyAdjustments").updateOne(
    { contractCode, month },
    { $set: { contractCode, month, ...fields, updatedAt: now }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  )

  // Recalculate payroll immediately after saving adjustment
  const result = await calculatePayrollEntry(db, contractCode, month)
  if (result) {
    await partnerColOf(db, "payrollEntries").updateOne(
      { contractCode, month },
      { $set: { ...result, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    )
  }

  return NextResponse.json({ ok: true, netPay: result?.netPay ?? null })
}
