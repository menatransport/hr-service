"use client"

import { useRef, useState } from "react"
import { Download } from "lucide-react"
import { toPng } from "html-to-image"
import { toast } from "sonner"
import TruckCatalogPoster, { type TruckCatalogPosterProps } from "./truck-catalog-poster"

const EXPORT_WIDTH = 1024

/** รูป URL เต็ม (โดเมนอื่น) → ผ่าน proxy same-origin กัน canvas taint ตอน export — ห้ามอ้าง window/location (component นี้ SSR ด้วย) */
const proxied = (u?: string) => (u && /^https?:\/\//.test(u) ? `/api/partner/catalog/img?u=${encodeURIComponent(u)}` : u ?? "")

/**
 * ปุ่ม "ดาวน์โหลด PNG" — render โปสเตอร์สำเนา 1024px ไว้นอกจอ (fixed mode, container query → layout เต็มเสมอ)
 * แล้ว capture ด้วย html-to-image เป็น PNG 1024×(สูงตามเนื้อหา ≥1536) ให้เซลล์ส่ง LINE ได้ทันที
 */
export function PosterDownloadButton({ poster, fileName }: { poster: TruckCatalogPosterProps; fileName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)

  const exportProps: TruckCatalogPosterProps = {
    ...poster,
    mode: "fixed",
    scale: 1,
    heroImage: poster.heroImage !== undefined ? proxied(poster.heroImage) : undefined,
    gallery: poster.gallery?.map((g) => ({ ...g, src: proxied(g.src) })),
  }

  async function download() {
    const node = ref.current?.querySelector<HTMLElement>("[data-truck-poster]")
    if (!node) return
    setBusy(true)
    try {
      // รอรูปทุกใบโหลดเสร็จก่อน ไม่งั้นได้ช่องว่าง
      await Promise.all(Array.from(node.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res() })))
      const dataUrl = await toPng(node, {
        width: EXPORT_WIDTH,
        height: Math.max(node.offsetHeight, 1536),
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: "#F6F1E4",
      })
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = `${fileName ?? "poster"}.png`
      a.click()
      toast.success("ดาวน์โหลด PNG แล้ว")
    } catch (e) {
      console.error(e)
      toast.error("สร้างรูปไม่สำเร็จ — ลองใหม่อีกครั้ง")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={download} disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50">
        <Download className="w-4 h-4" />{busy ? "กำลังสร้างรูป…" : "ดาวน์โหลด PNG"}
      </button>
      {/* สำเนาสำหรับ export — อยู่นอกจอแต่ยัง render จริง (ห้าม display:none ไม่งั้น capture ได้รูปเปล่า) */}
      <div ref={ref} aria-hidden className="fixed -left-[20000px] top-0 pointer-events-none" style={{ width: EXPORT_WIDTH }}>
        <TruckCatalogPoster {...exportProps} />
      </div>
    </>
  )
}
