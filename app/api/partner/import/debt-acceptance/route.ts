import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import * as XLSX from "xlsx"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export const runtime = "nodejs"
export const maxDuration = 30

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(v: unknown): string {
  if (!v && v !== 0) return ""
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return ""
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  return s
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""))
  return isNaN(n) ? 0 : n
}

function str(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

// ── Extraction helpers ─────────────────────────────────────────────────────────

// Extract Thai commercial plate fragment (e.g. "70-6291") from free text.
// Works for "สบ.70-6291", "ทะเบียน 70-6291", etc.
function extractLicensePlate(text: string): string {
  if (!text) return ""
  const m = text.match(/\b(\d{2}-\d{4})\b/)
  return m ? m[1] : ""
}

// Extract truck identifier (ME###, NL##, etc.) from free text.
function extractTruckNumber(text: string): string {
  if (!text) return ""
  const m = text.match(/\b(ME\d+|NL\d+)\b/i)
  return m ? m[1].toUpperCase() : ""
}

// Normalize a license plate stored in the DB (may include province prefix like "สบ.")
// to just the XX-XXXX fragment so we can compare against extracted values.
function normalizePlate(plate: string): string {
  return extractLicensePlate(plate) || plate
}

// ── Row parser ────────────────────────────────────────────────────────────────

function parseRow(row: unknown[]) {
  const otherItems = str(row[12])
  let repairType = "อื่นๆ"
  if (otherItems.includes("ยาง"))         repairType = "tire"
  else if (str(row[10]))                   repairType = "repair"
  else if (str(row[11]))                   repairType = "accident"
  else if (otherItems.includes("อะไหล่")) repairType = "repair"

  const description = str(row[25])

  return {
    issueDate:          parseDate(row[0]),
    debtAcceptanceNo:   str(row[1]),
    branch:             str(row[2]),
    department:         str(row[3]),
    employeeCode:       str(row[4]),
    employeeName:       str(row[5]),
    driverStatus:       str(row[6]),
    vehicleType:        str(row[7]),
    driverAffiliation:  str(row[8]),
    repairOrderNo:      str(row[10]),
    accidentOrderNo:    str(row[11]),
    otherItems,
    repairType,
    fullDamageAmount:   toNum(row[13]),
    depreciationPeriod: str(row[14]),
    depreciationAmount: toNum(row[15]),
    liabilityAmount:    toNum(row[16]),
    installmentCount:   toNum(row[17]),
    monthlyInstallment: toNum(row[18]),
    startDate:          parseDate(row[19]),
    endDate:            parseDate(row[20]),
    actualPayDate:      parseDate(row[21]),
    totalPaid:          toNum(row[22]),
    outstandingBalance: toNum(row[23]),
    paymentMethod:      str(row[24]),
    description,
    status:             str(row[26]),
    paymentNotes:       str(row[27]),
    // Extracted from description text
    licensePlate:       extractLicensePlate(description),
    truckNumber:        extractTruckNumber(description),
  }
}

// ── POST handler (action = preview | confirm) ─────────────────────────────────

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("vehiclecost")
  if (perm instanceof Response) return perm

  const session = await getPartnerSession()
  if (!session || !hasPerm(session.user?.role, "vehiclecost")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file     = formData.get("file") as File | null
  const action   = (formData.get("action") as string | null) ?? "preview"

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 })

  const buffer   = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return NextResponse.json({ error: "ไม่พบชีตในไฟล์" }, { status: 422 })

  const ws  = workbook.Sheets[sheetName]
  const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]

  // Skip header rows — find first data row where col[1] looks like a debt code
  let dataStart = 1
  for (let i = 0; i < Math.min(5, all.length); i++) {
    if (str(all[i]?.[1]).match(/^[A-Z]{2,4}AD\d+/)) { dataStart = i; break }
  }

  const parsed = all
    .slice(dataStart)
    .filter((r) => str(r[1]).match(/^[A-Z]{2,4}AD\d+/))
    .map(parseRow)

  if (parsed.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง" }, { status: 422 })
  }

  const pdb = await partnerDb()
  const db     = pdb

  // ── Map 1: employeeCode → contractCode via drivers.staffCode ────────────────
  const empCodes = [...new Set(parsed.map((r) => r.employeeCode).filter(Boolean))]
  const driverDocs = await partnerColOf(db, "drivers").find(
    { staffCode: { $in: empCodes } },
    { projection: { staffCode: 1, contractCode: 1 } }
  ).toArray()
  const codeMap: Record<string, string> = Object.fromEntries(
    driverDocs.map((d) => [String(d.staffCode), String(d.contractCode ?? "")])
  )

  // ── Map 2 & 3: licensePlate / truckNumber → contractCode via contracts ───────
  const contractDocs = await partnerColOf(db, "contracts").find(
    {},
    { projection: { contractCode: 1, licensePlate: 1, truckNumber: 1 } }
  ).toArray()

  const plateMap:     Record<string, string> = {}
  const truckNumMap:  Record<string, string> = {}
  for (const c of contractDocs) {
    const code = String(c.contractCode ?? "")
    if (!code) continue
    if (c.licensePlate) {
      const norm = normalizePlate(String(c.licensePlate))
      if (norm) plateMap[norm] = code
    }
    if (c.truckNumber) {
      truckNumMap[String(c.truckNumber).toUpperCase()] = code
    }
  }

  // ── Resolve each row ──────────────────────────────────────────────────────────
  const rows = parsed.map((r) => {
    const byEmp   = codeMap[r.employeeCode]
    const byPlate = r.licensePlate ? plateMap[r.licensePlate]  : ""
    const byTruck = r.truckNumber  ? truckNumMap[r.truckNumber] : ""

    const contractCode = byEmp || byPlate || byTruck || ""
    const matchedBy: string =
      byEmp   ? "employeeCode" :
      byPlate ? "licensePlate" :
      byTruck ? "truckNumber"  : "none"

    return { ...r, contractCode, matched: !!contractCode, matchedBy }
  })

  if (action === "preview") {
    return NextResponse.json({
      rows,
      total:   rows.length,
      matched: rows.filter((r) => r.matched).length,
    })
  }

  // ── Confirm: upsert into debt_acceptances ────────────────────────────────────
  const col = partnerColOf(db, "debtAcceptances")
  let upserted = 0, skipped = 0

  for (const row of rows) {
    if (!row.debtAcceptanceNo) { skipped++; continue }
    const { matched, matchedBy, ...doc } = row
    await col.updateOne(
      { debtAcceptanceNo: row.debtAcceptanceNo },
      { $set: { ...doc, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    )
    upserted++
  }

  return NextResponse.json({ upserted, skipped })
}
