/**
 * เฟส 4 payroll: รายการรับ-หักอื่นๆ แบบมีชื่อ (payroll_extras)
 * แทนชีต รับอื่นๆ/หักอื่นๆ + ไฟล์แนบ (รถสะอาด, ครูฝึก, Incentive, ค่าน้ำไฟ, เบิกสำรอง, OT ลูกค้า ...)
 * ไฟล์นี้ pure — ใช้ได้ทั้ง client (labels) และ server
 */

export type ExtraKind = "income" | "deduct"

export interface ExtraType {
  key: string
  kind: ExtraKind
  label: string
  wht: boolean // ค่าเริ่มต้นหัก ณ ที่จ่าย (แก้รายแถวได้)
}

// อ้างอิงคอลัมน์จริงจากชีต รับอื่นๆ / หักอื่นๆ ของไฟล์ Payroll
export const EXTRA_TYPES: ExtraType[] = [
  // ── รายรับ ──
  { key: "clean_truck",    kind: "income", label: "ค่ารถสะอาด",              wht: true },
  { key: "trainer",        kind: "income", label: "ค่าครูฝึก",                wht: true },
  { key: "incentive",      kind: "income", label: "Incentive",               wht: true },
  { key: "special_cust",   kind: "income", label: "เงินพิเศษวิ่งงานลูกค้า",   wht: true },
  { key: "ot_customer",    kind: "income", label: "ค่าล่วงเวลางานลูกค้า",     wht: true },
  { key: "referral",       kind: "income", label: "ค่าแนะนำ พจส./พจร.",      wht: true },
  { key: "head_allowance", kind: "income", label: "ค่าหัวหน้า พจส.",          wht: true },
  { key: "gold_bonus",     kind: "income", label: "โบนัสทอง",                wht: false },
  { key: "trip_refund",    kind: "income", label: "คืนค่าเที่ยวคิดขาด/ตกค้าง", wht: true },
  { key: "other_income",   kind: "income", label: "รับอื่นๆ",                 wht: true },
  // ── รายหัก ──
  { key: "utilities",       kind: "deduct", label: "ค่าน้ำ-ค่าไฟ",            wht: true },
  { key: "house_rent",      kind: "deduct", label: "ค่าเช่าบ้าน",             wht: true },
  { key: "dirty_truck",     kind: "deduct", label: "ค่ารถสกปรก",             wht: true },
  { key: "no_fuel_bill",    kind: "deduct", label: "ไม่ส่งบิลน้ำมัน",          wht: true },
  { key: "trip_deduct",     kind: "deduct", label: "ค่าเที่ยวหักคืน/โอนผิด",   wht: true },
  { key: "emergency_adv",   kind: "deduct", label: "เบิกเงินฉุกเฉิน",          wht: false },
  { key: "reserve_adv",     kind: "deduct", label: "เบิกสำรอง",               wht: false },
  { key: "accident_ins",    kind: "deduct", label: "ค่าประกันอุบัติเหตุ",      wht: false },
  { key: "fee_charge",      kind: "deduct", label: "ค่าธรรมเนียม",            wht: true },
  { key: "other_deduct",    kind: "deduct", label: "หักอื่นๆ",                 wht: true },
]

export const EXTRA_TYPE_MAP: Record<string, ExtraType> = Object.fromEntries(EXTRA_TYPES.map((t) => [t.key, t]))
