import { NextRequest, NextResponse } from "next/server"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { computePayroll } from "@/lib/partner/utils"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ month: string; contractCode: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { month, contractCode } = await params
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "payrollEntries")
  const item   = await col.findOne({ month, contractCode })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { month, contractCode } = await params
  const body   = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, ...update } = body
  const computed = computePayroll(update)
  const now    = new Date().toISOString()

  const pdb = await partnerDb()
  if (await monthClosed(pdb, month)) return NextResponse.json(closedError(month), { status: 423 })
  const col    = partnerColOf(pdb, "payrollEntries")

  const result = await col.findOneAndUpdate(
    { month, contractCode },
    { $set: { ...update, ...computed, updatedAt: now } },
    { returnDocument: "after", upsert: true }
  )
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { month, contractCode } = await params
  const pdb = await partnerDb()
  if (await monthClosed(pdb, month)) return NextResponse.json(closedError(month), { status: 423 })
  const col    = partnerColOf(pdb, "payrollEntries")
  const result = await col.deleteOne({ month, contractCode })
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
