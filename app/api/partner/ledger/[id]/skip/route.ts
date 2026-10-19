import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { PARTNER } from "@/lib/db/registry.mjs"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

type Ctx = { params: Promise<{ id: string }> }

const MONTH_RE = /^\d{4}-\d{2}$/

/**
 * POST /api/ledger/[id]/skip — {month, reason?, overrideAmount?}
 * upsert record ใน ledger_skips: ไม่มี overrideAmount = งดหักเดือนนั้น (0),
 * overrideAmount > 0 = หักเดือนนั้นเป็นยอดพิเศษแทน monthlyAmount
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })
  const body = await req.json()
  const month = (body.month as string | undefined)?.trim() ?? ""
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }
  let overrideAmount: number | null = null
  if (body.overrideAmount !== undefined && body.overrideAmount !== null) {
    if (typeof body.overrideAmount !== "number" || !(body.overrideAmount > 0)) {
      return NextResponse.json({ error: "overrideAmount must be > 0" }, { status: 400 })
    }
    overrideAmount = Math.round(body.overrideAmount * 100) / 100
  }

  const pdb = await partnerDb()
  const db     = pdb

  const entry = await partnerColOf(db, "driverLedger").findOne({ _id: new ObjectId(id) })
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 })

  // เดือนที่ตัดยอดไปแล้ว skip ไม่มีผล — กันความสับสน
  const paid = await partnerColOf(db, "ledgerPayments").findOne({ entryId: id, month })
  if (paid) {
    return NextResponse.json({ error: `month ${month} already settled — skip has no effect` }, { status: 409 })
  }

  const session = await getPartnerSession()
  const now = new Date().toISOString()

  await partnerColOf(db, "ledgerSkips").updateOne(
    { entryId: id, month },
    {
      $set: {
        entryId: id,
        month,
        reason: (body.reason as string | undefined)?.trim() ?? "",
        overrideAmount,
        by: session?.user?.email ?? "unknown",
        at: now,
      },
    },
    { upsert: true }
  )

  const reason = (body.reason as string | undefined)?.trim() ?? ""
  await logActivity({
    entity: PARTNER.driverLedger,
    entityId: (entry.debtCode as string) ?? "",
    action: overrideAmount && overrideAmount > 0 ? "override" : "skip",
    changes: {
      [month]: { from: null, to: overrideAmount && overrideAmount > 0 ? overrideAmount : "ข้ามงวด" },
      ...(reason ? { เหตุผล: { from: null, to: reason } } : {}),
    },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  return NextResponse.json({ ok: true, entryId: id, month, overrideAmount })
}

/** DELETE /api/ledger/[id]/skip — ลบ skip/override ของเดือน (month จาก body หรือ ?month=) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })

  let month = req.nextUrl.searchParams.get("month")?.trim() ?? ""
  if (!month) {
    try {
      const body = await req.json()
      month = (body?.month as string | undefined)?.trim() ?? ""
    } catch { /* no body */ }
  }
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db     = pdb
  const result = await partnerColOf(db, "ledgerSkips").deleteOne({ entryId: id, month })
  if (result.deletedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
