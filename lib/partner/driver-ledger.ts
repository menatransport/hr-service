import "server-only"
import { ObjectId } from "mongodb"

/**
 * Unified driver debt/deposit ledger (สมุดหนี้/เงินสะสม พขร.)
 *
 * - debt:    เริ่มด้วยยอดหนี้ (principal) หักรายเดือนจน paidAmount ครบ → status "paid"
 * - deposit: เงินสะสมล่วงหน้า เริ่มจาก 0 สะสมผ่านการหักรายเดือน
 *            มี targetAmount ได้ (ถึงเพดานแล้วหยุดหัก) และถอนออกได้เมื่อเกิดค่าใช้จ่ายจริง
 *
 * การหักเป็นแบบ balance-driven ไม่ผูกปฏิทิน — เดือนที่ skip แค่เลื่อนงวดออกไป
 *
 * Collections:
 *   driver_ledger      — ตัว entry
 *   ledger_payments    — {entryId, debtCode, contractCode, month, amount, payrollRef, at}   unique (entryId, month)
 *   ledger_skips       — {entryId, month, reason, by, at, overrideAmount?}                  unique (entryId, month)
 *   ledger_withdrawals — {entryId, amount, note, refMR, by, at}   (deposit เท่านั้น)
 *   ledger_counters    — running number ของ debtCode ต่อเดือน
 */

export const LEDGER_KINDS = ["debt", "deposit"] as const
export type LedgerKind = typeof LEDGER_KINDS[number]

export const SOURCE_TYPES = ["insurance", "prb", "tax", "inspection", "personal", "debt_acceptance", "down_payment", "vehicle_installment", "tire_deposit", "security_deposit", "manual"] as const
export type SourceType = typeof SOURCE_TYPES[number]

export const SOURCE_LABELS: Record<SourceType, string> = {
  insurance: "ประกันภัย",
  prb: "พรบ.",
  tax: "ภาษีทะเบียน",
  inspection: "ตรวจสภาพ",
  personal: "ประกันภาคสมัครใจ (บุคคล)",
  debt_acceptance: "ใบรับสภาพหนี้",
  down_payment: "เงินดาวน์",
  vehicle_installment: "ค่างวดรถ",
  tire_deposit: "เงินสะสมค่ายาง",
  security_deposit: "เงินประกัน",
  manual: "อื่นๆ",
}

export interface LedgerEntry {
  _id?: string
  debtCode: string            // DB2607-001 running ต่อเดือน (ledger_counters)
  kind: LedgerKind
  contractCode?: string
  licensePlate?: string
  platePlain?: string
  driverName?: string
  source: { type: SourceType; refId?: string; refLabel?: string }
  principal?: number          // debt เท่านั้น
  targetAmount?: number       // deposit เท่านั้น (optional เพดานสะสม)
  monthlyAmount: number
  startMonth: string          // "YYYY-MM"
  paidAmount: number          // สะสมยอดที่หักแล้ว (deposit: = balance ก่อนหักถอน)
  openingPaid?: number        // ยอดที่ผ่อนมาแล้วก่อนเข้าระบบ (migrate) — รวมอยู่ใน paidAmount แล้ว
  withdrawnAmount?: number    // deposit เท่านั้น
  status: "active" | "paid" | "paused" | "cancelled"
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

const LEDGER   = "driver_ledger"
const PAYMENTS = "ledger_payments"
const SKIPS    = "ledger_skips"
const COUNTERS = "ledger_counters"

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** สร้าง debtCode "DB" + YYMM + "-" + running 3 หลัก ต่อเดือน (atomic ผ่าน ledger_counters) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextDebtCode(db: any): Promise<string> {
  const now = new Date()
  const yymm = `${String(now.getFullYear() % 100).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}`
  const key = `DB${yymm}`
  const doc = await db.collection(COUNTERS).findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  )
  const seq = (doc?.seq as number) ?? 1
  return `${key}-${String(seq).padStart(3, "0")}`
}

