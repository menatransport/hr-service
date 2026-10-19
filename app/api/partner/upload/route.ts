import { NextRequest, NextResponse } from "next/server"
import { uploadFile } from "@/lib/partner/spaces"

export const runtime = "nodejs"

const MAX_SIZE = 20 * 1024 * 1024  // 20 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const sub  = (form.get("folder") as string | null) ?? "contracts"

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const url    = await uploadFile(buffer, file.name, file.type || "application/octet-stream", sub)

    return NextResponse.json({ url, name: file.name, size: file.size, type: file.type })
  } catch (err) {
    console.error("Upload error:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
