import { describe, it, expect, afterEach } from "vitest"
import { siteUrl, truckTitle, truckDescription, truckJsonLd } from "@/lib/partner/public-seo"
import type { PublicTruck } from "@/lib/partner/public-trucks"

const truck: PublicTruck = {
  slug: "me009-hino-fm2p-2561", truckNumber: "ME009", licensePlate: "สบ.71-1956", brand: "HINO", model: "FM2P",
  vehicleType: "รถผสมปูน", characteristic: "10 ล้อ", color: "ขาว", registrationYear: 2018,
  engineSize: "7790 cc", photoUrl: "https://spaces/f.jpg",
  photos: { front: "https://spaces/f.jpg", back: "", left: "", right: "", cabin: "" },
  totalSalePrice: 1450000, downPayment: 200000, cashDown: 50000, monthlyPayment: 35000,
  financeInstallments: 48, display: { price: 1450000, monthlyPayment: 35000, downPayment: 200000 }, promos: [], isSold: false, isReady: true,
}

describe("siteUrl", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = original
  })

  it("ใช้ค่า env เมื่อมี", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://menatransport.co.th"
    expect(siteUrl("/trucks/x")).toBe("https://menatransport.co.th/trucks/x")
  })
  it("ไม่มี env → fallback โดเมน vercel", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL
    expect(siteUrl("/trucks")).toBe("https://mena-partner.vercel.app/trucks")
  })
  it("ตัด / ซ้ำท้ายโดเมน", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/"
    expect(siteUrl("/trucks")).toBe("https://example.com/trucks")
  })
})

describe("truckTitle / truckDescription", () => {
  it("title มียี่ห้อ รุ่น ปีพ.ศ. ราคา และชื่อบริษัท", () => {
    const t = truckTitle(truck)
    expect(t).toContain("HINO FM2P")
    expect(t).toContain("2561")
    expect(t).toContain("1,450,000")
    expect(t).toContain("มีนาทรานสปอร์ต")
  })
  it("description ยาวไม่เกิน 160 ตัวอักษร", () => {
    expect(truckDescription(truck).length).toBeLessThanOrEqual(160)
  })
})

describe("truckJsonLd", () => {
  it("เป็น schema.org Vehicle พร้อม Offer ราคาบาท", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ld = truckJsonLd(truck) as Record<string, any>
    expect(ld["@type"]).toBe("Vehicle")
    expect(ld.offers.price).toBe(1450000)
    expect(ld.offers.priceCurrency).toBe("THB")
    expect(ld.offers.availability).toBe("https://schema.org/InStock")
    expect(ld.brand.name).toBe("HINO")
  })
  it("ขายแล้ว → availability = SoldOut", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ld = truckJsonLd({ ...truck, isSold: true }) as Record<string, any>
    expect(ld.offers.availability).toBe("https://schema.org/SoldOut")
  })
  it("ไม่มีทะเบียนหลุดเข้า JSON-LD", () => {
    expect(JSON.stringify(truckJsonLd(truck))).not.toContain("71-")
  })
})
