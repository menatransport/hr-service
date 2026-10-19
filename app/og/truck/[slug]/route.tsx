import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { loadPublicTruckBySlug } from "@/lib/partner/public-trucks"

export const runtime = "nodejs"
export const revalidate = 600

/** satori ไม่อ่าน EXIF orientation (รูปจากมือถือหมุน 90°) → หมุน+ครอปด้วย sharp ก่อน เหมือน catalog PDF */
async function photoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return null
    const out = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate().resize({ width: 1200, height: 420, fit: "cover" }).jpeg({ quality: 78 }).toBuffer()
    return `data:image/jpeg;base64,${out.toString("base64")}`
  } catch { return null }
}

/** การ์ดตอนแชร์ลิงก์ (LINE/Facebook) — รูปรถ + ราคา; ฟอนต์ไทยจำเป็น (ImageResponse ไม่มี glyph ไทยในตัว) */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const truck = await loadPublicTruckBySlug(slug)
  if (!truck) return new Response("not found", { status: 404 })

  const [font, photo] = await Promise.all([
    readFile(join(process.cwd(), "partner-assets", "fonts", "Sarabun-Bold.ttf")),
    truck.photoUrl ? photoDataUrl(truck.photoUrl) : Promise.resolve(null),
  ])
  const title = [truck.brand, truck.model].filter(Boolean).join(" ") || "รถผสมปูนมือสอง"
  const year = truck.registrationYear ? ` ปี ${truck.registrationYear + 543}` : ""

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0b0b0c", color: "white", fontFamily: "Sarabun" }}>
        {photo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={photo} width={1200} height={420} alt="" />
          : <div style={{ width: 1200, height: 420, background: "#27272a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>มีนา ทรานสปอร์ต · รถมือสอง</div>}
        <div style={{ display: "flex", flexDirection: "column", padding: "24px 40px", gap: 8 }}>
          {/* satori: div ที่ไม่ใช่ flex ต้องมีลูกเดียว — รวมเป็น string เดียวก่อน */}
          <div style={{ fontSize: 44 }}>{`${title}${year}`}</div>
          <div style={{ fontSize: 52, color: "#fbbf24" }}>{`฿${truck.display.price.toLocaleString("en-US")}`}</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: [{ name: "Sarabun", data: font, style: "normal", weight: 700 }] },
  )
}
