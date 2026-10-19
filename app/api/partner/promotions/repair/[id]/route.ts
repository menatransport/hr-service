import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

// ยืนยัน/ยกเลิกการตัดงบของ claim (กติกา: ทีมต้องระบุก่อน งบถึงถูกตัด)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("promotions")
  if (perm instanceof Response) return perm

  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const body = await req.json()
  if (typeof body.confirmed !== "boolean") {
    return NextResponse.json({ error: "confirmed (boolean) required" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  const before = await partnerColOf(db, "repairClaims").findOne({ _id: oid })
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 })

  // ยืนยัน = เปลี่ยน reserve → actual (ตัดงบถาวร): เคลียร์ flag reserve ด้วย
  await partnerColOf(db, "repairClaims").updateOne(
    { _id: oid },
    { $set: { confirmed: body.confirmed, reserve: false, confirmedAt: body.confirmed ? new Date() : null } }
  )

  // audit: ใครยืนยันตัดงบซ่อม (ถาวร) เมื่อไหร่
  if (body.confirmed) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "promotion",
      entityId: (before.contractCode as string) ?? "",
      action: "confirm_repair",
      changes: {
        ยืนยันตัดงบ: { from: before.reserve ? "reserve" : "รอยืนยัน", to: "actual (ตัดงบถาวร)" },
        ยอด: { from: null, to: before.amount ?? 0 },
        MR: { from: null, to: (before.mr as string) || (before.description as string) || "-" },
      },
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  const result = await partnerColOf(db, "repairClaims").deleteOne({ _id: oid })
  if (result.deletedCount === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
