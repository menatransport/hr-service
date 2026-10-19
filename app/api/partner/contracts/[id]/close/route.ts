import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { hasPerm } from "@/lib/partner/rbac"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

type Ctx = { params: Promise<{ id: string }> }

const LABEL: Record<string, string> = { active: "ใช้งาน", completed: "สิ้นสุด (ปิดงวดแล้ว)", terminated: "ยกเลิก" }

/**
 * ปิดงวดเอง (ผ่อนครบ) / เปิดใหม่ — contracts.status active ⇄ completed
 * body { reopen?: boolean }  · สิทธิ์ contracts (admin/fleet/finance)
 * ผล: คนขับของสัญญานี้ขึ้นแท็บ "Active (ปิดงวดแล้ว)" ทันที (lib/driver-state ข้อ 1)
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })

  const session = await getPartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!hasPerm(role, "contracts")) return NextResponse.json({ error: "ไม่มีสิทธิ์ปิดงวดสัญญา" }, { status: 403 })

  const { reopen } = (await req.json().catch(() => ({}))) as { reopen?: boolean }
  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "contracts")
  const doc = await col.findOne({ _id: new ObjectId(id) })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const from = String(doc.status ?? "active")
  const to   = reopen ? "active" : "completed"
  if (from === to) return NextResponse.json({ error: `สัญญาอยู่ในสถานะ "${LABEL[to]}" อยู่แล้ว` }, { status: 409 })
  if (!reopen && from !== "active") return NextResponse.json({ error: `ปิดงวดได้เฉพาะสัญญาที่ใช้งานอยู่ (ตอนนี้: ${LABEL[from] ?? from})` }, { status: 409 })

  const now = new Date().toISOString()
  await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: to, updatedAt: now, ...(reopen ? { completedAt: null, completedBy: null } : { completedAt: now, completedBy: session?.user?.email ?? "unknown" }) } },
  )
  await logActivity({
    entity: "contract",
    entityId: doc.contractCode as string,
    action: reopen ? "reopen" : "close",
    changes: { สถานะ: { from: LABEL[from] ?? from, to: LABEL[to] } },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })
  revalidatePublicTrucks()   // ปิดงวด/เปิดสัญญาใหม่ = ชุดรถว่างเปลี่ยน
  return NextResponse.json({ ok: true, status: to })
}
