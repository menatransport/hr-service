import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { renderPdfmake } from "@/lib/partner/pdfmake-printer"
import { quotationDocDef } from "@/lib/partner/quotation-pdf"
import { QUOTE_COLL, type Quotation } from "@/lib/partner/quotation"

export const runtime = "nodejs"
export const maxDuration = 30
const DB = PARTNER_DB

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "bad id" }, { status: 400 })
  const client = await clientPromise
  const doc = await client.db(DB).collection(QUOTE_COLL).findOne({ _id: new ObjectId(id) })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const pdf = await renderPdfmake(await quotationDocDef({ ...doc, _id: String(doc._id) } as unknown as Quotation))
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`ใบเสนอราคา-${doc.quotationNo}.pdf`)}`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "pdf error" }, { status: 500 })
  }
}
