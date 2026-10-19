import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { QUOTE_COLL, QUOTE_STATUSES, QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/partner/quotation"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 })
  const pdb = await partnerDb()
  const doc = await partnerColOf(pdb, "quotations").findOne({ _id: new ObjectId(id) })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ...doc, _id: String(doc._id) })
}

/** PATCH — เปลี่ยนสถานะ pipeline / เงินจอง / แก้ราคา (บันทึก timeline) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("sales")
  if (perm instanceof Response) return perm

  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 })
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json()
  const email = session.user?.email ?? "unknown"
  const now = new Date().toISOString()

  // lastActivityAt ด้วย ไม่งั้นแก้ดีลจากการ์ดการเงิน/ราคา แล้วยังถูกนับว่าเงียบจนโดนปิดอัตโนมัติ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const $set: any = { updatedAt: now, lastActivityAt: now }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = []

  if (b.status !== undefined) {
    if (!QUOTE_STATUSES.includes(b.status)) return NextResponse.json({ error: "bad status" }, { status: 400 })
    $set.status = b.status
    events.push({ at: now, by: email, action: `เปลี่ยนสถานะ → ${QUOTE_STATUS_LABEL[b.status as QuoteStatus]}`, ...(b.note ? { note: b.note } : {}) })
  }
  for (const k of ["depositAmount", "totalSalePrice", "downPayment", "cashDown", "savingsUsed", "downInstallmentCount", "downInstallmentAmt", "financeAmount", "financeInstallments", "monthlyPayment"]) {
    if (b[k] !== undefined) $set[k] = Number(b[k]) || 0
  }
  // เปลี่ยนผู้ขาย: ยอดคอมจับกลุ่มด้วยชื่อ จึงล้าง salesEmail ของผู้สร้างออก กันไปรวมกับยอดคนอื่น
  if (b.salesName !== undefined) {
    $set.salesEmail = b.salesName === session.user?.name ? (session.user?.email ?? "") : ""
    events.push({ at: now, by: email, action: `เปลี่ยนผู้ขาย → ${b.salesName}` })
  }
  // แก้ชื่อลูกค้า (สะกดผิด) — เก็บร่องรอยไว้ใน timeline
  if (b.customerName !== undefined) {
    events.push({ at: now, by: email, action: `แก้ชื่อลูกค้า → ${String(b.customerName)}` })
  }
  for (const k of ["depositSlipUrl", "depositPaidAt", "extras", "note", "validUntil", "customerName", "customerPhone",
                   "licensePlate", "vehicleBrand", "vehicleModel", "truckNumber", "vehiclePhotoUrl", "salesName"]) {
    if (b[k] !== undefined) $set[k] = b[k]
  }
  if (b.depositSlips !== undefined && Array.isArray(b.depositSlips)) $set.depositSlips = b.depositSlips.slice(0, 10)
  if (b.vehiclePhotos !== undefined && typeof b.vehiclePhotos === "object" && b.vehiclePhotos) {
    const P = b.vehiclePhotos as Record<string, unknown>
    $set.vehiclePhotos = Object.fromEntries(["front", "back", "left", "right", "cabin"].map((k) => [k, typeof P[k] === "string" ? P[k] : ""]))
  }
  // เงินจองก้อนเดียว สองชื่อ — กติกาขยับขั้นอ่าน reservationAmount จึงต้องเขียนคู่กันเสมอ
  if (b.depositAmount !== undefined) {
    $set.reservationAmount = Number(b.depositAmount) || 0
    events.push({ at: now, by: email, action: `บันทึกเงินจอง ${Number(b.depositAmount).toLocaleString()} บาท` })
  }
  if (b.note && b.status === undefined && b.depositAmount === undefined) events.push({ at: now, by: email, action: "บันทึกกิจกรรม", note: b.note })

  const pdb = await partnerDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { $set }
  if (events.length) update.$push = { timeline: { $each: events } }
  await partnerColOf(pdb, "quotations").updateOne({ _id: new ObjectId(id) }, update)
  const doc = await partnerColOf(pdb, "quotations").findOne({ _id: new ObjectId(id) })
  return NextResponse.json({ ...doc, _id: String(doc?._id) })
}
