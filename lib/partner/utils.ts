import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PayrollDeductionFields, PayrollIncomeFields, PayrollComputed } from "@/lib/partner/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

export function formatMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-").map(Number)
  // แสดงปีคู่ ค.ศ./พ.ศ. ตามมาตรฐานระบบ (2026/2569) — กันสับสนช่องเลือกเดือนที่เป็น ค.ศ.
  return `${THAI_MONTHS[month - 1]} ${year}/${year + 543}`
}

/** Format ISO date string to DD/MM/BBBB (Thai Buddhist year) */
export function formatDate(isoDate: string | undefined | null): string {
  if (!isoDate) return "-"
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number)
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year} (${year + 543})`
}

/** Return the previous YYYY-MM */
export function prevMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, "0")}`
}

/** Return the next YYYY-MM */
export function nextMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split("-").map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

export function computePayroll(
  fields: PayrollIncomeFields & PayrollDeductionFields
): PayrollComputed {
  const totalIncome =
    fields.transportFee +
    fields.ot +
    fields.otherIncomeWHT +
    fields.otherIncomeNoWHT

  const totalDeductions =
    fields.fuel +
    fields.gps +
    fields.repairInHouse +
    fields.repairOutside +
    fields.mgmtFee8pct +
    fields.labor +
    fields.tire +
    fields.tirePatch +
    fields.carWash +
    fields.taxInsurance +
    fields.installment +
    fields.repairInstallment +
    fields.downPaymentInstallment

  return { totalIncome, totalDeductions, netPay: totalIncome - totalDeductions }
}
