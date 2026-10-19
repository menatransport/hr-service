import { NextRequest, NextResponse } from "next/server"

/**
 * proxy รูปสำหรับ export โปสเตอร์ (html-to-image ต้องการรูป same-origin กัน canvas taint)
 * จำกัดโฮสต์ที่อนุญาต — ไม่ใช่ open proxy · อยู่ใต้ /api/catalog = ต้อง login
 */
const ALLOWED_HOSTS = [/\.digitaloceanspaces\.com$/, /^placehold\.co$/]

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? ""
  let url: URL
  try { url = new URL(u) } catch { return NextResponse.json({ error: "bad url" }, { status: 400 }) }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
    return NextResponse.json({ error: "host not allowed" }, { status: 400 })
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) }).catch(() => null)
  if (!res?.ok) return NextResponse.json({ error: "fetch failed" }, { status: 502 })
  const type = res.headers.get("content-type") ?? "application/octet-stream"
  if (!type.startsWith("image/")) return NextResponse.json({ error: "not an image" }, { status: 415 })
  return new NextResponse(res.body, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
  })
}
