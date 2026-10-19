import { describe, it, expect } from "vitest"
import {
  bahtText,
  money,
  thaiDate,
  thaiDateParts,
  ageFromBirthDate,
  firstInstallmentDate,
  formatNationalId,
} from "@/lib/partner/thai-format"

// Reference values taken from the real contract document
// สัญญาซื้อขายรถยนต์บรรทุก หาญ โพธิ์อ่อง 71-1515.docx
describe("bahtText — matches wording in the example contract", () => {
  it("1,295,514 → หนึ่งล้านสองแสนเก้าหมื่นห้าพันห้าร้อยสิบสี่บาทถ้วน", () => {
    expect(bahtText(1295514)).toBe("หนึ่งล้านสองแสนเก้าหมื่นห้าพันห้าร้อยสิบสี่บาทถ้วน")
  })
  it("100,000 → หนึ่งแสนบาทถ้วน", () => {
    expect(bahtText(100000)).toBe("หนึ่งแสนบาทถ้วน")
  })
  it("20,000 → สองหมื่นบาทถ้วน", () => {
    expect(bahtText(20000)).toBe("สองหมื่นบาทถ้วน")
  })
  it("80,000 → แปดหมื่นบาทถ้วน", () => {
    expect(bahtText(80000)).toBe("แปดหมื่นบาทถ้วน")
  })
  it("2,222.22 → สองพันสองร้อยยี่สิบสองบาทยี่สิบสองสตางค์", () => {
    expect(bahtText(2222.22)).toBe("สองพันสองร้อยยี่สิบสองบาทยี่สิบสองสตางค์")
  })
  it("1,195,514 → หนึ่งล้านหนึ่งแสนเก้าหมื่นห้าพันห้าร้อยสิบสี่บาทถ้วน", () => {
    expect(bahtText(1195514)).toBe("หนึ่งล้านหนึ่งแสนเก้าหมื่นห้าพันห้าร้อยสิบสี่บาทถ้วน")
  })
  it("16,604 → หนึ่งหมื่นหกพันหกร้อยสี่บาทถ้วน", () => {
    expect(bahtText(16604)).toBe("หนึ่งหมื่นหกพันหกร้อยสี่บาทถ้วน")
  })
  it("116,231 → หนึ่งแสนหนึ่งหมื่นหกพันสองร้อยสามสิบเอ็ดบาทถ้วน", () => {
    expect(bahtText(116231)).toBe("หนึ่งแสนหนึ่งหมื่นหกพันสองร้อยสามสิบเอ็ดบาทถ้วน")
  })
  it("11,826 → หนึ่งหมื่นหนึ่งพันแปดร้อยยี่สิบหกบาทถ้วน", () => {
    expect(bahtText(11826)).toBe("หนึ่งหมื่นหนึ่งพันแปดร้อยยี่สิบหกบาทถ้วน")
  })
})

describe("bahtText — edge cases", () => {
  it("0 → ศูนย์บาทถ้วน", () => expect(bahtText(0)).toBe("ศูนย์บาทถ้วน"))
  it("1 → หนึ่งบาทถ้วน (no เอ็ด when standalone)", () => expect(bahtText(1)).toBe("หนึ่งบาทถ้วน"))
  it("11 → สิบเอ็ดบาทถ้วน", () => expect(bahtText(11)).toBe("สิบเอ็ดบาทถ้วน"))
  it("21 → ยี่สิบเอ็ดบาทถ้วน", () => expect(bahtText(21)).toBe("ยี่สิบเอ็ดบาทถ้วน"))
  it("101 → หนึ่งร้อยเอ็ดบาทถ้วน", () => expect(bahtText(101)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน"))
  it("1,000,000 → หนึ่งล้านบาทถ้วน", () => expect(bahtText(1_000_000)).toBe("หนึ่งล้านบาทถ้วน"))
  it("12,000,000 → สิบสองล้านบาทถ้วน", () => expect(bahtText(12_000_000)).toBe("สิบสองล้านบาทถ้วน"))
  it("0.50 → ศูนย์บาทห้าสิบสตางค์", () => expect(bahtText(0.5)).toBe("ศูนย์บาทห้าสิบสตางค์"))
  it("1.01 → หนึ่งบาทหนึ่งสตางค์", () => expect(bahtText(1.01)).toBe("หนึ่งบาทหนึ่งสตางค์"))
  it("handles floating point rounding (99.999 → 100 บาท)", () => expect(bahtText(99.999)).toBe("หนึ่งร้อยบาทถ้วน"))
  it("null → -", () => expect(bahtText(null)).toBe("-"))
})

describe("money", () => {
  it("integer has no decimals", () => expect(money(16604)).toBe("16,604"))
  it("keeps 2 decimals when fractional", () => expect(money(2222.22)).toBe("2,222.22"))
  it("null → -", () => expect(money(null)).toBe("-"))
})

describe("thaiDate — Buddhist era", () => {
  it("2026-06-01 → 1 มิถุนายน 2569 (contract date in example)", () => {
    expect(thaiDate("2026-06-01")).toBe("1 มิถุนายน 2569")
  })
  it("2013-04-04 → 4 เมษายน 2556 (vehicle registration in example)", () => {
    expect(thaiDate("2013-04-04")).toBe("4 เมษายน 2556")
  })
  it("missing → dotted fallback", () => {
    expect(thaiDate(undefined)).toBe("................")
  })
  it("parts", () => {
    expect(thaiDateParts("2026-06-01")).toEqual({ day: 1, monthName: "มิถุนายน", yearBE: 2569 })
  })
})

describe("firstInstallmentDate — last day of following month", () => {
  it("contract 2026-06-01 → 2026-07-31 (matches example: 31 กรกฎาคม 2569)", () => {
    expect(firstInstallmentDate("2026-06-01")).toBe("2026-07-31")
  })
  it("contract 2026-01-15 → 2026-02-28", () => {
    expect(firstInstallmentDate("2026-01-15")).toBe("2026-02-28")
  })
  it("year rollover: 2026-12-05 → 2027-01-31", () => {
    expect(firstInstallmentDate("2026-12-05")).toBe("2027-01-31")
  })
})

describe("ageFromBirthDate", () => {
  it("computes full years as of a date", () => {
    expect(ageFromBirthDate("1973-03-10", "2026-06-01")).toBe(53) // example buyer is 53
  })
  it("birthday not yet reached", () => {
    expect(ageFromBirthDate("1973-08-10", "2026-06-01")).toBe(52)
  })
  it("missing → null", () => {
    expect(ageFromBirthDate(undefined)).toBeNull()
  })
})

describe("formatNationalId", () => {
  it("groups 13 digits like ID card (example: 3 6008 00723 37 5)", () => {
    expect(formatNationalId("3600800723375")).toBe("3 6008 00723 37 5")
  })
  it("accepts pre-formatted input", () => {
    expect(formatNationalId("3-6008-00723-37-5")).toBe("3 6008 00723 37 5")
  })
  it("non-13-digit passes through", () => {
    expect(formatNationalId("12345")).toBe("12345")
  })
  it("empty → -", () => {
    expect(formatNationalId("")).toBe("-")
  })
})
