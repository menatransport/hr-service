import { NextRequest, NextResponse } from "next/server"
import { computePayroll } from "@/lib/partner/utils"
import type { PayrollEntry } from "@/lib/partner/types"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 })

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "payrollEntries")
  const items  = await col.find({ month }).sort({ contractCode: 1 }).toArray()
  return NextResponse.json(items)
}

/** DELETE /api/payroll?month=YYYY-MM — admin batch-delete all entries for a month */
export async function DELETE(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "payrollEntries")
  const result = await col.deleteMany({ month })
  return NextResponse.json({ deleted: result.deletedCount })
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body: PayrollEntry = await req.json()
  if (!body.contractCode || !body.month) {
    return NextResponse.json({ error: "contractCode and month required" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "payrollEntries")

  const existing = await col.findOne({ contractCode: body.contractCode, month: body.month })
  if (existing) return NextResponse.json({ error: "Entry already exists for this driver/month" }, { status: 409 })

  const computed = computePayroll(body)
  const now      = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, ...bodyWithoutId } = body
  const doc      = { ...bodyWithoutId, ...computed, createdAt: now, updatedAt: now }

  const result = await col.insertOne(doc)
  return NextResponse.json({ _id: result.insertedId, ...doc }, { status: 201 })
}
