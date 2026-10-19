import { NextRequest, NextResponse } from "next/server"
import { parseLead, allowRequest } from "@/lib/partner/public-lead"
import { loadPublicTruckBySlug } from "@/lib/partner/public-trucks"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

/** ฟอร์มจากหน้าเว็บสาธารณะ → quotations status "lead" (โผล่ใน Kanban /quotations) */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!allowRequest(ip)) {
    return NextResponse.json({ error: "ส่งคำขอถี่เกินไป กรุณาลองใหม่ภายหลัง" }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = parseLead(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const lead = parsed.data

  // แนบข้อมูลรถจากฝั่ง server เท่านั้น (ห้ามเชื่อราคาที่ client ส่งมา)
  const truck = lead.slug ? await loadPublicTruckBySlug(lead.slug) : null
  const now = new Date().toISOString()
  const db = (await partnerDb())

  await partnerColOf(db, "quotations").insertOne({
    quotationNo: "",                       // ยังไม่ออกเลขใบเสนอ — ออกตอนทีมขายแปลงเป็นใบจริง
    status: "lead",
    source: "public-listing",
    publicSlug: lead.slug,
    customerName: lead.name,
    customerPhone: lead.phone,
    vehicleBrand: truck?.brand ?? "",
    vehicleModel: truck?.model ?? "",
    truckNumber: truck?.truckNumber ?? "",
    vehiclePhotoUrl: truck?.photoUrl ?? "",
    totalSalePrice: truck?.totalSalePrice ?? 0,
    downPayment: truck?.downPayment ?? 0,
    monthlyPayment: truck?.monthlyPayment ?? 0,
    financeInstallments: truck?.financeInstallments ?? 0,
    cashDown: lead.budgetDown,
    note: lead.message,
    salesEmail: "", salesName: "",
    createdAt: now, updatedAt: now,
    timeline: [{ at: now, by: "public-listing", action: "ลูกค้ากรอกฟอร์มจากหน้าเว็บ" }],
  })

  return NextResponse.json({ ok: true })
}
