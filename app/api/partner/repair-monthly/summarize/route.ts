import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * POST /api/repair-monthly/summarize { month, action: "preview" | "confirm" }
 * สรุปค่าซ่อมจากเบิกคลัง (stock_movements) เข้างวดเงินเดือน (repair_monthly) — แทนไฟล์ Excel
 *
 * กติกาต่อบรรทัด (ตรงวิธีที่บัญชีเคาะในไฟล์เดิม):
 *   ยอดเก็บ พขร. = chargeAmount ที่เคาะไว้ · ไม่เคาะ → ติดโปร = 0, ไม่ติด = amount เต็ม
 *   งวดที่เก็บ    = chargeMonth ที่เคาะไว้ · ไม่เคาะ → เดือนของวันที่เบิก
 * แมพหมวด: ยาง→ค่ายาง (ชื่อมีปะยาง→ค่าปะยาง) · ค่าแรง*→ค่าแรง · ที่เหลือ→ค่าอะไหล่ (ซ่อมใน)
 * ค่าดำเนินการ = 8% ของยอดเก็บรวม (สูตรไฟล์ — บรรทัด "ค่าดำเนินการ" ในคลังไม่นับซ้ำ)
 */
export async function POST(req: NextRequest) {
  const { month, action = "preview" } = await req.json() as { month?: string; action?: string }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db = pdb
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })

  // บรรทัดของงวด: chargeMonth ตรงเดือน หรือ (ไม่มี chargeMonth และวันที่เบิกอยู่ในเดือน)
  const lines = await partnerColOf(db, "stockMovements").find({
    $or: [
      { chargeMonth: month },
      { chargeMonth: { $exists: false }, date: { $gte: `${month}-01`, $lte: `${month}-31` } },
      { chargeMonth: null, date: { $gte: `${month}-01`, $lte: `${month}-31` } },
    ],
  }).project({ licensePlate: 1, truckNumber: 1, driverName: 1, itemGroup: 1, itemName: 1, amount: 1, promoType: 1, chargeAmount: 1, chargeMonth: 1, date: 1, mr: 1 }).sort({ date: 1 }).toArray()

  // แมพทะเบียน/เบอร์รถ → สัญญา (drivers ก่อน แล้ว contracts)
  const digits = (s: string) => (s ?? "").replace(/[^0-9]/g, "")
  const byPlate: Record<string, string> = {}
  const byTruck: Record<string, string> = {}
  const contracts = await partnerColOf(db, "contracts").find({}).project({ contractCode: 1, licensePlate: 1, truckNumber: 1 }).toArray()
  for (const c of contracts) {
    if (c.licensePlate) byPlate[digits(c.licensePlate as string)] ??= c.contractCode as string
    if (c.truckNumber) byTruck[c.truckNumber as string] ??= c.contractCode as string
  }
  const drivers = await partnerColOf(db, "drivers").find({}).project({ contractCode: 1, licensePlate: 1, truckNumber: 1, driverName: 1 }).toArray()
  const nameByCode: Record<string, string> = {}
  for (const d of drivers) {
    if (d.licensePlate) byPlate[digits(d.licensePlate as string)] = d.contractCode as string
    if (d.truckNumber) byTruck[d.truckNumber as string] = d.contractCode as string
    nameByCode[d.contractCode as string] = (d.driverName as string) ?? ""
  }

  type Sum = { partsAmount: number; tireAmount: number; tirePatchAmount: number; laborAmount: number; cleaningAmount: number; outsideRepairAmount: number; lines: number; charged: number }
  const per: Record<string, Sum> = {}
  const unmatched: { mr: string; item: string; amount: number; plate: string }[] = []

  for (const l of lines) {
    const code = byPlate[digits(l.licensePlate as string)] ?? byTruck[l.truckNumber as string]
    const amt = l.amount as number ?? 0
    // ยอดเก็บ: เคาะไว้ > ติดโปร=0 > เต็มจำนวน · บรรทัด "ค่าดำเนินการ" จากคลังข้ามเสมอ (ใช้สูตร 8% แทน)
    if ((l.itemName as string ?? "").trim() === "ค่าดำเนินการ") continue
    const charge = typeof l.chargeAmount === "number" ? l.chargeAmount : (l.promoType ? 0 : amt)
    if (!code) { if (charge) unmatched.push({ mr: l.mr as string ?? "", item: (l.itemName as string ?? "").slice(0, 30), amount: charge, plate: (l.licensePlate as string) ?? (l.truckNumber as string) ?? "" }); continue }
    per[code] ??= { partsAmount: 0, tireAmount: 0, tirePatchAmount: 0, laborAmount: 0, cleaningAmount: 0, outsideRepairAmount: 0, lines: 0, charged: 0 }
    const p = per[code]
    p.lines++
    if (!charge) continue
    p.charged = r2(p.charged + charge)
    const g = (l.itemGroup as string) ?? ""
    const nm = (l.itemName as string) ?? ""
    if (g === "ยาง") { if (nm.includes("ปะยาง")) p.tirePatchAmount = r2(p.tirePatchAmount + charge); else p.tireAmount = r2(p.tireAmount + charge) }
    else if (g.startsWith("ค่าแรง")) p.laborAmount = r2(p.laborAmount + charge)
    else if (nm.includes("ล้าง") || nm.includes("ทำความสะอาด")) p.cleaningAmount = r2(p.cleaningAmount + charge)
    else p.partsAmount = r2(p.partsAmount + charge)
  }

  // เทียบของเดิมในงวด
  const existing = await partnerColOf(db, "repairMonthly").find({ month }).toArray()
  const exMap = Object.fromEntries(existing.map((e) => [e.contractCode as string, e]))
  const num = (v: unknown) => (typeof v === "number" ? v : 0)

  const rows = Object.entries(per).map(([code, p]) => {
    const managementFee = r2((p.partsAmount + p.tireAmount + p.tirePatchAmount + p.laborAmount + p.cleaningAmount + p.outsideRepairAmount) * 0.08)
    const total = r2(p.charged + managementFee)
    const ex = exMap[code]
    const exTotal = ex ? r2(num(ex.partsAmount) + num(ex.tireAmount) + num(ex.tirePatchAmount) + num(ex.laborAmount) + num(ex.cleaningAmount) + num(ex.outsideRepairAmount) + num(ex.managementFee)) : 0
    return {
      contractCode: code, driverName: nameByCode[code] ?? "",
      ...p, managementFee, total,
      existingTotal: exTotal, delta: r2(total - exTotal), hasExisting: !!ex,
    }
  }).sort((a, b) => b.total - a.total)

  const totals = {
    contracts: rows.length,
    charged: r2(rows.reduce((s, x) => s + x.charged, 0)),
    managementFee: r2(rows.reduce((s, x) => s + x.managementFee, 0)),
    total: r2(rows.reduce((s, x) => s + x.total, 0)),
    existingTotal: r2(existing.reduce((s, e) => s + num(e.partsAmount) + num(e.tireAmount) + num(e.tirePatchAmount) + num(e.laborAmount) + num(e.cleaningAmount) + num(e.outsideRepairAmount) + num(e.managementFee), 0)),
  }

  if (action === "preview") {
    // รายบรรทัดสำหรับเคาะเก็บ (ระบุ contractCode ที่แมพได้ + ยอดเก็บ effective)
    const linesOut = lines
      .filter((l) => ((l.itemName as string) ?? "").trim() !== "ค่าดำเนินการ")
      .map((l) => {
        const code = byPlate[digits(l.licensePlate as string)] ?? byTruck[l.truckNumber as string] ?? ""
        const amt = (l.amount as number) ?? 0
        return {
          id: String(l._id), contractCode: code,
          mr: (l.mr as string) ?? "", date: (l.date as string) ?? "",
          itemGroup: (l.itemGroup as string) ?? "", itemName: (l.itemName as string) ?? "",
          amount: amt, promoType: (l.promoType as string) ?? "",
          chargeAmount: typeof l.chargeAmount === "number" ? l.chargeAmount : null,
          chargeMonth: (l.chargeMonth as string) ?? null,
          effective: typeof l.chargeAmount === "number" ? l.chargeAmount : (l.promoType ? 0 : amt),
        }
      })
    return NextResponse.json({ month, totals, rows, unmatched, sourceLines: lines.length, lines: linesOut })
  }

  // confirm — แทนที่สรุปของเดือนทั้งชุด (ที่มาจากการสรุปนี้เท่านั้น — แถวที่ import จากไฟล์/สคริปต์อื่นคงไว้ถ้าไม่มีในสรุปใหม่)
  const session = await getPartnerSession()
  const now = new Date().toISOString()
  let upserted = 0
  for (const row of rows) {
    await partnerColOf(db, "repairMonthly").updateOne(
      { month, contractCode: row.contractCode },
      { $set: {
        month, contractCode: row.contractCode, driverName: row.driverName,
        partsAmount: row.partsAmount, tireAmount: row.tireAmount, tirePatchAmount: row.tirePatchAmount,
        laborAmount: row.laborAmount, cleaningAmount: row.cleaningAmount, outsideRepairAmount: row.outsideRepairAmount,
        managementFee: row.managementFee, totalRepair: row.total,
        source: "stock-summarize", updatedAt: now, updatedBy: session?.user?.email ?? "unknown",
      } },
      { upsert: true })
    upserted++
  }
  return NextResponse.json({ ok: true, month, upserted, totals, unmatched })
}
