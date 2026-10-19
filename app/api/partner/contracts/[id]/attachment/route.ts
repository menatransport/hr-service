import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

// เฉพาะ field ไฟล์แนบ 5 ชนิด — จัดการได้ทุก user ที่ login (ไม่ใช่แก้ข้อมูลสัญญา)
const ATTACH_FIELDS: Record<string, string> = {
  saleContractUrl:      "สัญญาซื้อขาย",
  promotionDocUrl:      "เอกสารแนบท้าย",
  hireContractUrl:      "สัญญาว่าจ้าง",
  guaranteeContractUrl: "สัญญาค้ำประกัน",
  creditorDocUrl:       "เปิดเจ้าหนี้",
}

/** GET /api/contracts/[id]/attachment — ประวัติการแนบ/ลบ ไฟล์ (ใคร/เมื่อไหร่) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb = await partnerDb()
  const db = pdb
  const contract = await partnerColOf(db, "contracts").findOne(
    { _id: new ObjectId(id) }, { projection: { contractCode: 1 } },
  )
  if (!contract) return NextResponse.json({ error: "not found" }, { status: 404 })

  const logs = await partnerColOf(db, "activityLog")
    .find({ entity: "contract_attachment", entityId: contract.contractCode as string })
    .sort({ editedAt: -1 })
    .limit(100)
    .toArray()
  return NextResponse.json({ history: logs })
}

/** PATCH /api/contracts/[id]/attachment — แนบ/ลบ ไฟล์เอกสาร (url = "" คือลบ) + บันทึก audit */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("contracts")
  if (perm instanceof Response) return perm

  const { id } = await params
  const body = await req.json() as { field?: string; url?: string }
  const field = body.field ?? ""
  const label = ATTACH_FIELDS[field]
  if (!label) {
    return NextResponse.json({ error: "invalid attachment field" }, { status: 400 })
  }
  const url = typeof body.url === "string" ? body.url.trim() : ""

  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "contracts")

  // สัญญาที่ถูกล็อค — ห้ามแนบ/ลบไฟล์จนกว่าจะปลดล็อค
  const existing = await col.findOne({ _id: new ObjectId(id) }, { projection: { locked: 1 } })
  if (existing?.locked) {
    return NextResponse.json({ error: "สัญญาถูกล็อค — ปลดล็อคก่อนจึงจะแก้ไฟล์แนบได้" }, { status: 423 })
  }

  const before = await col.findOne(
    { _id: new ObjectId(id) }, { projection: { contractCode: 1, [field]: 1 } },
  )
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 })
  const prevUrl = (before[field] as string) ?? ""

  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { [field]: url, updatedAt: new Date().toISOString() } },
  )

  // audit: บันทึกว่าใคร แนบ/ลบ อะไร เมื่อไหร่ (ลบ = url ว่าง)
  if (prevUrl !== url) {
    const session = await getPartnerSession()
    await logActivity({
      entity:   "contract_attachment",
      entityId: (before.contractCode as string) ?? id,
      action:   url ? "attach" : "remove",
      changes:  { [field]: { from: prevUrl || null, to: url || null } },
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }

  return NextResponse.json({ ok: true })
}
