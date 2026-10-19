import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import * as XLSX from "xlsx"

export const runtime = "nodejs"
export const maxDuration = 60

const DB = PARTNER_DB

/**
 * POST /api/import/confirm
 * Body: multipart/form-data with file=<xlsx> and month=YYYY-MM
 *
 * Parses Summary sheet and upserts all payroll_entries for the month.
 * Returns { upserted, modified, errors }
 */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session || !hasPerm(session.user?.role, "finance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file     = formData.get("file") as File | null
  const month    = (formData.get("month") as string | null)?.trim() ?? ""

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const buffer   = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })

  if (!workbook.SheetNames.includes("Summary")) {
    return NextResponse.json({ error: "Sheet 'Summary' not found" }, { status: 422 })
  }

  const ws   = workbook.Sheets["Summary"]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as (string | number | null)[][]

  function toNum(v: string | number | null): number {
    if (v === null || v === undefined || v === "") return 0
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""))
    return isNaN(n) ? 0 : n
  }

  const client = await clientPromise
  const db     = client.db(DB)
  const col    = db.collection("payroll_entries")
  const now    = new Date().toISOString()

  let upserted = 0
  let modified = 0
  let errors   = 0

  for (const row of rows) {
    const code = row[0]
    if (!code || !/^MT[LM]\d+/.test(String(code))) continue

    const contractCode     = String(code).trim()
    const transportFee     = toNum(row[10])
    const ot               = toNum(row[11])
    const otherIncomeWHT   = toNum(row[12])
    const otherIncomeNoWHT = toNum(row[13])
    const fuel             = toNum(row[14])
    const gps              = toNum(row[15])
    const repairInHouse    = Math.max(0, toNum(row[16]))
    const repairOutside    = toNum(row[17])
    const mgmtFee8pct      = toNum(row[18])
    const labor            = toNum(row[19])
    const tire             = toNum(row[20])
    const tirePatch        = toNum(row[21])
    const carWash          = toNum(row[22])
    const taxInsurance     = toNum(row[23])
    const installment      = toNum(row[27])
    const repairInstallment= toNum(row[28])
    const downPayment      = toNum(row[30])
    const workingDays      = Math.round(toNum(row[8]))
    const tripCount        = Math.round(toNum(row[9]))

    const totalIncome     = transportFee + ot + otherIncomeWHT + otherIncomeNoWHT
    const totalDeductions = fuel + gps + repairInHouse + repairOutside + mgmtFee8pct +
                            labor + tire + tirePatch + carWash + taxInsurance +
                            installment + repairInstallment + downPayment

    const doc = {
      contractCode,
      month,
      workingDays,
      tripCount,
      transportFee,
      ot,
      otherIncomeWHT,
      otherIncomeNoWHT,
      fuel,
      gps,
      repairInHouse,
      repairOutside,
      mgmtFee8pct,
      labor,
      tire,
      tirePatch,
      carWash,
      taxInsurance,
      installment,
      repairInstallment,
      downPaymentInstallment: downPayment,
      totalIncome:     Math.round(totalIncome * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netPay:          Math.round((totalIncome - totalDeductions) * 100) / 100,
      updatedAt: now,
    }

    try {
      const r = await col.updateOne(
        { contractCode, month },
        { $set: doc, $setOnInsert: { createdAt: now } },
        { upsert: true }
      )
      if (r.upsertedCount > 0) upserted++
      else if (r.modifiedCount > 0) modified++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ upserted, modified, errors, month })
}
