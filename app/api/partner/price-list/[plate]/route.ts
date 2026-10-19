import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { resolveRole } from "@/lib/partner/roles"
import { hasPerm } from "@/lib/partner/rbac"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

const NUM_FIELDS = [
  "totalSalePrice", "downPayment", "cashDown", "remainingInstallment",
  "downInstallmentCount", "downInstallmentAmt", "financeAmount",
  "financeInstallments", "monthlyPayment",
] as const

type Ctx = { params: Promise<{ plate: string }> }

/** PUT /api/price-list/[plate] — แก้ตัวเลขราคาขาย + บันทึกประวัติ (activity_log → drawer ประวัติราคา) */
export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("masterdata")
  if (perm instanceof Response) return perm

  const session = await getPartnerSession()
  const role = await resolveRole(session?.user?.email)
  if (!hasPerm(role, "masterdata"))
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ราคาขาย" }, { status: 403 })

  const { plate: raw } = await params
  const plate = decodeURIComponent(raw).trim()
  const body = await req.json() as Record<string, unknown>

  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "masterPriceList")

  const before = await col.findOne({ licensePlate: plate })
  if (!before) return NextResponse.json({ error: "ไม่พบทะเบียนนี้ใน price list" }, { status: 404 })

  const next: Record<string, unknown> = {}
  for (const k of NUM_FIELDS) {
    if (k in body) {
      const v = body[k]
      next[k] = v === null || v === undefined || v === "" ? null : Number(v)
    }
  }
  if (Object.keys(next).length === 0)
    return NextResponse.json({ error: "no fields to update" }, { status: 400 })

  await col.updateOne(
    { licensePlate: plate },
    { $set: { ...next, updatedAt: new Date().toISOString() } },
  )

  const changes = diffFields(before, next, Object.keys(next))
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "price_list",
      entityId: plate,
      action: "update",
      changes,
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }

  revalidatePublicTrucks()   // ราคาเปลี่ยน = ตัวเลขบนหน้าเว็บเปลี่ยน
  return NextResponse.json({ ok: true })
}
