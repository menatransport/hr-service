import "server-only"

/** "สบ.71-1515" → "71-1515" (เหมือน normPlate ใน lib/contract-docx.ts) */
export function normPlateIT(p?: string | null): string {
  return (p ?? "").replace(/^[^0-9]*/, "").trim()
}

// ── รายการแยกรายประเภท (item-level) — รวมประกันภาคสมัครใจของตัวบุคคล (พขร.) ──
export const ITEM_TYPES = ["insurance", "prb", "tax", "inspection", "personal"] as const
export type ItemType = typeof ITEM_TYPES[number]
export const ITEM_LABELS: Record<ItemType, string> = {
  insurance: "ประกันภัย",
  prb: "พรบ.",
  tax: "ภาษีทะเบียน",
  inspection: "ตรวจสภาพ",
  personal: "ประกันภาคสมัครใจ (บุคคล)",
}

/** 1 doc = 1 รายการ (ประกัน/พรบ./ภาษี/ตรวจสภาพ) ต่ออายุแยกอิสระต่อกัน */
export interface InsuranceItem {
  _id?: string
  licensePlate: string          // canonical with สบ. prefix as given
  platePlain: string            // normalized (71-1515) — set on write, used for joins
  itemType: ItemType
  effectiveDate?: string        // ISO YYYY-MM-DD วันเริ่มคุ้มครอง/ต่ออายุ
  expiryDate?: string           // ISO YYYY-MM-DD วันหมดอายุ
  amount?: number               // ค่าใช้จ่ายของรายการนี้
  company?: string              // บริษัท (ใช้กับ insurance/prb)
  installmentCount?: number     // จำนวนงวดเรียกเก็บจาก พขร.
  monthlyInstallment?: number   // ยอดหัก/เดือน
  collectStart?: string         // "YYYY-MM" เดือนแรกที่หัก
  collectEnd?: string           // "YYYY-MM" เดือนสุดท้ายที่หัก
  status: "active" | "renewed"  // renewed = ถูกแทนที่ด้วยรอบใหม่แล้ว
  attachments?: { name: string; url: string }[]
  notes?: string
  migratedFrom?: string         // contractCode / ที่มา ถ้ามาจาก migration
  createdAt: string
  updatedAt: string
}

/** @deprecated โครงเก่าแบบ bundled (1 doc = ประกัน+พรบ.+ภาษี+ตรวจสภาพ)
 *  docs พวกนี้ถูก migrate เป็น InsuranceItem แล้ว (status "converted") — เก็บ type ไว้อ่านของเก่าเท่านั้น */
export interface InsuranceCycle {
  _id?: string
  licensePlate: string
  platePlain: string
  effectiveDate?: string
  expiryDate?: string
  insuranceCompany?: string
  insurer?: string
  insuranceAmount?: number
  prbAmount?: number
  taxAmount?: number
  inspectionCost?: number
  totalCost?: number
  installmentCount?: number
  monthlyInstallment?: number
  collectStart?: string
  collectEnd?: string
  status: "active" | "renewed" | "converted"
  attachments?: { name: string; url: string }[]
  notes?: string
  migratedFrom?: string
  createdAt: string
  updatedAt: string
}

const COLL = "vehicle_insurance_tax"
const EXPIRING_DAYS = 60

/** สถานะแสดงผล: active(ปกติ) | expiring(หมดใน<=60วัน) | expired | renewed */
export function cycleDisplayStatus(
  c: Pick<InsuranceItem, "expiryDate" | "status">,
  todayISO?: string
): "active" | "expiring" | "expired" | "renewed" {
  if (c.status === "renewed") return "renewed"
  if (!c.expiryDate) return "active"
  const today = todayISO ?? new Date().toISOString().slice(0, 10)
  if (c.expiryDate < today) return "expired"
  const limit = new Date(today + "T00:00:00Z")
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_DAYS)
  if (c.expiryDate <= limit.toISOString().slice(0, 10)) return "expiring"
  return "active"
}

