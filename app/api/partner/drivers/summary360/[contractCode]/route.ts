import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { getPromoUsage } from "@/lib/partner/promo-usage"
import { normPlateIT } from "@/lib/partner/insurance-tax"

const DB = PARTNER_DB
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => (typeof v === "number" ? v : 0)

/**
 * GET /api/drivers/summary360/[contractCode] — Driver 360: ทุกมิติของ พขร. หนึ่งคนในคำขอเดียว
 * ตัวตน/สัญญา · งวดย้อนหลัง 12 เดือน · หนี้-เงินสะสมรายก้อน · ประกันภาษี · โปรโมชั่น ·
 * สัญญาณเสี่ยง (rule โปร่งใส บอกเหตุผลทุกธง)
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ contractCode: string }> }) {
  const { contractCode } = await params
  if (!contractCode) return NextResponse.json({ error: "contractCode required" }, { status: 400 })

  const client = await clientPromise
  const db = client.db(DB)

  const [driver, contract, entries, ledger, tf, att, debts] = await Promise.all([
    db.collection("drivers").findOne({ contractCode }),
    db.collection("contracts").findOne({ contractCode }),
    db.collection("payroll_entries").find({ contractCode }).sort({ month: -1 }).limit(12).toArray(),
    db.collection("driver_ledger").find({ contractCode, status: { $in: ["active", "cancelled", "closed"] } }).toArray(),
    db.collection("trip_fuel_monthly").find({ contractCode }).sort({ month: -1 }).limit(12)
      .project({ month: 1, fuelDeduct: 1, overMoney: 1, underMoney: 1, tripFee: 1, tripCount: 1 }).toArray(),
    db.collection("attendance_monthly").find({ contractCode }).sort({ month: -1 }).limit(12)
      .project({ month: 1, workDays: 1, days: 1 }).toArray(),
    db.collection("debt_acceptances").find({ contractCode })
      .project({ debtAcceptanceNo: 1, issueDate: 1, liabilityAmount: 1, outstandingBalance: 1, ledgerDebtCode: 1, repairType: 1 }).toArray(),
  ])
  if (!driver && !contract) return NextResponse.json({ error: "ไม่พบสัญญานี้" }, { status: 404 })

  const plate = (driver?.licensePlate as string) ?? (contract?.licensePlate as string) ?? ""
  const platePlain = normPlateIT(plate)

  const [insurance, promoUsage] = await Promise.all([
    platePlain
      ? db.collection("vehicle_insurance_tax").find({ platePlain, itemType: { $exists: true } })
          .project({ itemType: 1, endDate: 1, expiryDate: 1, collectStart: 1, collectEnd: 1, monthlyInstallment: 1, status: 1 }).toArray()
      : Promise.resolve([]),
    getPromoUsage(db).catch(() => new Map()),
  ])

  // ── งวดย้อนหลัง (เรียงเก่า→ใหม่สำหรับกราฟ) ──
  const months = [...entries].reverse().map((e) => ({
    month: e.month as string,
    workingDays: num(e.workingDays), tripCount: num(e.tripCount),
    totalIncome: num(e.totalIncome), totalDeductions: num(e.totalDeductions),
    netPay: num(e.netPay), carryIn: num(e.carryIn), carryOut: num(e.carryOut),
    payable: num(e.payable ?? e.netPay), whtAmount: num(e.whtAmount),
    paidNet: typeof e.paidNet === "number" ? (e.paidNet as number) : r2(Math.max(0, num(e.payable ?? e.netPay)) - num(e.whtAmount)),
    fuelNet: r2(num(e.fuel) + num(e.fuelOverCharge) - num(e.fuelUnderRefund)),
  }))
  const last = months[months.length - 1]
  const last3 = months.slice(-3)
  const avg3 = (f: (m: typeof months[number]) => number) => (last3.length ? r2(last3.reduce((s, m) => s + f(m), 0) / last3.length) : 0)

  // ── หนี้/เงินสะสมรายก้อน ──
  const debtsLedger = ledger.filter((l) => l.status === "active" && l.kind === "debt").map((l) => {
    const principal = num(l.principal), paid = num(l.paidAmount), monthly = num(l.monthlyAmount ?? l.monthlyDeduction)
    const remaining = r2(Math.max(0, principal - paid))
    return {
      debtCode: l.debtCode as string, type: (l.source?.type as string) ?? "manual",
      refLabel: (l.source?.refLabel as string) ?? "", principal, paid, remaining, monthly,
      monthsLeft: monthly > 0 ? Math.ceil(remaining / monthly) : null,
      startMonth: (l.startMonth as string) ?? "", pctPaid: principal > 0 ? Math.round((paid / principal) * 100) : 0,
    }
  }).sort((a, b) => b.remaining - a.remaining)
  const deposits = ledger.filter((l) => l.status === "active" && l.kind === "deposit").map((l) => ({
    debtCode: l.debtCode as string, type: (l.source?.type as string) ?? "manual",
    balance: r2(num(l.paidAmount) - num(l.withdrawnAmount)), target: num(l.targetAmount) || null,
    monthly: num(l.monthlyAmount ?? l.monthlyDeduction),
  }))
  const totalDebtRemaining = r2(debtsLedger.reduce((s, d) => s + d.remaining, 0))
  const totalDeposit = r2(deposits.reduce((s, d) => s + d.balance, 0))
  const totalMonthlyDebt = r2(debtsLedger.reduce((s, d) => s + d.monthly, 0))

  // ── อายุสัญญา (จาก ledger ค่างวด ถ้ามี ไม่งั้นจากสัญญา) ──
  const veh = debtsLedger.find((d) => d.type === "vehicle_installment")
  const installmentInfo = veh
    ? { monthly: veh.monthly, paidMonths: veh.monthly > 0 ? Math.round(veh.paid / veh.monthly) : null, totalMonths: veh.monthly > 0 ? Math.round(veh.principal / veh.monthly) : null, remaining: veh.remaining }
    : contract?.monthlyInstallment
      ? { monthly: num(contract.monthlyInstallment), paidMonths: null, totalMonths: num(contract.installmentCount) || null, remaining: null }
      : null

  // ── สัญญาณเสี่ยง (rule-based โปร่งใส) ──
  const risks: { level: "high" | "warn"; label: string; detail: string }[] = []
  let carryStreak = 0
  for (let i = months.length - 1; i >= 0; i--) { if (months[i].carryOut > 0) carryStreak++; else break }
  if (carryStreak >= 2) risks.push({ level: "high", label: `ยกหนี้ต่อเนื่อง ${carryStreak} งวด`, detail: `เงินไม่พอหักติดกัน ${carryStreak} เดือน — เสี่ยงเข้าวงจรหนี้/ทิ้งรถ ควรคุยโครงสร้างหนี้` })
  else if (last && last.carryOut > 0) risks.push({ level: "warn", label: "งวดล่าสุดยกหนี้", detail: `ยกไป ${last.carryOut.toLocaleString()} บาท — จับตางวดหน้า` })
  if (last && last.netPay < 0) risks.push({ level: "high", label: "สุทธิติดลบงวดล่าสุด", detail: `NetPay ${last.netPay.toLocaleString()} บาท` })
  const incomeAvg = avg3((m) => m.totalIncome), deductAvg = avg3((m) => m.totalDeductions)
  if (incomeAvg > 0 && deductAvg / incomeAvg > 0.85)
    risks.push({ level: deductAvg / incomeAvg > 1 ? "high" : "warn", label: `ภาระหัก ${Math.round((deductAvg / incomeAvg) * 100)}% ของรายรับ`, detail: `เฉลี่ย 3 งวด: หัก ${deductAvg.toLocaleString()} / รับ ${incomeAvg.toLocaleString()}` })
  const fuelOverMonths = tf.filter((t) => num(t.overMoney) > 0).length
  if (fuelOverMonths >= 2) risks.push({ level: "warn", label: `น้ำมันเกินเรต ${fuelOverMonths} เดือน (ใน ${tf.length})`, detail: "พฤติกรรมการเติม/ใช้เชื้อเพลิงผิดปกติซ้ำ" })
  if (months.length >= 4) {
    const prevAvgDays = r2(months.slice(-4, -1).reduce((s, m) => s + m.workingDays, 0) / 3)
    if (prevAvgDays > 0 && last.workingDays < prevAvgDays * 0.7)
      risks.push({ level: "warn", label: `วันทำงานตก ${Math.round((1 - last.workingDays / prevAvgDays) * 100)}%`, detail: `ล่าสุด ${last.workingDays} วัน vs เฉลี่ยก่อนหน้า ${prevAvgDays} วัน` })
  }

  // ── ปฏิทินวันทำงานรายวัน (จากไฟล์สถานะวันทำงาน): จัดกลุ่มรหัสแบบโปร่งใส เก็บรหัสดิบไว้ด้วย ──
  // A=มา · มี "ส"=สาย · A50=ครึ่งวัน · ข=ขาด · ล/ป/ก=ลา (กิจ/ป่วย) · ฝ=ฝึกอบรม · ว่าง=ไม่มีข้อมูล
  const classify = (code: string): string => {
    const c = (code ?? "").trim()
    if (!c) return "none"
    if (c.includes("ข")) return "absent"
    if (c.startsWith("A")) return c.includes("ส") ? "late" : (c.includes("50") ? "half" : "work")
    if (c.startsWith("ล") || c === "ป" || c === "ก") return "leave"
    if (c === "ฝ") return "train"
    return "other"
  }
  const attendanceMonths = [...att].reverse().map((a) => {
    const days = ((a.days as string[]) ?? []).map((c) => ({ c: (c ?? "").trim(), g: classify(c) }))
    const cnt = (g: string) => days.filter((d) => d.g === g).length
    return {
      month: a.month as string, workDays: num(a.workDays), days,
      counts: { work: cnt("work") + cnt("late") + cnt("half"), late: cnt("late"), half: cnt("half"), leave: cnt("leave"), absent: cnt("absent"), train: cnt("train"), other: cnt("other") },
    }
  })

  // สัญญาณจากปฏิทินวันทำงานงวดล่าสุด
  const lastAtt = attendanceMonths[attendanceMonths.length - 1]
  if (lastAtt) {
    if (lastAtt.counts.absent >= 2) risks.push({ level: "high", label: `ขาดงาน ${lastAtt.counts.absent} วัน (งวดล่าสุด)`, detail: `เดือน ${lastAtt.month} — ตรวจสาเหตุ/ความพร้อมวิ่งงาน` })
    if (lastAtt.counts.late >= 8) risks.push({ level: "warn", label: `มาสายบ่อย ${lastAtt.counts.late} วัน (งวดล่าสุด)`, detail: `เดือน ${lastAtt.month} — สายเกิน 1 ใน 4 ของเดือน กระทบคิวงานแพล้นท์` })
  }

  // ── ประกัน/ภาษี + โปรโมชั่น ──
  const insuranceOut = insurance.map((i) => ({
    itemType: i.itemType as string,
    expiry: (i.endDate as string) ?? (i.expiryDate as string) ?? null,
    collectEnd: (i.collectEnd as string) ?? null,
    monthly: num(i.monthlyInstallment), status: (i.status as string) ?? "",
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promo: any = platePlain ? ([...(promoUsage as Map<string, any>).values()].find((u) => u.contractCode === contractCode || normPlateIT(u.licensePlate ?? "") === platePlain) ?? null) : null

  return NextResponse.json({
    contractCode,
    driver: driver ? {
      driverName: driver.driverName, licensePlate: driver.licensePlate, truckNumber: driver.truckNumber,
      plant: driver.plant, phone: driver.phone, accountNumber: driver.accountNumber, bankName: driver.bankName,
      status: driver.status, staffCode: driver.staffCode,
    } : null,
    contract: contract ? {
      _id: String(contract._id), buyerName: contract.buyerName, driverName: contract.driverName,
      startDate: contract.startDate ?? contract.contractDate ?? null, status: contract.status,
      guarantorName: contract.guarantorName ?? null,
    } : null,
    installmentInfo,
    kpi: {
      incomeAvg3: incomeAvg, netLast: last?.netPay ?? 0, paidNetLast: last?.paidNet ?? 0,
      lastMonth: last?.month ?? null, totalDebtRemaining, totalDeposit, totalMonthlyDebt,
      carryNow: last?.carryOut ?? 0,
    },
    months, attendanceMonths, debtsLedger, deposits,
    insurance: insuranceOut,
    promo: promo ? {
      repairBudget: num(promo.repairBudget), repairUsed: num(promo.repairUsed),
      repairRemaining: r2(num(promo.repairBudget) - num(promo.repairUsed)),
      annualPmCap: num(promo.annualPmCap), pmUsed: num(promo.pmUsedThisYear ?? promo.pmUsed),
      pmWindowFrom: promo.pmWindowFrom ?? "", pmWindowTo: promo.pmWindowTo ?? "",
    } : null,
    debtDocs: debts.map((d) => ({
      no: d.debtAcceptanceNo, issueDate: d.issueDate ?? null, liability: num(d.liabilityAmount),
      outstanding: num(d.outstandingBalance), linked: !!d.ledgerDebtCode, repairType: d.repairType ?? "",
    })),
    risks,
  })
}
