import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { LOSS_COLL, listLossReasons, seedLossReasons } from "@/lib/partner/loss-reason"
import { ObjectId } from "mongodb"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

/** master เหตุผลที่ดีลหลุด — ทุกคนที่ล็อกอินอ่านได้ แก้ได้เฉพาะ admin */
export async function GET() {
  const db = (await partnerDb())
  await seedLossReasons(db)          // ครั้งแรกเติมชุดตั้งต้นให้เอง
  return NextResponse.json(await listLossReasons(db))
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const session = await getPartnerSession()
  if (!["admin", "superadmin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "ต้องเป็นผู้ดูแลระบบ" }, { status: 403 })
  }
  const b = await req.json().catch(() => null)
  if (!b?.label?.trim() || !Array.isArray(b.applicableStages) || b.applicableStages.length === 0) {
    return NextResponse.json({ error: "ต้องมีข้อความเหตุผลและขั้นที่ใช้ได้" }, { status: 400 })
  }
  const db = (await partnerDb())
  const doc = {
    code: String(b.code ?? `CUSTOM_${Date.now()}`),
    label: String(b.label).trim(),
    group: String(b.group ?? "อื่น ๆ").trim(),
    applicableStages: b.applicableStages.map(String),
    isActive: b.isActive !== false,
  }
  const r = await partnerColOf(db, "lossReasons").insertOne(doc)
  return NextResponse.json({ ...doc, _id: String(r.insertedId) })
}

/** PATCH — เปิด/ปิดการใช้งาน หรือแก้ข้อความ (ของระบบแก้ข้อความได้ แต่ปิดไม่ได้) */
export async function PATCH(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const session = await getPartnerSession()
  if (!["admin", "superadmin"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "ต้องเป็นผู้ดูแลระบบ" }, { status: 403 })
  }
  const b = await req.json().catch(() => null)
  if (!b?._id || !ObjectId.isValid(b._id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 400 })

  const db = (await partnerDb())
  const current = await partnerColOf(db, "lossReasons").findOne({ _id: new ObjectId(b._id) })
  if (!current) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 })
  if (current.isSystem && b.isActive === false) {
    return NextResponse.json({ error: "เหตุผลของระบบปิดใช้งานไม่ได้" }, { status: 400 })
  }

  const $set: Record<string, unknown> = {}
  if (b.label !== undefined) $set.label = String(b.label).trim()
  if (b.group !== undefined) $set.group = String(b.group).trim()
  if (b.isActive !== undefined) $set.isActive = !!b.isActive
  if (Array.isArray(b.applicableStages)) $set.applicableStages = b.applicableStages.map(String)
  await partnerColOf(db, "lossReasons").updateOne({ _id: new ObjectId(b._id) }, { $set })
  return NextResponse.json({ ok: true })
}