/** ยอดหักตามกติกาของ entry เดียวสำหรับเดือน month (ยังไม่คิด skip/override) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseDeduction(entry: any, month: string): number {
  if (entry.status !== "active") return 0
  if (!entry.startMonth || month < entry.startMonth) return 0
  const monthly = (entry.monthlyAmount as number) ?? 0
  if (monthly <= 0) return 0

  if (entry.kind === "debt") {
    const principal = (entry.principal as number) ?? 0
    const remaining = principal - ((entry.paidAmount as number) ?? 0)
    return round2(Math.max(0, Math.min(monthly, remaining)))
  }

  // deposit
  if (entry.targetAmount != null && entry.targetAmount > 0) {
    const balance = ((entry.paidAmount as number) ?? 0) - ((entry.withdrawnAmount as number) ?? 0)
    const room = (entry.targetAmount as number) - balance
    return round2(Math.max(0, Math.min(monthly, room)))
  }
  return round2(monthly)
}

/**
 * ยอดหักของทุก entry ของสัญญาสำหรับเดือน M
 * กติกาต่อ entry: skip → 0, paused/cancelled/paid → 0, M < startMonth → 0,
 * override → overrideAmount, debt → min(monthly, principal−paid),
 * deposit → min(monthly, target−(paid−withdrawn)) ถ้ามี target ไม่งั้น monthly
 * label = `${SOURCE_LABELS[type]}${refLabel ? " "+refLabel : ""} (งวดที่ n)` — n = จำนวน payment เดิม + 1
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getLedgerDeductions(db: any, contractCode: string, month: string): Promise<{ entryId: string; debtCode: string; label: string; amount: number; type?: string }[]> {
  const entries = await db.collection(LEDGER)
    .find({ contractCode, status: "active", startMonth: { $lte: month } })
    .toArray()
  if (entries.length === 0) return []

  const ids = entries.map((e: { _id: ObjectId }) => e._id.toString())

  const [skips, payCounts] = await Promise.all([
    db.collection(SKIPS).find({ entryId: { $in: ids }, month }).toArray(),
    db.collection(PAYMENTS).aggregate([
      { $match: { entryId: { $in: ids } } },
      { $group: { _id: "$entryId", count: { $sum: 1 } } },
    ]).toArray(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skipByEntry = new Map<string, any>(skips.map((s: { entryId: string }) => [s.entryId, s]))
  const countByEntry = new Map<string, number>(payCounts.map((p: { _id: string; count: number }) => [p._id, p.count]))

  const out: { entryId: string; debtCode: string; label: string; amount: number; type?: string }[] = []
  for (const entry of entries) {
    const entryId = entry._id.toString()
    const skip = skipByEntry.get(entryId)

    let amount: number
    if (skip) {
      // skip = 0, override = overrideAmount > 0
      amount = skip.overrideAmount != null && skip.overrideAmount > 0 ? round2(skip.overrideAmount) : 0
    } else {
      amount = baseDeduction(entry, month)
    }
    if (amount <= 0) continue

    // งวดที่ n = งวดที่หักผ่านระบบ + งวดที่ผ่อนมาก่อน migrate (openingPaid ÷ ยอด/เดือน)
    const openingInstallments = entry.openingPaid && entry.monthlyAmount
      ? Math.round((entry.openingPaid as number) / (entry.monthlyAmount as number))
      : 0
    const n = (countByEntry.get(entryId) ?? 0) + openingInstallments + 1
    const srcType = (entry.source?.type ?? "manual") as SourceType
    const refLabel = entry.source?.refLabel as string | undefined
    const label = `${SOURCE_LABELS[srcType] ?? srcType}${refLabel ? " " + refLabel : ""} (งวดที่ ${n})`

    out.push({ entryId, debtCode: entry.debtCode as string, label, amount, type: (entry.source?.type as string) ?? undefined })
  }
  return out
}

/**
 * ตัดยอดจริงตอนปิดเดือน: เขียน ledger_payments + เพิ่ม paidAmount + ปิด debt ที่ครบ
 * Idempotent: ถ้ามี payment (entryId, month) แล้ว ข้าม (unique index กันซ้ำอีกชั้น)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function settleLedgerMonth(db: any, contractCode: string, month: string, payrollRef?: string): Promise<{ settled: number; total: number }> {
  const deductions = await getLedgerDeductions(db, contractCode, month)
  let settled = 0
  let total = 0
  const now = new Date().toISOString()

  for (const d of deductions) {
    const existing = await db.collection(PAYMENTS).findOne({ entryId: d.entryId, month })
    if (existing) continue

    try {
      await db.collection(PAYMENTS).insertOne({
        entryId: d.entryId,
        debtCode: d.debtCode,
        contractCode,
        month,
        amount: d.amount,
        payrollRef: payrollRef ?? null,
        at: now,
      })
    } catch (e: unknown) {
      // duplicate key จาก unique index (race) → เดือนนี้ถูกตัดไปแล้ว ข้าม
      if (e && typeof e === "object" && "code" in e && (e as { code: number }).code === 11000) continue
      throw e
    }

    const updated = await db.collection(LEDGER).findOneAndUpdate(
      { _id: new ObjectId(d.entryId) },
      { $inc: { paidAmount: d.amount }, $set: { updatedAt: now } },
      { returnDocument: "after" }
    )

    // debt ครบยอด → ปิดเป็น paid (เผื่อเศษทศนิยม 0.005)
    if (updated && updated.kind === "debt" && updated.principal != null &&
        (updated.paidAmount as number) >= (updated.principal as number) - 0.005) {
      await db.collection(LEDGER).updateOne(
        { _id: new ObjectId(d.entryId), status: "active" },
        { $set: { status: "paid", updatedAt: now } }
      )
    }

    settled++
    total += d.amount
  }

  return { settled, total: round2(total) }
}
