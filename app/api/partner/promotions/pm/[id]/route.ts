import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

// ยืนยัน/ยกเลิกการตัดเพดาน PM (กติกา: ทีมต้องระบุก่อน เพดานถึงถูกตัด)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const before = await partnerColOf(db, "pmRecords").findOne({ _id: oid })
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 })

  await partnerColOf(db, "pmRecords").updateOne(
    { _id: oid },
    { $set: { confirmed: body.confirmed, confirmedAt: body.confirmed ? new Date() : null } }
  )

  // audit: ใครยืนยันตัดเพดาน PM (ถาวร) เมื่อไหร่
  if (body.confirmed) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "promotion",
      entityId: (before.contractCode as string) ?? "",
      action: "confirm_pm",
      changes: {
        ยืนยันตัดเพดาน: { from: "รอยืนยัน", to: "actual (ตัดถาวร)" },
        ประเภท: { from: null, to: (before.type as string) ?? "" },
        ยอด: { from: null, to: before.amount ?? 0 },
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
  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  const result = await partnerColOf(db, "pmRecords").deleteOne({ _id: oid })
  if (result.deletedCount === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
