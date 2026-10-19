import type { PublicTruck } from "@/lib/partner/public-trucks"

const FALLBACK_ORIGIN = "https://mena-partner.vercel.app"
const COMPANY = "มีนาทรานสปอร์ต"

/** เงินบนหน้าเว็บสาธารณะ = ปัดเป็นบาทเต็ม ไม่มีทศนิยม (formatMoney ของระบบภายในมี .00) */
export const fmtBaht = (n: number) => Math.round(n).toLocaleString("en-US")

/** ทุก URL สาธารณะต้องผ่านตัวนี้ — ย้ายโดเมนภายหลัง = แก้ env ตัวเดียว */
export function siteUrl(path = ""): string {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_ORIGIN).replace(/\/+$/, "")
  return path ? `${origin}${path.startsWith("/") ? path : `/${path}`}` : origin
}

const nameOf = (t: PublicTruck) =>
  [t.brand, t.model].filter(Boolean).join(" ") || t.vehicleType || "รถผสมปูนมือสอง"
const beYear = (t: PublicTruck) => (t.registrationYear ? t.registrationYear + 543 : null)

export function truckTitle(t: PublicTruck): string {
  const y = beYear(t)
  const price = t.display.price > 0 ? ` ราคา ${t.display.price.toLocaleString("en-US")}` : ""
  return `${t.vehicleType || "รถผสมปูน"} ${nameOf(t)}${y ? ` ปี ${y}` : ""}${price} | ${COMPANY}`
}

export function truckDescription(t: PublicTruck): string {
  const y = beYear(t)
  const parts = [
    `${nameOf(t)}${y ? ` ปี ${y}` : ""} ${t.characteristic}`.trim(),
    "เจ้าของเดียว ประวัติซ่อมบำรุงครบทุกระยะ",
    t.display.monthlyPayment > 0 ? `ผ่อน ${t.display.monthlyPayment.toLocaleString("en-US")} บาท/เดือน` : "",
    "ผ่อนตรงกับบริษัท ไม่ผ่านไฟแนนซ์ พร้อมงานวิ่ง",
  ].filter(Boolean)
  return parts.join(" · ").slice(0, 160)
}

export function truckJsonLd(t: PublicTruck): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: truckTitle(t),
    description: truckDescription(t),
    brand: { "@type": "Brand", name: t.brand || COMPANY },
    model: t.model || undefined,
    vehicleConfiguration: t.characteristic || undefined,
    color: t.color || undefined,
    ...(t.registrationYear ? { vehicleModelDate: String(t.registrationYear) } : {}),
    image: [t.photos.front, t.photos.left, t.photos.right, t.photos.back, t.photos.cabin].filter(Boolean),
    url: siteUrl(`/trucks/${t.slug}`),
    offers: {
      "@type": "Offer",
      price: t.display.price,
      priceCurrency: "THB",
      availability: t.isSold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: `บริษัท ${COMPANY} จำกัด (มหาชน)` },
      url: siteUrl(`/trucks/${t.slug}`),
    },
  }
}
