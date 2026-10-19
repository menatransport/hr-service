import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { CUSTOMER_COLL } from "@/lib/partner/quotation"

const DB = PARTNER_DB

/** GET /api/customers?q= — ค้นหา/ลิสต์ลูกค้า (ทีมเห็นทั้งหมด) */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const client = await clientPromise
  const db = client.db(DB)
  const filter = q
    ? { $or: [
        { name: { $regex: q, $options: "i" } },
        { phone: { $regex: q, $options: "i" } },
        { lineId: { $regex: q, $options: "i" } },
      ] }
    : {}
  const rows = await db.collection(CUSTOMER_COLL).find(filter).sort({ updatedAt: -1 }).limit(100).toArray()
  return NextResponse.json(rows.map((r) => ({ ...r, _id: String(r._id) })))
}

/** POST /api/customers — สร้างลูกค้าใหม่ */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json() as {
    name?: string; phone?: string; lineId?: string; address?: string; nationalId?: string; source?: string; note?: string
  }
  const name = (body.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "ต้องมีชื่อลูกค้า" }, { status: 400 })

  const client = await clientPromise
  const db = client.db(DB)
  const now = new Date().toISOString()
  const doc = {
    name, phone: (body.phone ?? "").trim(), lineId: (body.lineId ?? "").trim(),
    address: (body.address ?? "").trim(), nationalId: (body.nationalId ?? "").trim(),
    source: (body.source ?? "").trim(), note: (body.note ?? "").trim(),
    createdBy: session.user?.email ?? "unknown", createdAt: now, updatedAt: now,
  }
  const r = await db.collection(CUSTOMER_COLL).insertOne(doc)
  return NextResponse.json({ ...doc, _id: String(r.insertedId) })
}
