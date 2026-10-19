import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { logActivity } from "@/lib/partner/activity-log"
import { hasPerm } from "@/lib/partner/rbac"

const DB = PARTNER_DB

type Ctx = { params: Promise<{ id: string }> }

/** ล็อค/ปลดล็อคสัญญา — admin ขึ้นไปเท่านั้น · ล็อคแล้วห้ามแก้ทุกคนจนกว่าจะปลด */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })

  const session = await getPartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!hasPerm(role, "lock")) {
    return NextResponse.json({ error: "ล็อค/ปลดล็อคได้เฉพาะแอดมิน" }, { status: 403 })
  }

  const { locked } = await req.json() as { locked?: boolean }
  const client = await clientPromise
  const col = client.db(DB).collection("contracts")
  const doc = await col.findOne({ _id: new ObjectId(id) })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const now = new Date().toISOString()
  const value = locked === true ? { by: session?.user?.email ?? "admin", at: now } : null
  await col.updateOne({ _id: new ObjectId(id) }, { $set: { locked: value, updatedAt: now } })

  await logActivity({
    entity: "contract",
    entityId: doc.contractCode as string,
    action: locked ? "lock" : "unlock",
    changes: { ล็อค: { from: doc.locked ? "ล็อคอยู่" : "ไม่ล็อค", to: locked ? "ล็อคอยู่" : "ไม่ล็อค" } },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  return NextResponse.json({ ok: true, locked: value })
}
