import { describe, it, expect } from "vitest"
import { computeMoney } from "@/lib/partner/contract-money"

describe("computeMoney — สูตรการเงินในสัญญา", () => {
  const base = { totalPrice: 1_759_987, downPayment: 100_000, cashDown: 20_000, downInstallmentCount: 36, totalInstallments: 96 }

  it("ดาวน์คงเหลือ = ดาวน์รวม − ดาวน์ชำระแล้ว", () => {
    expect(computeMoney(base).remainingInstallment).toBe(80_000)
  })

  it("ค่างวดดาวน์ = ดาวน์คงเหลือ ÷ จำนวนงวดดาวน์ (ปัด 2 ตำแหน่ง)", () => {
    expect(computeMoney(base).downInstallmentAmt).toBe(2_222.22)
  })

  it("ยอดเงินค่างวด = ราคาขาย − ดาวน์รวม · ค่างวด/เดือน = ยอดเงินค่างวด ÷ งวดรวม", () => {
    const m = computeMoney(base)
    expect(m.financeAmount).toBe(1_659_987)
    expect(m.monthlyInstallment).toBe(17_291.53)
  })

  it("จ่ายดาวน์ครบแล้ว → คงเหลือ 0 ไม่ติดลบ", () => {
    expect(computeMoney({ ...base, cashDown: 150_000 }).remainingInstallment).toBe(0)
  })

  it("ไม่มีจำนวนงวด → ไม่หารด้วยศูนย์", () => {
    const m = computeMoney({ ...base, downInstallmentCount: 0, totalInstallments: 0 })
    expect(m.downInstallmentAmt).toBe(0)
    expect(m.monthlyInstallment).toBe(0)
  })
})
