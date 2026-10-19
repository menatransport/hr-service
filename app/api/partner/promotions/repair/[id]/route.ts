import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { logActivity } from "@/lib/partner/activity-log"

const DB = PARTNER_DB

// ยืนยัน/ยกเลิกการตัดงบของ claim (กติกา: ทีมต้องระบุก่อน งบถึงถูกตัด)
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
  const client = await clientPromise
  const db = client.db(DB)
  const before = await db.collection("repair_claims").findOne({ _id: oid })
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 })

  // ยืนยัน = เปลี่ยน reserve → actual (ตัดงบถาวร): เคลียร์ flag reserve ด้วย
  await db.collection("repair_claims").updateOne(
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
  const { id } = await params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const client = await clientPromise
  const db = client.db(DB)
  const result = await db.collection("repair_claims").deleteOne({ _id: oid })
  if (result.deletedCount === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
