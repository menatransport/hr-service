/**
 * สูตรการเงินในสัญญา — ที่เดียวทั้งตอนแสดงผลและตอนบันทึก
 * ผู้ใช้สั่ง (2026-09-24): หน้าข้อมูลการเงินกรอกมือได้ช่องเดียวคือ "เงินดาวน์ชำระแล้ว"
 * ตัวตั้งต้น (ราคาขาย / เงินดาวน์รวม / จำนวนงวด) = ค่าที่ snapshot มาจากหน้าราคาขายตอนสร้างสัญญา
 * จะแก้ต้องไปแก้ที่หน้าราคาขายแล้วกดดึงราคาใหม่ — กันคนพิมพ์ทับจนตัวเลขในสัญญาไม่สัมพันธ์กัน
 */

export interface MoneyInput {
  totalPrice?: number
  downPayment?: number
  cashDown?: number
  downInstallmentCount?: number
  totalInstallments?: number
}

export interface MoneyDerived {
  remainingInstallment: number
  downInstallmentAmt: number
  financeAmount: number
  monthlyInstallment: number
}

const n = (v?: number) => Number(v ?? 0) || 0
const round2 = (v: number) => Math.round(v * 100) / 100

export function computeMoney(f: MoneyInput): MoneyDerived {
  const remainingInstallment = round2(Math.max(0, n(f.downPayment) - n(f.cashDown)))
  const financeAmount = round2(Math.max(0, n(f.totalPrice) - n(f.downPayment)))
  return {
    remainingInstallment,
    downInstallmentAmt: n(f.downInstallmentCount) ? round2(remainingInstallment / n(f.downInstallmentCount)) : 0,
    financeAmount,
    monthlyInstallment: n(f.totalInstallments) ? round2(financeAmount / n(f.totalInstallments)) : 0,
  }
}

/** ช่องที่คำนวณให้ — หน้าเว็บไม่ให้พิมพ์ทับ */
export const DERIVED_KEYS = ["remainingInstallment", "downInstallmentAmt", "financeAmount", "monthlyInstallment"] as const
