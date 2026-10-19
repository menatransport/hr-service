import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { QUOTE_COLL, nextQuotationNo, type QuoteStatus } from "@/lib/partner/quotation"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)

/** GET /api/quotations?status=&q= — ลิสต์ใบเสนอ (ทั้งทีมเห็นทุกดีล) */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const status = sp.get("status")?.trim()
  const q = sp.get("q")?.trim()
  const pdb = await partnerDb()
  const db = pdb
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = {}
  if (status) filter.status = status
  // กรองตามขั้นใน pipeline ใหม่ (หน้าเว็บส่งมาเป็นรายการขั้นของด่านนั้น)
  const stages = (sp.get("stages") ?? "").split(",").map((x) => x.trim()).filter(Boolean)
  if (stages.length) filter.stage = { $in: stages }
  if (q) filter.$or = [
    { quotationNo: { $regex: q, $options: "i" } },
    { customerName: { $regex: q, $options: "i" } },
    { licensePlate: { $regex: q, $options: "i" } },
    { salesName: { $regex: q, $options: "i" } },
  ]
  const rows = await partnerColOf(db, "quotations").find(filter).sort({ createdAt: -1 }).limit(300).toArray()
  return NextResponse.json(rows.map((r) => ({ ...r, _id: String(r._id) })))
}

/** POST /api/quotations — สร้างใบเสนอ (salesperson = ผู้ใช้ login) */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const b = await req.json()
  const isLead = (b.status as QuoteStatus) === "lead"
  // lead บันทึกได้โดยยังไม่ต้องเลือกรถ — บังคับเฉพาะชื่อลูกค้า (รถบังคับเมื่อไม่ใช่ lead)
  if (!String(b.customerName ?? "").trim() || (!isLead && !b.licensePlate)) {
    return NextResponse.json({ error: isLead ? "กรุณาระบุชื่อลูกค้า" : "ต้องเลือกรถและลูกค้า" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db = pdb
  const now = new Date().toISOString()
  const email = session.user?.email ?? "unknown"
  const salesName = (typeof b.salesName === "string" && b.salesName.trim()) || session.user?.name || email.split("@")[0]
  const quotationNo = await nextQuotationNo(db)

  const doc = {
    quotationNo,
    status: (b.status as QuoteStatus) ?? "quoted",
    // ดีลใหม่เข้าไปป์ไลน์ทันที: ลีด = ผู้สนใจ, สร้างจากใบเสนอราคา = เสนอราคาแล้ว
    stage: isLead ? "LEAD" : "QUOTED",
    stageEnteredAt: now,
    lastActivityAt: now,
    customerId: b.customerId ? String(b.customerId) : undefined,
    customerName: String(b.customerName).trim(),
    customerPhone: (b.customerPhone ?? "").trim(),
    licensePlate: String(b.licensePlate ?? "").trim(),
    vehicleBrand: (b.vehicleBrand ?? "").trim(),
    vehicleModel: (b.vehicleModel ?? "").trim(),
    truckNumber: (b.truckNumber ?? "").trim(),
    vehiclePhotoUrl: (b.vehiclePhotoUrl ?? "").trim(),
    vehiclePhotos: b.vehiclePhotos && typeof b.vehiclePhotos === "object"
      ? Object.fromEntries(["front", "back", "left", "right", "cabin"].map((k) => [k, typeof b.vehiclePhotos[k] === "string" ? b.vehiclePhotos[k] : ""]))
      : undefined,
    totalSalePrice: n(b.totalSalePrice), downPayment: n(b.downPayment), cashDown: n(b.cashDown),
    savingsUsed: n(b.savingsUsed),
    downInstallmentCount: n(b.downInstallmentCount), downInstallmentAmt: n(b.downInstallmentAmt),
    financeAmount: n(b.financeAmount), financeInstallments: n(b.financeInstallments), monthlyPayment: n(b.monthlyPayment),
    extras: (b.extras ?? "").trim(), note: (b.note ?? "").trim(),
    validUntil: b.validUntil || null,
    // เลือกผู้ขายคนอื่นจากลิสต์ → ไม่ผูกอีเมลผู้สร้าง กันยอดคอมไปรวมผิดคน
    salesEmail: salesName === session.user?.name ? email : "",
    salesName,
    createdAt: now, updatedAt: now,
    timeline: [{ at: now, by: email, action: "สร้างใบเสนอ" }],
  }
  const r = await partnerColOf(db, "quotations").insertOne(doc)
  return NextResponse.json({ ...doc, _id: String(r.insertedId) })
}
