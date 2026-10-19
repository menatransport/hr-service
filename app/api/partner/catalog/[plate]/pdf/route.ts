import { NextRequest, NextResponse } from "next/server"
import { renderPdfmake } from "@/lib/partner/pdfmake-printer"
import { catalogDocDef, loadCatalogVehicles, loadImages } from "@/lib/partner/catalog-pdf"
import { getCatalogConfig } from "@/lib/partner/catalog-config"
import { partnerDb } from "@/lib/db/partner"

export const runtime = "nodejs"
export const maxDuration = 30
/** Catalog 1 หน้า ของรถทะเบียนเดียว — GET /api/catalog/<plate>/pdf (?download=1 = บังคับดาวน์โหลด) */
export async function GET(req: NextRequest, { params }: { params: Promise<{ plate: string }> }) {
  const { plate } = await params
  const p = decodeURIComponent(plate).trim()
  if (!p) return NextResponse.json({ error: "plate required" }, { status: 400 })
  const pdb = await partnerDb()
  const db = pdb
  const [vs, cfg] = await Promise.all([loadCatalogVehicles(db, [p]), getCatalogConfig(db)])
  if (vs.length === 0) return NextResponse.json({ error: `ไม่พบรถทะเบียน ${p}` }, { status: 404 })
  try {
    const images = await loadImages(vs)
    const pdf = await renderPdfmake(catalogDocDef(vs, cfg, images))
    const dl = req.nextUrl.searchParams.get("download") === "1"
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`catalog-${vs[0].licensePlate}.pdf`)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "pdf error" }, { status: 500 })
  }
}
