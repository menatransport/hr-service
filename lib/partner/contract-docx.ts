/**
 * สร้าง object ของ placeholder → ค่า สำหรับเติมลง .docx template (docxtemplater)
 * ใช้ helper ชุดเดียวกับหน้า preview (lib/thai-format) เพื่อให้ค่าออกมาตรงกันเป๊ะ
 */
import type { Contract } from "@/lib/partner/types"
import { buyerFullName } from "@/lib/partner/contract-doc"
import {
  bahtText,
  money,
  thaiDate,
  thaiDateParts,
  ageFromBirthDate,
  formatNationalId,
} from "@/lib/partner/thai-format"

export interface PromoMasterData {
  licensePlate?: string
  pro1FreeCount?: number
  pro1TotalValue?: number
  pro1InstallmentValue?: number
  pro1Condition?: string
  pro1FreeAtInstallments?: string
  pro2RepairBudget?: number
  pro3AnnualPm?: number
}

/** "สบ.71-1515" → "71-1515" (เหมือน normPlate ใน component) */
export function normPlate(p?: string | null): string {
  return (p ?? "").replace(/^[^0-9]*/, "").trim()
}

const DOTS = "................"
const s = (v: unknown) => (v == null || v === "" ? DOTS : String(v))
const m = (v: number | null | undefined) => (v == null ? DOTS : money(v))
const bt = (v: number | null | undefined) => (v == null ? DOTS : bahtText(v))

/** ค่าทุก placeholder ของ template สัญญาซื้อขาย (templates/sale.docx) */
export function saleDocxData(c: Contract, promo: PromoMasterData | null): Record<string, string> {
  const dp = thaiDateParts(c.contractDate)
  const age = ageFromBirthDate(c.birthDate, c.contractDate)
  const plate = normPlate(c.licensePlate) || c.licensePlate || ""
  // วันที่เริ่มผ่อนงวดแรก = field startDate (กรอกเอง) — ว่าง = เว้นเส้นประให้เติมมือใน PDF/DOCX
  const firstPay = c.startDate || null
  const downRemaining =
    c.remainingInstallment ??
    (c.downPayment != null && c.cashDown != null ? c.downPayment - c.cashDown : undefined)
  // payEveryLastDay ไม่ได้อยู่ใน type แต่ component อ้างถึง — รองรับไว้
  const payEveryLastDay = (c as unknown as { payEveryLastDay?: boolean }).payEveryLastDay
  const payDueText = payEveryLastDay ? "วันสุดท้ายของทุกเดือน" : "วันที่ 30 ของทุกเดือน"

  const pro1Every = promo?.pro1Condition?.match(/\d+/)?.[0] ?? "9"
  const pro1Value = promo?.pro1InstallmentValue ?? c.monthlyInstallment

  return {
    // header
    contractCode: s(c.contractCode),
    contractDay: dp ? String(dp.day) : DOTS,
    contractMonth: dp ? dp.monthName : DOTS,
    contractYearBE: dp ? String(dp.yearBE) : DOTS,
    // parties
    buyerName: s(buyerFullName(c)),
    age: age != null ? String(age) : DOTS,
    nationalId: c.nationalId ? formatNationalId(c.nationalId) : DOTS,
    driverAddress: s(c.driverAddress),
    // vehicle
    vehicleType: s(c.vehicleType),
    vehicleCharacteristic: s(c.vehicleCharacteristic),
    vehicleBrand: s(c.vehicleBrand),
    vehicleModel: s(c.vehicleModel),
    vehicleRegistrationDate: c.vehicleRegistrationDate ? thaiDate(c.vehicleRegistrationDate) : DOTS,
    vehicleColor: s(c.vehicleColor),
    licensePlate: s(plate),
    chassisNumber: s(c.chassisNumber),
    engineNumber: s(c.engineNumber),
    engineSize: s(c.engineSize),
    mileage: c.mileage ? money(c.mileage) : DOTS, // ว่าง = เส้นประให้เติมมือ (เหมือนช่องอื่น)
    // ข้อ 2 price
    totalPrice: m(c.totalPrice),
    totalPriceText: bt(c.totalPrice),
    downPayment: m(c.downPayment),
    downPaymentText: bt(c.downPayment),
    cashDown: m(c.cashDown),
    cashDownText: bt(c.cashDown),
    downRemaining: m(downRemaining),
    downRemainingText: bt(downRemaining),
    downInstallmentAmt: m(c.downInstallmentAmt),
    downInstallmentAmtText: bt(c.downInstallmentAmt),
    downInstallmentCount: s(c.downInstallmentCount),
    firstPayDate: firstPay ? thaiDate(firstPay) : DOTS,
    payDueText,
    financeAmount: m(c.financeAmount),
    financeAmountText: bt(c.financeAmount),
    totalInstallments: s(c.totalInstallments),
    monthlyInstallment: m(c.monthlyInstallment),
    monthlyInstallmentText: bt(c.monthlyInstallment),
    // promo
    pro1Every,
    pro1Value: m(pro1Value),
    pro1ValueText: bt(pro1Value),
    pro1FreeAtInstallments: s(promo?.pro1FreeAtInstallments),
    pro1FreeCount: s(promo?.pro1FreeCount),
    pro1TotalValue: m(promo?.pro1TotalValue),
    pro1TotalValueText: bt(promo?.pro1TotalValue),
    pro2RepairBudget: m(promo?.pro2RepairBudget),
    pro2RepairBudgetText: bt(promo?.pro2RepairBudget),
    pro3AnnualPm: m(promo?.pro3AnnualPm),
    pro3AnnualPmText: bt(promo?.pro3AnnualPm),
  }
}

// build functions ของเอกสารชนิดอื่น (แยกไฟล์ — ใช้ normPlate/PromoMasterData จากไฟล์นี้)
import { hireDocxData } from "@/lib/partner/contract-docx-hire"
import { guaranteeDocxData } from "@/lib/partner/contract-docx-guarantee"
import { creditorDocxData } from "@/lib/partner/contract-docx-creditor"

/** ทะเบียนเอกสาร → ไฟล์ template + ตัวสร้างข้อมูล + ชื่อไฟล์ */
export const DOCX_TEMPLATES = {
  sale: {
    file: "sale.docx",
    build: saleDocxData,
    filename: (c: Contract) =>
      `สัญญาซื้อขาย-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}.docx`,
  },
  hire: {
    file: "hire.docx",
    build: hireDocxData,
    filename: (c: Contract) =>
      `สัญญาว่าจ้าง-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}.docx`,
  },
  guarantee: {
    file: "guarantee.docx",
    build: guaranteeDocxData,
    filename: (c: Contract) =>
      `สัญญาค้ำประกัน-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}.docx`,
  },
  creditor: {
    file: "creditor.docx",
    build: creditorDocxData,
    filename: (c: Contract) =>
      `เปิดรหัสเจ้าหนี้-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}.docx`,
  },
} as const

export type DocxType = keyof typeof DOCX_TEMPLATES
