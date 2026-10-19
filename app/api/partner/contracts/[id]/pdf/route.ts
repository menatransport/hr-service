import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import type { Contract } from "@/lib/partner/types"
import { normPlate, type PromoMasterData } from "@/lib/partner/contract-docx"
import { renderPdfmake } from "@/lib/partner/pdfmake-printer"
import { PDFMAKE_DOCS, PDF_FILENAME, type PdfmakeType } from "@/lib/partner/contract-pdfmake"
import { appendContractAttachments } from "@/lib/partner/pdf-attachments"
import { withVehicleDetails } from "@/lib/partner/contract-vehicle"
import { getCompanyVersion } from "@/lib/partner/company-config"
import { applyCompany } from "@/lib/partner/contract-pdfmake-helpers"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const type = (req.nextUrl.searchParams.get("type") ?? "sale") as PdfmakeType
  const builder = PDFMAKE_DOCS[type]
  if (!builder) return NextResponse.json({ error: "unsupported type" }, { status: 400 })

  const pdb = await partnerDb()
  const db = pdb
  const found = (await partnerColOf(db, "contracts").findOne({ _id: new ObjectId(id) })) as Contract | null
  if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const contract = await withVehicleDetails(db, found as unknown as Record<string, unknown>) as unknown as Contract

  const plate = normPlate(contract.licensePlate)
  const promos = (await partnerColOf(db, "promotionMaster").find({}).toArray()) as unknown as PromoMasterData[]
  const promo = promos.find((p) => normPlate(p.licensePlate) === plate) ?? null

  // ใช้ชุดข้อมูลบริษัท "เวอร์ชันที่สัญญาจำไว้ตอนสร้าง" — พิมพ์ซ้ำกี่ครั้งก็ได้ชื่อผู้ลงนามชุดเดิม
  const company = await getCompanyVersion(db, (contract as { companyVersion?: number }).companyVersion)
  try {
    applyCompany(company)          // ต้องติดกับ builder() ไม่มี await คั่น
    const docDef = builder(contract, promo)
    // ต่อเอกสารแนบท้าย PDF ตามชนิดสัญญา (sale/hire/guarantee — creditor/promotion ไม่แนบ)
    await appendContractAttachments(db, contract, docDef, type)
    const pdf = await renderPdfmake(docDef)
    const filename = (PDF_FILENAME[type] ?? PDF_FILENAME.sale)(contract)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pdf error"
    return NextResponse.json({ error: "pdf generation failed", detail: msg }, { status: 500 })
  }
}
