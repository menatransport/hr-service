import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { renderPdfmake } from "@/lib/partner/pdfmake-printer"
import { buildPayrollPacket } from "@/lib/partner/payroll-packet-pdf"

export const runtime = "nodejs"
export const maxDuration = 30

const DB = PARTNER_DB

/** GET /api/payroll/[month]/packet — ชุดอนุมัติเงินเดือน PDF (ปะหน้า + NetPay รายคน + หน้าลงนาม) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 })
  }
  const client = await clientPromise
  const db = client.db(DB)
  try {
    const docDef = await buildPayrollPacket(db, month)
    const pdf = await renderPdfmake(docDef)
    const filename = `ชุดอนุมัติเงินเดือนรถร่วม-${month}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pdf error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
