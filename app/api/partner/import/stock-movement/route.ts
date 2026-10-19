import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import * as XLSX from "xlsx"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export const runtime = "nodejs"
export const maxDuration = 30

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Row parser — 25 columns ตามไฟล์การเคลื่อนไหวของสินค้า ─────────────────────
// 0:วันที่ 1:PR 2:PO 3:DD 4:WD 5:MR 6:ซัพพลายเออร์ 7:AP Term 8:จุดประสงค์ในการเบิก
// 9:คลังสินค้า 10:ชื่อสินค้า 11:รหัสสินค้า 12:กลุ่มสินค้า 13:เลขรถ 14:พจส. 15:ทะเบียน
// 16:เลขที่เฉพาะ 17:รับ 18:จ่าย 19:ราคาทุน 20:ยอดเงิน 21:max stock 22:min stock
// 23:หมายเหตุ 24:หมายเหตุย่อย

function parseRow(row: unknown[]) {
  return {
    date:         parseDate(row[0]),
    pr:           str(row[1]),
    po:           str(row[2]),
    dd:           str(row[3]),
    wd:           str(row[4]),
    mr:           str(row[5]),
    supplier:     str(row[6]),
    apTerm:       str(row[7]),
    purpose:      str(row[8]),
    warehouse:    str(row[9]),
    itemName:     str(row[10]),
    itemCode:     str(row[11]),
    itemGroup:    str(row[12]),
    truckNumber:  str(row[13]).toUpperCase(),
    driverName:   str(row[14]),
    licensePlate: str(row[15]),
    serialNo:     str(row[16]),
    receiveQty:   toNum(row[17]),
    issueQty:     toNum(row[18]),
    unitCost:     toNum(row[19]),
    amount:       toNum(row[20]),
    maxStock:     toNum(row[21]),
    minStock:     toNum(row[22]),
    notes:        str(row[23]),
    subNotes:     str(row[24]),
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

  // Data rows: col 0 parses to a date AND has an item name or code
  const parsed = all
    .map(parseRow)
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && (r.itemName || r.itemCode))

  if (parsed.length === 0) {
    return NextResponse.json({ error: "ไม่พบข้อมูลในไฟล์ หรือรูปแบบไม่ถูกต้อง" }, { status: 422 })
  }

  if (action === "preview") {
    return NextResponse.json({
      rows:        parsed,
      total:       parsed.length,
      totalAmount: parsed.reduce((s, r) => s + r.amount, 0),
    })
  }

  // ── Confirm: upsert by composite key (date + wd + mr + itemCode + amount) ───
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "stockMovements")
  const now    = new Date()

  let upserted = 0, modified = 0
  for (const row of parsed) {
    const result = await col.updateOne(
      { date: row.date, wd: row.wd, mr: row.mr, itemCode: row.itemCode, amount: row.amount },
      { $set: { ...row, updatedAt: now }, $setOnInsert: { createdAt: now, promoType: "" } },
      { upsert: true }
    )
    if (result.upsertedCount > 0) upserted++
    else if (result.modifiedCount > 0) modified++
  }

  return NextResponse.json({ upserted, modified })
}
