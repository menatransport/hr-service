import { describe, it, expect } from "vitest"
import { toPosterData } from "@/lib/partner/catalog-poster-data"
import type { CatalogVehicle } from "@/lib/partner/catalog-pdf"
import type { CatalogConfig } from "@/lib/partner/catalog-config"

// โปสเตอร์เปิดได้เฉพาะคนล็อกอิน (Google OAuth) จึงทดสอบที่ข้อมูลแทนการเปิดหน้าเว็บ
const cfg = { sellingPoints: [], tagline: "", contactPhone: "", contactLine: "" } as unknown as CatalogConfig

const vehicle = (p: Partial<CatalogVehicle>): CatalogVehicle => ({
  licensePlate: "สบ.70-6298", truckNumber: "ME135", brand: "NISSAN", model: "CWM454HMRA", hasPrice: true, ...p,
})

describe("toPosterData — ตัวเลขบนโปสเตอร์", () => {
  it("ราคาเป็นหลักพัน และ ดาวน์ + ค่างวด × งวด = ราคา", () => {
    const d = toPosterData(vehicle({
      totalSalePrice: 1335728, downPayment: 100000, monthlyPayment: 17163, financeInstallments: 72,
    }), cfg)
    expect(d.price).toBe(1342000)
    expect(d.monthlyPayment).toBe(17250)
    expect(d.downPayment).toBe(100000)
    expect(d.price).toBe((d.downPayment ?? 0) + (d.monthlyPayment ?? 0) * (d.installments ?? 0))
  })

  it("ไม่มีดาวน์จริง → ไม่โชว์บรรทัดดาวน์", () => {
    const d = toPosterData(vehicle({
      totalSalePrice: 1238400, downPayment: 0, monthlyPayment: 17200, financeInstallments: 72,
    }), cfg)
    expect(d.price % 1000).toBe(0)
    expect(d.downPayment).toBeUndefined()
  })
})
