import "server-only"
import { loadCatalogVehicles, type CatalogVehicle } from "@/lib/partner/catalog-pdf"
import { getCatalogConfig, type CatalogConfig } from "@/lib/partner/catalog-config"
import type { TruckCatalog } from "@/components/partner/catalog/truck-catalog-poster"
import { promoCopy, type PromoSeg } from "@/lib/partner/promo-copy"
import { displaySalePrice } from "@/lib/partner/sale-display"
import { type PartnerDb } from "@/lib/db/partner-col"

/**
 * แปลงข้อมูลรถ (ชุดเดียวกับ Catalog PDF) → props ของ TruckCatalogPoster
 * ข้อความ quote/จุดขาย/ติดต่อ มาจาก catalog_config ที่ admin แก้ได้ที่ /catalog
 */

const SALE_STATUS_LABEL: Record<string, string> = {
  ready: "พร้อมขาย", repair15: "ซ่อม 15 วัน", repair30: "ซ่อม 30 วัน", review: "รอตรวจสภาพ",
}
const beYear = (d?: string) => { const y = Number(String(d ?? "").slice(0, 4)); return y > 1900 ? y + 543 : null }

const B = ({ children }: { children: React.ReactNode }) => <b className="text-[var(--mt-green)]">{children}</b>
const seg = (s: PromoSeg, i: number) =>
  typeof s === "string" ? s
    : "b" in s ? <B key={i}>{s.b}</B>
    : <span key={i} className="text-2xl @3xl:text-[28px] leading-snug font-black text-[var(--mt-green)]">{s.big}</span>

/** การ์ดโปรฯ 3 ต่อ — ถ้อยคำอยู่ที่ lib/promo-copy (ชุดเดียวกับหน้า /trucks และ Catalog PDF) */
function promotionsFrom(v: CatalogVehicle): TruckCatalog["promotions"] {
  return promoCopy(v.promo).map((p) => ({
    badge: p.badge, title: p.title, titleParts: p.titleParts, note: p.note,
    // 1 บรรทัดใน promo-copy = 1 บรรทัดบนการ์ด (ไม่ปล่อยให้ตัดคำเอง)
    body: <>{p.lines.map((l, i) => <span key={i} className="block">{l.map(seg)}</span>)}</>,
  }))
}

export function toPosterData(v: CatalogVehicle, cfg: CatalogConfig): TruckCatalog {
  const ph = v.photos ?? {}
  // รูปแรก = ด้านซ้าย (เห็นตัวรถทั้งคัน) ถ้าไม่มีค่อยถอยไปหน้า
  const year = beYear(v.registrationDate)
  // ราคาปัดเลขกลม (lib/sale-display — ชุดเดียวกับ /catalog และ /trucks)
  const shown = displaySalePrice(v)
  const count = v.financeInstallments ?? 0
  const down = shown.downPayment      // ดาวน์ที่โชว์ = รับส่วนต่างจากการปัดราคา (ดูหมายเหตุใน lib/sale-display)
  return {
    brand: v.brand || "—",
    modelCode: v.truckNumber || "",
    plate: v.licensePlate,
    specs: [
      { label: "รุ่น", value: v.model || "—" },
      { label: "ประเภทรถ", value: [v.vehicleType, v.characteristic].filter(Boolean).join(" ") || "—" },
      { label: "ปีจดทะเบียน", value: year ? String(year) : "—" },
    ],
    status: SALE_STATUS_LABEL[v.saleStatus ?? ""] ?? (v.saleStatus || "—"),
    price: shown.price,
    downPayment: down > 0 ? down : undefined,
    monthlyPayment: shown.monthlyPayment,
    installments: count || undefined,
    heroImage: ph.left || ph.front || v.photoUrl || "",
    gallery: [
      { src: ph.front ?? "", caption: "ด้านหน้า" },
      { src: ph.back ?? "", caption: "ด้านหลัง" },
      { src: ph.right ?? "", caption: "ด้านขวา" },
      { src: ph.left ?? "", caption: "ด้านซ้าย" },
    ].filter((g) => g.src),
    quote: cfg.tagline,
    highlights: cfg.sellingPoints.slice(0, 3),
    promotions: promotionsFrom(v),
    contactPhone: cfg.contactPhone,
    lineId: cfg.contactLine,
    logoUrl: "/partner/mena-logo.jpg",
  }
}

/** โหลดข้อมูลโปสเตอร์ของทะเบียนเดียว — null ถ้าไม่พบรถ */
export async function loadPosterData(db: PartnerDb, plate: string): Promise<TruckCatalog | null> {
  const [vs, cfg] = await Promise.all([loadCatalogVehicles(db, [plate]), getCatalogConfig(db)])
  if (vs.length === 0) return null
  return toPosterData(vs[0], cfg)
}
