/* eslint-disable @typescript-eslint/no-require-imports -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * POST /api/payroll/[month]/compare — parallel run: เทียบงวดในระบบกับไฟล์ Payroll (ชีต Summary)
 * ใช้เป็นเกณฑ์ cutover + ตรวจย้อนหลัง · อ่านอย่างเดียว ไม่เขียนอะไร
 * แมพระบบ↔ไฟล์: รายการที่ย้ายไปเดินใน ledger (ค่างวด/ซ่อม/ดาวน์/ภาษีประกันบางสัญญา) บวกกลับเข้าช่องเทียบ
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { month } = await params
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "month must be YYYY-MM" }, { status: 400 })

  const fd = await req.formData()
  const file = fd.get("file") as File | null
  if (!file) return NextResponse.json({ error: "แนบไฟล์ Payroll (.xlsx)" }, { status: 400 })

  // ── parse ชีต Summary (โครงคอลัมน์คงที่ตามไฟล์ Payroll รถร่วม Mixer) ──
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx")
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" })
  const sheetName = wb.SheetNames.find((n) => n.trim() === "Summary")
  if (!sheetName) return NextResponse.json({ error: "ไม่พบชีต Summary ในไฟล์" }, { status: 400 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null })
  const hdrRow = grid.find((r) => String(r?.[0] ?? "").trim() === "รหัสสัญญา")
  if (!hdrRow || !String(hdrRow[10] ?? "").includes("ค่าขนส่ง")) {
    return NextResponse.json({ error: "ฟอร์แมตชีต Summary เปลี่ยนจากที่ระบบรู้จัก (ไม่พบ ค่าขนส่ง ที่คอลัมน์ K)" }, { status: 400 })
  }
  const num = (v: unknown) => (typeof v === "number" ? r2(v) : 0)
  const fileRows: Record<string, Record<string, number>> = {}
  const fileNames: Record<string, string> = {}
  for (const r of grid) {
    const code = String(r?.[0] ?? "").trim()
    if (!/^MT[LM]\d+/.test(code)) continue
    fileNames[code] = String(r[2] ?? r[1] ?? "").trim()
    fileRows[code] = {
      workingDays: num(r[8]), tripCount: num(r[9]),
      transportFee: num(r[10]), ot: num(r[11]), otherIncomeWHT: num(r[12]), otherIncomeNoWHT: num(r[13]),
      fuel: num(r[14]), gps: num(r[15]), repairInHouse: num(r[16]), repairOutside: num(r[17]),
      mgmtFee8pct: num(r[18]), labor: num(r[19]), tire: num(r[20]), tirePatch: num(r[21]),
      carWash: num(r[22]), taxInsurance: num(r[23]),
      rentTrailer: num(r[24]), rentTruck: num(r[25]), reserveAdvance: num(r[26]), installment: num(r[27]),
      repairInstallment: num(r[28]), fuelInstallment: num(r[29]), downPaymentInstallment: num(r[30]),
      securitySaving: num(r[31]), tireAdvance: num(r[32]), trafficDebt: num(r[33]), carryIn: num(r[34]),
      otherDeductWHT: num(r[35]), otherDeductNoWHT: num(r[36]),
      totalIncome: num(r[37]), totalDeduction: num(r[40]), balance: num(r[41]), carryOut: num(r[42]),
      wht: num(r[45]),
    }
  }
  if (Object.keys(fileRows).length === 0) return NextResponse.json({ error: "ไม่พบแถวสัญญา (MTxxx) ในชีต Summary" }, { status: 400 })

  const pdb = await partnerDb()
  const db = pdb
  const entries = await partnerColOf(db, "payrollEntries").find({ month }).toArray()
  const eMap = Object.fromEntries(entries.map((e) => [e.contractCode as string, e]))

  const n = (v: unknown) => (typeof v === "number" ? v : 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ledSum = (e: any, f: (i: { type?: string; label: string; amount: number }) => boolean) =>
    ((e.ledgerItems as { type?: string; label: string; amount: number }[]) ?? []).filter(f).reduce((s, i) => s + i.amount, 0)
  const INS_TYPES = ["insurance", "prb", "tax", "inspection", "personal"]

  // ฟิลด์เทียบ: [ชื่อ, ค่าระบบ, ค่าไฟล์]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FIELDS: [string, (e: any) => number, (x: Record<string, number>) => number][] = [
    ["workingDays",   (e) => n(e.workingDays), (x) => x.workingDays],
    ["tripCount",     (e) => n(e.tripCount), (x) => x.tripCount],
    ["transportFee",  (e) => n(e.transportFee), (x) => x.transportFee],
    ["ot",            (e) => n(e.ot), (x) => x.ot],
    ["otherIncWHT",   (e) => n(e.otherIncomeWHT) + n(e.attendanceAllowance), (x) => x.otherIncomeWHT],
    ["otherIncNoWHT", (e) => n(e.otherIncomeNoWHT), (x) => x.otherIncomeNoWHT],
    ["fuelNet",       (e) => n(e.fuel) + n(e.fuelOverCharge) - n(e.fuelUnderRefund), (x) => x.fuel],
    ["gps",           (e) => n(e.gps), (x) => x.gps],
    ["repair+labor",  (e) => n(e.repairInHouse) + n(e.repairOutside) + n(e.mgmtFee8pct) + n(e.labor) + n(e.tire) + n(e.tirePatch) + n(e.carWash),
                      (x) => r2(x.repairInHouse + x.repairOutside + x.mgmtFee8pct + x.labor + x.tire + x.tirePatch + x.carWash)],
    ["taxInsurance",  (e) => n(e.taxInsurance) + ledSum(e, (i) => INS_TYPES.includes(i.type ?? "")), (x) => x.taxInsurance],
    ["installment",   (e) => n(e.installment) + ledSum(e, (i) => i.type === "vehicle_installment"), (x) => x.installment],
    ["repairInstall", (e) => n(e.repairInstallment) + ledSum(e, (i) => (i.type === "debt_acceptance" || !i.type) && i.label.includes("ค่าซ่อม")), (x) => x.repairInstallment],
    ["downPayment",   (e) => n(e.downPaymentInstallment) + ledSum(e, (i) => i.type === "down_payment"), (x) => x.downPaymentInstallment],
    ["otherDedWHT",   (e) => n(e.otherDeductWHT), (x) => r2(x.otherDeductWHT + x.trafficDebt)],
    ["otherDedNoWHT+misc", (e) => n(e.otherDeductNoWHT) + ledSum(e, (i) => ["tire_deposit", "security_deposit", "manual"].includes(i.type ?? "") || ((i.type === "debt_acceptance" || !i.type) && !i.label.includes("ค่าซ่อม"))),
                      (x) => r2(x.otherDeductNoWHT + x.rentTrailer + x.rentTruck + x.reserveAdvance + x.fuelInstallment + x.securitySaving + x.tireAdvance)],
    ["wht3pct",       (e) => n(e.whtAmount), (x) => x.wht],
    ["netBeforeCarry", (e) => n(e.netPay), (x) => r2(x.balance + x.carryIn)],
  ]

  const codes = Object.keys(fileRows).sort()
  const noEntry = codes.filter((c) => !eMap[c])
  const extraEntries = entries.map((e) => e.contractCode as string).filter((c) => !fileRows[c])
  const fields = FIELDS.map(([name, fe, fx]) => {
    let exact = 0, off = 0, sumSys = 0, sumFile = 0
    const deltas: { code: string; driverName: string; sys: number; file: number; delta: number }[] = []
    for (const c of codes) {
      const e = eMap[c]
      if (!e) continue
      const vs = r2(fe(e)), vf = r2(fx(fileRows[c]))
      sumSys = r2(sumSys + vs); sumFile = r2(sumFile + vf)
      if (Math.abs(vs - vf) <= 0.02) exact++
      else { off++; deltas.push({ code: c, driverName: fileNames[c] ?? "", sys: vs, file: vf, delta: r2(vs - vf) }) }
    }
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    return { name, exact, off, sumSys, sumFile, sumDelta: r2(sumSys - sumFile), deltas: deltas.slice(0, 15) }
  })
  const net = fields.find((f) => f.name === "netBeforeCarry")
  const compared = codes.length - noEntry.length

  return NextResponse.json({
    month, sheetName, fileDrivers: codes.length, compared, noEntry, extraEntries,
    matchRate: compared ? r2(((net?.exact ?? 0) / compared) * 100) : 0,
    fields,
  })
}
