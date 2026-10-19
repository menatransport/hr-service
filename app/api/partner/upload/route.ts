import { NextRequest, NextResponse } from "next/server"
import { uploadFile } from "@/lib/partner/spaces"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
import { canUpload } from "@/lib/partner/rbac"

export const runtime = "nodejs"

const MAX_SIZE = 20 * 1024 * 1024  // 20 MB

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs) — อัปโหลด: ทุกบทบาทที่เขียนได้อย่างน้อยหนึ่งโดเมน (เหมือน lib/auth/gate.ts)
  const perm = await requirePartnerPerm("login")
  if (perm instanceof Response) return perm
  if (!canUpload(perm.user.role)) return NextResponse.json({ error: "Forbidden — ไม่มีสิทธิ์อัปโหลด" }, { status: 403 })

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
