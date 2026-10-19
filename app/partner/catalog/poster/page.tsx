import Link from "next/link"
import { FileText, ArrowLeft } from "lucide-react"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { loadPosterData } from "@/lib/partner/catalog-poster-data"
import TruckCatalogPoster, { MOCK_TRUCK } from "@/components/partner/catalog/truck-catalog-poster"
import { PosterDownloadButton } from "@/components/partner/catalog/poster-download-button"

/**
 * โปสเตอร์แคตตาล็อกรายคัน — /catalog/poster?plate=สบ.70-6298 (ข้อมูลจริง) · ไม่ใส่ plate = mock NISSAN ME135
 * ?fixed=1 = เฟรม 1024px · ปุ่มดาวน์โหลด PNG 1024px · ปุ่มเปิด PDF ชุดเดิม
 */
export default async function CatalogPosterPage({ searchParams }: { searchParams: Promise<{ plate?: string; fixed?: string }> }) {
  const { plate, fixed } = await searchParams
  const db = (await clientPromise).db(PARTNER_DB)
  const real = plate ? await loadPosterData(db, plate) : null
  const poster = real ?? MOCK_TRUCK
  const notFound = !!plate && !real

  return (
    <div className="-m-5 sm:-m-7 min-h-full bg-zinc-200 dark:bg-zinc-800 p-6 overflow-auto">
      <div className="max-w-[1024px] mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-600 dark:text-zinc-300 flex items-center gap-3">
          <Link href="/partner/catalog" className="inline-flex items-center gap-1 hover:underline"><ArrowLeft className="w-4 h-4" />Catalog</Link>
          <span>
            {notFound
              ? <span className="text-amber-600">ไม่พบรถทะเบียน {plate} — แสดงตัวอย่างแทน</span>
              : <>โปสเตอร์ {poster.brand} {poster.modelCode} · {poster.plate}{!real && " (ตัวอย่าง)"}</>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {real && (
            <a href={`/api/partner/catalog/${encodeURIComponent(poster.plate)}/pdf`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm font-medium px-4 py-2">
              <FileText className="w-4 h-4" />PDF
            </a>
          )}
          <PosterDownloadButton poster={poster} fileName={`poster-${poster.modelCode || poster.plate}`} />
        </div>
      </div>
      <TruckCatalogPoster {...poster} mode={fixed ? "fixed" : "fluid"} />
    </div>
  )
}
