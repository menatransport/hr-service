import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { renderPdfmake } from "@/lib/partner/pdfmake-printer"
import { catalogDocDef, loadCatalogVehicles, loadImages } from "@/lib/partner/catalog-pdf"
import { getCatalogConfig } from "@/lib/partner/catalog-config"

export const runtime = "nodejs"
export const maxDuration = 60
const DB = PARTNER_DB

/**
 * Catalog รวมเล่ม — GET /api/catalog/pdf            = รถพร้อมขายทุกคัน (saleStatus ready + ไม่มีสัญญา) 1 หน้า/คัน
 *                    GET /api/catalog/pdf?plates=a,b = เฉพาะทะเบียนที่ระบุ
 */
export async function GET(req: NextRequest) {
  const platesParam = req.nextUrl.searchParams.get("plates")?.trim() ?? ""
  const plates = platesParam ? platesParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60) : undefined
  const client = await clientPromise
  const db = client.db(DB)
  const [vs, cfg] = await Promise.all([loadCatalogVehicles(db, plates), getCatalogConfig(db)])
  if (vs.length === 0) return NextResponse.json({ error: "ไม่มีรถพร้อมขาย" }, { status: 404 })
  try {
    const images = await loadImages(vs)
    const pdf = await renderPdfmake(catalogDocDef(vs, cfg, images))
    const dl = req.nextUrl.searchParams.get("download") === "1"
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`catalog-รถพร้อมขาย-${vs.length}คัน.pdf`)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "pdf error" }, { status: 500 })
  }
}
