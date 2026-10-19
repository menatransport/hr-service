import "server-only"
import type { Db } from "mongodb"

/** ระบบขาย — ใบเสนอราคา + CRM (เฟส 1) */

export const QUOTE_COLL = "quotations"
export const CUSTOMER_COLL = "customers"
const COUNTERS = "ledger_counters" // ใช้ counter กลางร่วม (คนละ key)

export type QuoteStatus = "lead" | "quoted" | "booked" | "won" | "lost"
export const QUOTE_STATUSES: QuoteStatus[] = ["lead", "quoted", "booked", "won", "lost"]
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  lead: "สนใจ", quoted: "เสนอราคาแล้ว", booked: "วางจอง", won: "ปิดการขาย", lost: "ยกเลิก",
}

export interface QuotePricing {
  totalSalePrice: number
  downPayment: number
  cashDown: number
  /** เงินสะสม พจส. ที่นำมาใช้ — บันทึกไว้เฉย ๆ ไม่นำไปหักดาวน์/ไฟแนนซ์ */
  savingsUsed?: number
  downInstallmentCount: number
  downInstallmentAmt: number
  financeAmount: number
  financeInstallments: number
  monthlyPayment: number
}

export interface Quotation extends QuotePricing {
  _id?: string
  quotationNo: string            // QT-YYMM-nnn
  status: QuoteStatus
  // ลูกค้า (snapshot ชื่อ ณ วันเสนอ + อ้าง id)
  customerId?: string
  customerName: string
  customerPhone?: string
  // รถ (snapshot)
  licensePlate: string
  vehicleBrand?: string
  vehicleModel?: string
  truckNumber?: string
  vehiclePhotoUrl?: string
  vehiclePhotos?: { front?: string; back?: string; left?: string; right?: string; cabin?: string }
  // ของแถม/เงื่อนไข
  extras?: string
  note?: string
  validUntil?: string            // YYYY-MM-DD
  // เงินจอง (เฟส 2 เติมสลิป — เก็บ field ไว้ก่อน)
  depositAmount?: number
  depositSlipUrl?: string          // (เดิม — ใบเดียว)
  depositSlips?: string[]          // สลิปหลายใบ (สูงสุด 10)
  depositPaidAt?: string
  // ขายโดย (ผู้ใช้ login)
  salesEmail: string
  salesName: string
  // audit
  createdAt: string
  updatedAt: string
  timeline?: { at: string; by: string; action: string; note?: string }[]
}

/** เลขที่ใบเสนอ QT + YYMM + running 3 หลักต่อเดือน (atomic) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextQuotationNo(db: Db | any): Promise<string> {
  const now = new Date()
  const yymm = `${String(now.getFullYear() % 100).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`
  const key = `QT${yymm}`
  const doc = await db.collection(COUNTERS).findOneAndUpdate(
    { _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" })
  return `${key.slice(0, 2)}-${yymm}-${String((doc?.seq as number) ?? 1).padStart(3, "0")}`
}
