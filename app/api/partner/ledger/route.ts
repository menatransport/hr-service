/* eslint-disable prefer-const -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { logActivity } from "@/lib/partner/activity-log"
import { normPlateIT } from "@/lib/partner/insurance-tax"
import {
  LEDGER_KINDS,
  SOURCE_TYPES,
  nextDebtCode,
  type LedgerEntry,
  type LedgerKind,
  type SourceType,
} from "@/lib/partner/driver-ledger"

const DB   = PARTNER_DB
const COLL = "driver_ledger"

const MONTH_RE = /^\d{4}-\d{2}$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * GET /api/ledger
 *   ?contractCode=MTL003 → ทุก entry ของสัญญานั้น (ทุกสถานะ)
 *   ?plate=71-1515       → ทุก entry ของทะเบียนนั้น (ทุกสถานะ)
 *   (ไม่มี param)         → entry ที่ active ทั้งหมด
 * ทุกแบบ enrich ด้วย remaining / balance / monthsPaid / lastPayment
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const contractCode = searchParams.get("contractCode")?.trim() ?? ""
  const plate        = searchParams.get("plate")?.trim() ?? ""

  const client = await clientPromise
  const db     = client.db(DB)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (contractCode) filter.contractCode = contractCode
  else if (plate)   filter.platePlain = normPlateIT(plate) || plate
  else              filter.status = "active"

  const docs = await db.collection(COLL)
    .find(filter)
    .sort({ contractCode: 1, createdAt: -1 })
    .toArray()

  const ids = docs.map((d) => d._id.toString())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payByEntry = new Map<string, any>()
  if (ids.length > 0) {
    const payAgg = await db.collection("ledger_payments").aggregate([
      { $match: { entryId: { $in: ids } } },
      { $sort: { month: 1 } },
      {
        $group: {
          _id: "$entryId",
          count: { $sum: 1 },
          lastMonth:  { $last: "$month" },
          lastAmount: { $last: "$amount" },
          lastAt:     { $last: "$at" },
        },
      },
    ]).toArray()
    for (const p of payAgg) payByEntry.set(p._id as string, p)
  }

  const entries = docs.map((d) => {
    const pay = payByEntry.get(d._id.toString())
    const paid      = (d.paidAmount as number) ?? 0
    const withdrawn = (d.withdrawnAmount as number) ?? 0
    const remaining = d.kind === "debt" ? round2(Math.max(0, ((d.principal as number) ?? 0) - paid)) : null
    const balance   = d.kind === "deposit" ? round2(paid - withdrawn) : null
    return {
      ...d,
      _id: d._id.toString(),
      remaining,
      balance,
      monthsPaid: (pay?.count as number) ?? 0,
      lastPayment: pay ? { month: pay.lastMonth as string, amount: pay.lastAmount as number, at: pay.lastAt as string } : null,
    }
  })

  return NextResponse.json({ entries })
}

/**
 * POST /api/ledger — สร้าง entry ใหม่
 * body ปกติ: { kind, contractCode, licensePlate?, driverName?, source: {type, refId?, refLabel?},
 *              principal? (debt), targetAmount? (deposit), monthlyAmount? , installmentCount?,
 *              startMonth?, notes? }
 * convertFrom พิเศษ:
 *   { convertFrom: { type: "insurance_item", itemId } }  → ดึงยอดจาก vehicle_insurance_tax
 *     แล้วล้าง field การหักของ item นั้น (กัน payroll หักซ้ำ)
 *   { convertFrom: { type: "debt_acceptance", id } }     → ดึงยอดจาก debt_acceptances
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const session = await getPartnerSession()

  const client = await clientPromise
  const db     = client.db(DB)
  const now    = new Date().toISOString()
  const currentMonth = now.slice(0, 7)

  let kind: LedgerKind = body.kind
  let contractCode: string | undefined = body.contractCode?.trim() || undefined
  let licensePlate: string | undefined = body.licensePlate?.trim() || undefined
  let driverName: string | undefined   = body.driverName?.trim() || undefined
  let source: { type: SourceType; refId?: string; refLabel?: string } | undefined = body.source
  let principal: number | undefined      = typeof body.principal === "number" ? body.principal : undefined
  const targetAmount: number | undefined = typeof body.targetAmount === "number" ? body.targetAmount : undefined
  let monthlyAmount: number | undefined  = typeof body.monthlyAmount === "number" ? body.monthlyAmount : undefined
  let installmentCount: number | undefined = typeof body.installmentCount === "number" ? body.installmentCount : undefined
  let startMonth: string | undefined     = body.startMonth?.trim() || undefined
  let notes: string | undefined          = body.notes?.trim() || undefined

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let insuranceItemToClear: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let debtAcceptanceToMark: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contractToMark: any = null

  // ── convertFrom: insurance_item ───────────────────────────────────────────
  if (body.convertFrom?.type === "insurance_item") {
    const itemId = body.convertFrom.itemId as string
    if (!itemId || !ObjectId.isValid(itemId)) {
      return NextResponse.json({ error: "convertFrom.itemId invalid" }, { status: 400 })
    }
    const item = await db.collection("vehicle_insurance_tax").findOne({ _id: new ObjectId(itemId) })
    if (!item) return NextResponse.json({ error: "insurance item not found" }, { status: 404 })
    if (!item.itemType || !((item.amount as number) > 0)) {
      return NextResponse.json({ error: "insurance item has no amount to convert" }, { status: 400 })
    }
    kind = "debt"
    principal = item.amount as number
    source = { type: item.itemType as SourceType, refId: itemId, refLabel: item.licensePlate as string }
    licensePlate = licensePlate ?? (item.licensePlate as string)
    monthlyAmount = monthlyAmount ?? (item.monthlyInstallment as number | undefined) ?? undefined
    installmentCount = installmentCount ?? (item.installmentCount as number | undefined) ?? undefined
    startMonth = startMonth ?? (item.collectStart as string | undefined) ?? undefined
    insuranceItemToClear = item
    // สัญญา/พขร. ปัจจุบันของทะเบียนนี้ ถ้า caller ไม่ได้ส่งมา
    if (!contractCode) {
      const platePlain = normPlateIT(licensePlate ?? "")
      const contracts = await db.collection("contracts")
        .find({ status: "active" })
        .project({ contractCode: 1, licensePlate: 1, driverName: 1 })
        .toArray()
      const ct = contracts.find((c) => normPlateIT(c.licensePlate as string) === platePlain)
      if (ct) {
        contractCode = ct.contractCode as string
        driverName = driverName ?? (ct.driverName as string | undefined)
      }
    }
  }

  // ── convertFrom: debt_acceptance ──────────────────────────────────────────
  if (body.convertFrom?.type === "debt_acceptance") {
    const daId = body.convertFrom.id as string
    if (!daId || !ObjectId.isValid(daId)) {
      return NextResponse.json({ error: "convertFrom.id invalid" }, { status: 400 })
    }
    const da = await db.collection("debt_acceptances").findOne({ _id: new ObjectId(daId) })
    if (!da) return NextResponse.json({ error: "debt acceptance not found" }, { status: 404 })

    // กันแปลงซ้ำ — ถ้าใบนี้ถูกแปลงเป็นรายการหนี้ไปแล้ว
    if (da.ledgerDebtCode) {
      return NextResponse.json(
        { error: `ใบนี้ถูกแปลงเป็นรายการหนี้แล้ว (${da.ledgerDebtCode})`, ledgerDebtCode: da.ledgerDebtCode },
        { status: 409 }
      )
    }
    debtAcceptanceToMark = da

    // ยอดหนี้คงเหลือจริง: outstandingBalance ก่อน, fallback liability − totalPaid
    const liability   = (da.liabilityAmount as number) ?? (da.fullDamageAmount as number) ?? 0
    const outstanding = typeof da.outstandingBalance === "number"
      ? da.outstandingBalance
      : round2(liability - ((da.totalPaid as number) ?? 0))
    if (!(outstanding > 0)) {
      return NextResponse.json({ error: "debt acceptance has no outstanding balance" }, { status: 400 })
    }
    kind = "debt"
    principal = principal ?? outstanding   // ให้ปรับยอดในป๊อปอัปได้ (default = ยอดคงค้าง)
    source = { type: "debt_acceptance", refId: daId, refLabel: da.debtAcceptanceNo as string }
    contractCode = contractCode ?? (da.contractCode as string | undefined)
    licensePlate = licensePlate ?? (da.licensePlate as string | undefined)
    driverName = driverName ?? (da.employeeName as string | undefined)
    monthlyAmount = monthlyAmount ?? (da.monthlyInstallment as number | undefined) ?? undefined
    installmentCount = installmentCount ?? (da.installmentCount as number | undefined) ?? undefined
    startMonth = startMonth ?? (typeof da.startDate === "string" && da.startDate.length >= 7 ? da.startDate.slice(0, 7) : undefined)
  }

  // ── convertFrom: contract (ค่างวดรถ / เช่าซื้อ) ────────────────────────────
  if (body.convertFrom?.type === "contract") {
    const ctId = body.convertFrom.id as string
    if (!ctId || !ObjectId.isValid(ctId)) {
      return NextResponse.json({ error: "convertFrom.id invalid" }, { status: 400 })
    }
    const ct = await db.collection("contracts").findOne({ _id: new ObjectId(ctId) })
    if (!ct) return NextResponse.json({ error: "contract not found" }, { status: 404 })
    if (ct.ledgerDebtCode) {
      return NextResponse.json(
        { error: `สัญญานี้สร้างรายการผ่อนรถแล้ว (${ct.ledgerDebtCode})`, ledgerDebtCode: ct.ledgerDebtCode },
        { status: 409 }
      )
    }
    const monthly = (ct.monthlyInstallment as number) ?? 0
    const count   = (ct.totalInstallments as number) ?? 0
    if (!(monthly > 0) || !(count > 0)) {
      return NextResponse.json({ error: "สัญญาไม่มีค่างวด/จำนวนงวด" }, { status: 400 })
    }
    contractToMark = ct
    kind = "debt"
    // ยอดรวม = ค่างวด × จำนวนงวด (ตามที่เคาะ)
    principal = principal ?? round2(monthly * count)
    monthlyAmount = monthlyAmount ?? monthly
    installmentCount = installmentCount ?? count
    source = { type: "vehicle_installment", refId: ctId, refLabel: ct.contractCode as string }
    contractCode = contractCode ?? (ct.contractCode as string | undefined)
    licensePlate = licensePlate ?? (ct.licensePlate as string | undefined)
    driverName = driverName ?? (ct.driverName as string | undefined)
    startMonth = startMonth ?? (typeof ct.startDate === "string" && ct.startDate.length >= 7 ? ct.startDate.slice(0, 7) : undefined)
  }

  // ── validation ────────────────────────────────────────────────────────────
  if (!LEDGER_KINDS.includes(kind)) {
    return NextResponse.json({ error: `kind must be one of: ${LEDGER_KINDS.join(", ")}` }, { status: 400 })
  }
  if (!source || !SOURCE_TYPES.includes(source.type)) {
    return NextResponse.json({ error: `source.type must be one of: ${SOURCE_TYPES.join(", ")}` }, { status: 400 })
  }
  if (!contractCode) {
    return NextResponse.json({ error: "contractCode required" }, { status: 400 })
  }
  if (kind === "debt" && !(principal !== undefined && principal > 0)) {
    return NextResponse.json({ error: "principal > 0 required for kind debt" }, { status: 400 })
  }
  // auto monthlyAmount = principal / installmentCount ถ้าให้จำนวนงวดมาแต่ไม่ให้ยอด/เดือน
  if (kind === "debt" && (monthlyAmount === undefined || monthlyAmount <= 0) && installmentCount && installmentCount > 0) {
    monthlyAmount = round2((principal as number) / installmentCount)
  }
  if (monthlyAmount === undefined || !(monthlyAmount > 0)) {
    return NextResponse.json({ error: "monthlyAmount > 0 required (or provide installmentCount for debt)" }, { status: 400 })
  }
  startMonth = startMonth ?? currentMonth
  if (!MONTH_RE.test(startMonth)) {
    return NextResponse.json({ error: "startMonth must be YYYY-MM" }, { status: 400 })
  }
  if (kind === "deposit" && targetAmount !== undefined && !(targetAmount > 0)) {
    return NextResponse.json({ error: "targetAmount must be > 0" }, { status: 400 })
  }
  // migrate: ยอดที่ผ่อนมาแล้วก่อนเข้าระบบ (debt เท่านั้น; ต้องน้อยกว่ายอดรวม)
  const alreadyPaid = typeof body.alreadyPaid === "number" && body.alreadyPaid > 0 ? round2(body.alreadyPaid) : 0
  if (alreadyPaid > 0) {
    if (kind !== "debt") return NextResponse.json({ error: "alreadyPaid ใช้ได้กับหนี้เท่านั้น" }, { status: 400 })
    if (alreadyPaid >= (principal as number)) return NextResponse.json({ error: "alreadyPaid ต้องน้อยกว่ายอดหนี้รวม" }, { status: 400 })
  }

  const debtCode = await nextDebtCode(db)

  const entry: LedgerEntry = {
    debtCode,
    kind,
    contractCode,
    licensePlate,
    platePlain: licensePlate ? (normPlateIT(licensePlate) || licensePlate) : undefined,
    driverName,
    source,
    ...(kind === "debt" ? { principal: round2(principal as number) } : {}),
    ...(kind === "deposit" && targetAmount !== undefined ? { targetAmount: round2(targetAmount) } : {}),
    monthlyAmount: round2(monthlyAmount),
    startMonth,
    // migrate: ระบุยอดที่ผ่อนมาแล้วก่อนเข้าระบบได้ (ยอดรวม principal คงเต็ม)
    paidAmount: alreadyPaid,
    ...(alreadyPaid > 0 ? { openingPaid: alreadyPaid } : {}),
    ...(kind === "deposit" ? { withdrawnAmount: 0 } : {}),
    status: "active",
    notes,
    createdBy: session?.user?.email ?? undefined,
    createdAt: now,
    updatedAt: now,
  }

  const result = await db.collection(COLL).insertOne(entry as never)

  // ── debt acceptance: ทำ flag ว่าแปลงเป็นรายการหนี้แล้ว (กันแปลงซ้ำ + โชว์ลิงก์) ──
  if (debtAcceptanceToMark) {
    await db.collection("debt_acceptances").updateOne(
      { _id: debtAcceptanceToMark._id },
      { $set: { ledgerDebtCode: debtCode, ledgerConvertedAt: now, updatedAt: now } }
    )
  }

  // ── contract: ทำ flag รายการผ่อนรถที่สร้างใน ledger (กันสร้างซ้ำ + ลิงก์) ──
  if (contractToMark) {
    await db.collection("contracts").updateOne(
      { _id: contractToMark._id },
      { $set: { ledgerDebtCode: debtCode, ledgerConvertedAt: now, updatedAt: now } }
    )
  }

  // ── insurance item: ล้าง field การหักเดิม กัน payroll หักซ้ำ ────────────────
  if (insuranceItemToClear) {
    const oldNotes = (insuranceItemToClear.notes as string) ?? ""
    const moveNote = `ย้ายไปหักผ่าน ledger ${debtCode}`
    await db.collection("vehicle_insurance_tax").updateOne(
      { _id: insuranceItemToClear._id },
      {
        $set: {
          monthlyInstallment: null,
          installmentCount: null,
          collectStart: null,
          collectEnd: null,
          notes: oldNotes ? `${oldNotes}\n${moveNote}` : moveNote,
          updatedAt: now,
        },
      }
    )
  }

  await logActivity({
    entity: "driver_ledger",
    entityId: debtCode,
    action: "create",
    changes: {
      kind:          { from: null, to: entry.kind },
      source:        { from: null, to: entry.source?.type ?? null },
      ...(entry.principal != null ? { principal: { from: null, to: entry.principal } } : {}),
      monthlyAmount: { from: null, to: entry.monthlyAmount },
    },
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  return NextResponse.json({ ...entry, _id: result.insertedId.toString() }, { status: 201 })
}
