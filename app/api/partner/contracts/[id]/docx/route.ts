import { NextRequest, NextResponse } from "next/server"
import { renderContractDocx } from "@/lib/partner/contract-docx-render"
import type { DocxType } from "@/lib/partner/contract-docx"

export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const type = (req.nextUrl.searchParams.get("type") ?? "sale") as DocxType

  let result
  try {
    result = await renderContractDocx(id, type)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "render error"
    return NextResponse.json({ error: "docx generation failed", detail: msg }, { status: 500 })
  }
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return new NextResponse(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    },
  })
}