/** เดือน "YYYY-MM" อยู่ในช่วง collectStart..collectEnd ของรายการหรือไม่
 *  (ไม่ระบุขอบไหน = เปิดปลายด้านนั้น — record จาก migration เก่าไม่มีช่วงหัก ให้หักต่อเนื่องตามพฤติกรรมเดิม) */
function monthInCollectRange(c: Pick<InsuranceItem, "collectStart" | "collectEnd">, month: string): boolean {
  if (c.collectStart && month < c.collectStart) return false
  if (c.collectEnd && month > c.collectEnd) return false
  return true
}

/** รวมยอดหักของ item docs 1 ทะเบียน: ต่อ itemType เอา doc createdAt ล่าสุดที่เดือนอยู่ในช่วงหัก
 *  แล้ว sum monthlyInstallment ?? 0 ข้ามทุก itemType — ไม่มี item doc เลย → null */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sumItemDeductions(items: any[], month: string): number | null {
  if (items.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byType = new Map<string, any[]>()
  for (const it of items) {
    const arr = byType.get(it.itemType) ?? []
    arr.push(it)
    byType.set(it.itemType, arr)
  }
  let sum = 0
  for (const arr of byType.values()) {
    const inRange = arr
      .filter((c) => monthInCollectRange(c, month))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    if (inRange.length > 0) sum += inRange[0].monthlyInstallment ?? 0
    // เดือนนอกช่วงหักทุกใบของ type นี้ → type นี้ contribute 0 (หยุดหัก)
  }
  return sum
}

/** ยอดหักประกัน/ภาษีของทะเบียนสำหรับเดือน payroll ("YYYY-MM") — item-level:
 *  - ทะเบียนไม่มี item doc เลย → null (ให้ caller fallback ไป field เดิมใน contract)
 *  - มี item docs → รวมยอดหักทุก itemType: ต่อ type เอาใบ createdAt ล่าสุดที่เดือนอยู่ในช่วง
 *    collectStart..collectEnd (ไม่ระบุ = เปิดปลาย) แล้วบวก monthlyInstallment ?? 0
 *    (type ที่เดือนอยู่นอกช่วงทุกใบ → 0)
 *  หมายเหตุ: docs bundled เก่า (ไม่มี itemType) ถูก exclude เสมอ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getInsuranceDeductionForPlate(db: any, licensePlate: string, month: string): Promise<number | null> {
  const platePlain = normPlateIT(licensePlate)
  if (!platePlain) return null
  const items = await db
    .collection(COLL)
    .find({ platePlain, itemType: { $exists: true } })
    .project({ itemType: 1, collectStart: 1, collectEnd: 1, monthlyInstallment: 1, createdAt: 1 })
    .toArray()
  return sumItemDeductions(items, month)
}

/** batch เวอร์ชันของข้างบน: คืน Map<platePlain, number|null> ครอบทุก plate ที่ส่งเข้า (plate ที่ไม่มี item doc → null) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getInsuranceDeductionMap(db: any, month: string, plates: string[]): Promise<Map<string, number | null>> {
  const plains = Array.from(new Set(plates.map(normPlateIT).filter(Boolean)))
  const out = new Map<string, number | null>()
  for (const p of plates) out.set(normPlateIT(p), null)
  if (plains.length === 0) return out

  const items = await db
    .collection(COLL)
    .find({ platePlain: { $in: plains }, itemType: { $exists: true } })
    .project({ platePlain: 1, itemType: 1, collectStart: 1, collectEnd: 1, monthlyInstallment: 1, createdAt: 1 })
    .toArray()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byPlate = new Map<string, any[]>()
  for (const c of items) {
    const arr = byPlate.get(c.platePlain) ?? []
    arr.push(c)
    byPlate.set(c.platePlain, arr)
  }
  for (const [plate, arr] of byPlate) out.set(plate, sumItemDeductions(arr, month))
  return out
}
