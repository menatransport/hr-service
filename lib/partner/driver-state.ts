/**
 * สถานะการผ่อนของคนขับ (derived — ไม่เก็บใน DB)
 *   paying  = Active ผ่อนชำระอยู่
 *   paidoff = Active ปิดงวดแล้ว
 *
 * ลำดับตัดสิน (ต่อ contractCode):
 *  1. contracts.status === "completed" (กดปิดงวดเอง)                     → paidoff
 *  2. มี driver_ledger ค่างวดรถ (source.type vehicle_installment, ไม่ cancelled)
 *     ทุกใบ paid หรือ paidAmount >= principal − 0.005                    → paidoff
 *     ยังเหลือใบใดใบหนึ่ง                                                → paying
 *  3. ไม่มี ledger ค่างวด: ไม่มีสัญญาในระบบ → paying (คนขับใหม่/รหัสหาไม่เจอ)
 *     contracts.monthlyInstallment > 0 → paying · ไม่มีค่างวดเลย → paidoff
 */
import type { Db } from "mongodb"

export type InstallmentState = "paying" | "paidoff"

/** สถานะที่ GET /api/drivers?status= กรองได้: active/inactive (ดิบ) + paying/paidoff (active แยกตามการผ่อน) + exit (inactive ที่บันทึกพ้นสภาพ) */
export type DriverListStatus = "" | "active" | "inactive" | "paying" | "paidoff" | "exit"

export const EXIT_TYPE_LABEL: Record<"paid_exit" | "early_exit", string> = {
  paid_exit:  "ผ่อนหมดแล้ว · เอารถออกจากระบบ",
  early_exit: "ผ่อนไม่หมด · โดนปลด/คืนรถ",
}

export const INSTALLMENT_LABEL: Record<InstallmentState, string> = {
  paying:  "ผ่อนชำระ",
  paidoff: "ปิดงวดแล้ว",
}

export async function computeInstallmentStates(db: Db, codes: string[]): Promise<Map<string, InstallmentState>> {
  const out = new Map<string, InstallmentState>()
  const uniq = [...new Set(codes.map((c) => (c ?? "").trim()).filter(Boolean))]
  if (uniq.length === 0) return out

  const [contracts, ledgers] = await Promise.all([
    db.collection("contracts")
      .find({ contractCode: { $in: uniq } }, { projection: { contractCode: 1, status: 1, monthlyInstallment: 1 } })
      .toArray(),
    db.collection("driver_ledger")
      .find(
        { contractCode: { $in: uniq }, "source.type": "vehicle_installment", status: { $ne: "cancelled" } },
        { projection: { contractCode: 1, status: 1, principal: 1, paidAmount: 1 } },
      )
      .toArray(),
  ])

  const contractByCode = new Map<string, { status?: string; monthlyInstallment?: number }>()
  for (const c of contracts) {
    const code = String(c.contractCode ?? "").trim()
    // ถ้ามีหลายสัญญารหัสเดียวกัน ให้ active ชนะ
    if (!contractByCode.has(code) || c.status === "active") contractByCode.set(code, c as { status?: string; monthlyInstallment?: number })
  }
  const ledgerByCode = new Map<string, { status?: string; principal?: number; paidAmount?: number }[]>()
  for (const l of ledgers) {
    const code = String(l.contractCode ?? "").trim()
    const arr = ledgerByCode.get(code) ?? []
    arr.push(l as { status?: string; principal?: number; paidAmount?: number })
    ledgerByCode.set(code, arr)
  }

  for (const code of uniq) {
    const ct = contractByCode.get(code)
    if (ct?.status === "completed") { out.set(code, "paidoff"); continue }
    const ls = ledgerByCode.get(code) ?? []
    if (ls.length > 0) {
      const allPaid = ls.every((l) => l.status === "paid" || (Number(l.paidAmount ?? 0) >= Number(l.principal ?? 0) - 0.005))
      out.set(code, allPaid ? "paidoff" : "paying")
      continue
    }
    // ไม่มีสัญญาในระบบเลย (รหัสหาไม่เจอ/คนขับใหม่) → ถือเป็นผ่อนชำระ (ปิดงวดต้องมีสัญญาจริงยืนยัน)
    if (!ct) { out.set(code, "paying"); continue }
    out.set(code, Number(ct.monthlyInstallment ?? 0) > 0 ? "paying" : "paidoff")
  }
  return out
}
