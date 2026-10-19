import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { TF_COLL, parseTripSummarySheet } from "@/lib/partner/trip-fuel"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

const MONTH_RE = /^\d{4}-\d{2}$/

/**
 * นำเข้าไฟล์ "ค่าเที่ยว Mixer พจร. MM.YY" (ชีตสรุปค่าเที่ยว) — แหล่งหลักของค่าเที่ยว+น้ำมัน
 * action=preview (ตรวจ+จับคู่สัญญาก่อน) | confirm (แทนที่ข้อมูลทั้งเดือน — ไฟล์คือ source of truth)
 */
export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const month = String(fd.get("month") ?? "")
  const action = String(fd.get("action") ?? "preview")
  if (!file) return NextResponse.json({ error: "แนบไฟล์ Excel" }, { status: 400 })
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "ระบุเดือน (YYYY-MM)" }, { status: 400 })

  let parsed
  try {
    parsed = parseTripSummarySheet(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db = pdb

  // จับคู่ชื่อ พจส. → รหัสสัญญา (drivers → contracts, ชื่อตัดช่องว่าง)
  const norm = (s: string) => (s ?? "").replace(/\s+/g, "").trim()
  const byName: Record<string, { code: string; plate: string }> = {}
  const contracts = await partnerColOf(db, "contracts").find({}, { projection: { contractCode: 1, driverName: 1, licensePlate: 1 } }).toArray()
  for (const c of contracts) if (c.driverName) byName[norm(c.driverName as string)] ??= { code: c.contractCode as string, plate: (c.licensePlate as string) ?? "" }
  const drivers = await partnerColOf(db, "drivers").find({}, { projection: { contractCode: 1, driverName: 1, licensePlate: 1 } }).toArray()
  for (const d of drivers) if (d.driverName) byName[norm(d.driverName as string)] = { code: d.contractCode as string, plate: (d.licensePlate as string) ?? "" }

  const r2 = (n: number) => Math.round(n * 100) / 100
  const rows = parsed.rows.map((r) => {
    const m = byName[norm(r.driverName)]
    return { ...r, contractCode: m?.code ?? "", licensePlate: m?.plate ?? "" }
  })
  const unmatched = rows.filter((r) => !r.contractCode).map((r) => r.driverName)
  const totals = {
    drivers: rows.length,
    tripFee: r2(rows.reduce((s, r) => s + r.tripFee, 0)),
    tripCount: rows.reduce((s, r) => s + r.tripCount, 0),
    fuelDeduct: r2(rows.reduce((s, r) => s + r.fuelDeduct, 0)),
    overMoney: r2(rows.reduce((s, r) => s + r.overMoney, 0)),
    underMoney: r2(rows.reduce((s, r) => s + r.underMoney, 0)),
  }

  if (action === "preview") {
    return NextResponse.json({ sheetName: parsed.sheetName, month, totals, unmatched, rows })
  }

  // confirm — แทนที่ทั้งเดือน
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })
  const session = await getPartnerSession()
  const now = new Date().toISOString()
  await partnerColOf(db, "tripFuelMonthly").deleteMany({ month })
  await partnerColOf(db, "tripFuelMonthly").insertMany(rows.map((r) => ({
    month, contractCode: r.contractCode, driverName: r.driverName, licensePlate: r.licensePlate,
    branch: r.branch, tripCount: r.tripCount, tripFee: r.tripFee,
    fuelDeduct: r.fuelDeduct, overMoney: r.overMoney, underMoney: r.underMoney,
    source: "excel-upload", importedAt: now, importedBy: session?.user?.email ?? "unknown",
  })))
  return NextResponse.json({ ok: true, imported: rows.length, unmatched, totals })
}
