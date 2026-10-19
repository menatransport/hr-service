import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import * as XLSX from "xlsx"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export const runtime = "nodejs"
export const maxDuration = 30

interface PreviewRow {
  contractCode: string
  transportFee: number
  fuel: number
  installment: number
  taxInsurance: number
  repairInstallment: number
  otherIncomeWHT: number
  otherIncomeNoWHT: number
  gps: number
  totalIncome: number
  totalDeductions: number
  netPay: number
}

/**
 * POST /api/import/preview
 * Body: multipart/form-data with file=<xlsx> and month=YYYY-MM
 *
 * Parses the Summary sheet and returns a preview array.
 * Does NOT write to DB.
 */
export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

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

  const buffer    = Buffer.from(await file.arrayBuffer())
  const workbook  = XLSX.read(buffer, { type: "buffer" })

  if (!workbook.SheetNames.includes("Summary")) {
    return NextResponse.json({ error: "Sheet 'Summary' not found in workbook" }, { status: 422 })
  }

  const ws   = workbook.Sheets["Summary"]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as (string | number | null)[][]

  function toNum(v: string | number | null): number {
    if (v === null || v === undefined || v === "") return 0
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""))
    return isNaN(n) ? 0 : n
  }

  const preview: PreviewRow[] = []

  for (const row of rows) {
    const code = row[0]
    if (!code || !/^MT[LM]\d+/.test(String(code))) continue

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

    const totalIncome      = transportFee + ot + otherIncomeWHT + otherIncomeNoWHT
    const totalDeductions  = fuel + gps + repairInHouse + repairOutside + mgmtFee8pct +
                             labor + tire + tirePatch + carWash + taxInsurance +
                             installment + repairInstallment + downPayment

    preview.push({
      contractCode:    String(code).trim(),
      transportFee,
      fuel,
      installment,
      taxInsurance,
      repairInstallment,
      otherIncomeWHT,
      otherIncomeNoWHT,
      gps,
      totalIncome:     Math.round(totalIncome * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netPay:          Math.round((totalIncome - totalDeductions) * 100) / 100,
    })
  }

  return NextResponse.json({ month, rows: preview, count: preview.length })
}
