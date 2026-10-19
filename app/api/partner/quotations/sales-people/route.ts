import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { resolveRole } from "@/lib/partner/roles"
import { hasPerm, isAdminRole } from "@/lib/partner/rbac"
import { SALES_PEOPLE } from "@/lib/partner/quotation-people"
import { QUOTE_COLL } from "@/lib/partner/quotation"

const DB = PARTNER_DB
const COLL = "sales_people"

/** รวมชื่อตั้งต้นในโค้ด + ชื่อที่ทีมเพิ่มเองผ่านหน้าจอ (ไม่ซ้ำ) */
async function listNames(): Promise<string[]> {
  const client = await clientPromise
  const rows = await client.db(DB).collection(COLL).find({}).project({ name: 1, _id: 0 }).toArray()
  const added = rows.map((r) => String(r.name ?? "").trim()).filter(Boolean)
  const seen = new Set<string>()
  return [...SALES_PEOPLE, ...added].filter((n) => {
    const k = n.trim().toLowerCase()
    if (!n.trim() || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Master รายคน — ชื่อที่ยังไม่มีใน DB (ค่าตั้งต้นในโค้ด) คืนเป็นแถว _id ว่าง แก้ไม่ได้จนกว่าจะ seed */
async function listPeople() {
  const client = await clientPromise
  const db = client.db(DB)
  const rows = await db.collection(COLL).find({}).sort({ name: 1 }).toArray()
  const inDb = new Set(rows.map((r) => String(r.name ?? "").trim().toLowerCase()))
  // นับใบเสนอราคาต่อชื่อ — ใช้เตือนตอนแก้ชื่อ/ลบ
  const counts = await db.collection(QUOTE_COLL).aggregate([
    { $group: { _id: "$salesName", n: { $sum: 1 } } },
  ]).toArray()
  const quoteCount = new Map(counts.map((c) => [String(c._id ?? "").trim().toLowerCase(), c.n as number]))
  const countOf = (name: string) => quoteCount.get(name.trim().toLowerCase()) ?? 0

  const fromDb = rows.map((r) => ({
    _id: String(r._id),
    name: String(r.name ?? ""),
    email: String(r.email ?? ""),
    phone: String(r.phone ?? ""),
    quotations: countOf(String(r.name ?? "")),
    seeded: false,
  }))
  const fromCode = SALES_PEOPLE
    .filter((n) => !inDb.has(n.trim().toLowerCase()))
    .map((n) => ({ _id: "", name: n, email: "", phone: "", quotations: countOf(n), seeded: true }))
  return [...fromDb, ...fromCode].sort((a, b) => a.name.localeCompare(b.name, "th"))
}

async function adminOnly() {
  const session = await getPartnerSession()
  const email = (session?.user?.email ?? "").trim().toLowerCase()
  const role = await resolveRole(email)
  return isAdminRole(role) ? { email } : null
}

/** GET /api/quotations/sales-people — รายชื่อให้ dropdown · ?full=1 = master เต็ม (admin) */
export async function GET(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (req.nextUrl.searchParams.get("full") === "1") {
    if (!await adminOnly()) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 })
    return NextResponse.json(await listPeople())
  }
  return NextResponse.json(await listNames())
}

/** POST — เพิ่มผู้ขายใหม่ (สิทธิ์ sales ขึ้นไป เพิ่มได้จาก dropdown ตอนออกใบเสนอราคา) */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  const email = (session?.user?.email ?? "").trim().toLowerCase()
  const role = await resolveRole(email)
  if (!hasPerm(role, "sales")) return NextResponse.json({ error: "ไม่มีสิทธิ์เพิ่มชื่อผู้ขาย" }, { status: 403 })

  const body = await req.json()
  const name = String(body?.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อผู้ขาย" }, { status: 400 })
  if (name.length > 60) return NextResponse.json({ error: "ชื่อยาวเกินไป" }, { status: 400 })

  const existing = await listNames()
  const dup = existing.find((n) => n.toLowerCase() === name.toLowerCase())
  if (dup) return NextResponse.json({ error: `มีชื่อ "${dup}" อยู่แล้ว`, names: existing }, { status: 409 })

  const client = await clientPromise
  await client.db(DB).collection(COLL).insertOne({
    name,
    email: String(body?.email ?? "").trim(),
    phone: String(body?.phone ?? "").trim(),
    createdAt: new Date().toISOString(),
    createdBy: email,
  })
  return NextResponse.json({ ok: true, name, names: await listNames() }, { status: 201 })
}

/** PATCH — แก้ชื่อ/email/เบอร์ (admin) · เปลี่ยนชื่อจะ rename salesName ในใบเสนอราคาเดิมตามไปด้วย
 *  เพราะยอดคอมจับกลุ่มด้วยชื่อ (lib/commission.ts) ไม่ตามไปด้วยยอดจะแตกเป็นสองก้อน */
export async function PATCH(req: NextRequest) {
  const admin = await adminOnly()
  if (!admin) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 })

  const body = await req.json()
  const id = String(body?._id ?? "")
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 })

  const client = await clientPromise
  const db = client.db(DB)
  const cur = await db.collection(COLL).findOne({ _id: new ObjectId(id) })
  if (!cur) return NextResponse.json({ error: "ไม่พบผู้ขายรายนี้" }, { status: 404 })

  const oldName = String(cur.name ?? "").trim()
  const name = body?.name !== undefined ? String(body.name).trim() : oldName
  if (!name) return NextResponse.json({ error: "กรุณาระบุชื่อผู้ขาย" }, { status: 400 })
  if (name.length > 60) return NextResponse.json({ error: "ชื่อยาวเกินไป" }, { status: 400 })

  if (name.toLowerCase() !== oldName.toLowerCase()) {
    const clash = (await listNames()).find((n) => n.toLowerCase() === name.toLowerCase())
    if (clash) return NextResponse.json({ error: `มีชื่อ "${clash}" อยู่แล้ว` }, { status: 409 })
  }

  const $set: Record<string, unknown> = { name, updatedAt: new Date().toISOString(), updatedBy: admin.email }
  if (body?.email !== undefined) $set.email = String(body.email).trim()
  if (body?.phone !== undefined) $set.phone = String(body.phone).trim()
  await db.collection(COLL).updateOne({ _id: new ObjectId(id) }, { $set })

  // ชื่อเปลี่ยน → ตามไปแก้ salesName ในใบเสนอราคาเดิม ยอดคอมจะได้ไม่แตก
  let renamed = 0
  if (name !== oldName && oldName) {
    const r = await db.collection(QUOTE_COLL).updateMany({ salesName: oldName }, { $set: { salesName: name } })
    renamed = r.modifiedCount
  }
  return NextResponse.json({ ok: true, renamed, names: await listNames() })
}

/** DELETE — ลบผู้ขายออกจาก master (admin) · กันลบคนที่ยังมีใบเสนอราคาผูกอยู่ */
export async function DELETE(req: NextRequest) {
  const admin = await adminOnly()
  if (!admin) return NextResponse.json({ error: "เฉพาะแอดมิน" }, { status: 403 })

  const id = String((await req.json())?._id ?? "")
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 })

  const client = await clientPromise
  const db = client.db(DB)
  const cur = await db.collection(COLL).findOne({ _id: new ObjectId(id) })
  if (!cur) return NextResponse.json({ error: "ไม่พบผู้ขายรายนี้" }, { status: 404 })

  const used = await db.collection(QUOTE_COLL).countDocuments({ salesName: String(cur.name ?? "") })
  if (used > 0) {
    return NextResponse.json({ error: `ลบไม่ได้ — มีใบเสนอราคาผูกกับชื่อนี้อยู่ ${used} ใบ` }, { status: 409 })
  }
  await db.collection(COLL).deleteOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ok: true, names: await listNames() })
}
