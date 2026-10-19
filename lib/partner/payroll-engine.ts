import type { Db } from "mongodb"
import { nextMonth, prevMonth } from "@/lib/partner/utils"
import { getInsuranceDeductionForPlate } from "@/lib/partner/insurance-tax"
import { getLedgerDeductions } from "@/lib/partner/driver-ledger"

export interface PayrollResult {
  contractCode: string
  month: string
  workingDays: number
  tripCount: number
  transportFee: number
  ot: number
  otherIncomeWHT: number
  otherIncomeNoWHT: number
  fuel: number
  gps: number
  repairInHouse: number
  repairOutside: number
  mgmtFee8pct: number
  labor: number
  tire: number
  tirePatch: number
  carWash: number
  taxInsurance: number
  installment: number
  repairInstallment: number
  downPaymentInstallment: number
  otherDeductWHT: number
  otherDeductNoWHT: number
  ledgerDeduction: number
  ledgerItems: { entryId: string; debtCode: string; label: string; amount: number }[]
  fuelOverCharge: number      // น้ำมันเกินเรต (หัก)
  fuelUnderRefund: number     // คืนน้ำมันต่ำกว่าเรต (รับ)
  attendanceAllowance: number // เบี้ยวันทำงาน 5 ตัว (สูตร=ได้)
  extrasItems: { label: string; kind: string; amount: number; wht: boolean }[]
  totalIncome: number
  totalDeductions: number
  netPay: number
  carryIn: number             // หนี้ยกมาจากเดือนก่อน
  payable: number             // ยอดจ่ายจริง = netPay − carryIn
  carryOut: number            // หนี้ยกไปเดือนหน้า (payable ติดลบ)
  whtBase: number             // ฐานภาษีหัก ณ ที่จ่าย
  whtAmount: number           // WHT 3% (ฐาน > 0)
  paidNet: number             // ยอดโอนสุทธิ = max(0, payable) − WHT
}

/**
 * Calculate payroll for one contract/month from MongoDB source collections.
 * Returns null if the contract does not exist.
 */
export async function calculatePayrollEntry(
  db: Db,
  contractCode: string,
  month: string
): Promise<PayrollResult | null> {
  const start = `${month}-01`
  const end   = `${nextMonth(month)}-01`

  const [contract, tripAgg, fuelRec, gpsRec, repairRec, installRec, adjRec] = await Promise.all([
    db.collection("contracts").findOne(
      { contractCode },
      { projection: { taxMonthlyInstallment: 1, repairMonthlyInstallment: 1, monthlyInstallment: 1, licensePlate: 1 } }
    ),
    db.collection("trips").aggregate([
      { $match: { contractCode, date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: null,
          total: { $sum: "$tripFee" },
          count: { $sum: 1 },
          uniqueDates: { $addToSet: "$date" },
        },
      },
    ]).toArray(),
    db.collection("fuel_records").findOne({ contractCode, month }),
    db.collection("gps_config").findOne({ contractCode }),
    db.collection("repair_monthly").findOne({ contractCode, month }),
    db.collection("installment_schedule").findOne({ contractCode }),
    db.collection("monthly_adjustments").findOne({ contractCode, month }),
  ])

  if (!contract) return null

  const trips       = tripAgg[0] ?? { total: 0, count: 0, uniqueDates: [] }

  // เฟส 1: สรุปเที่ยว+เชื้อเพลิงจาก BI (trip_fuel_monthly) — ถ้ามีของเดือนนี้ ใช้แทน trips/fuel_records เดิม
  const tf = await db.collection("trip_fuel_monthly").findOne({ month, contractCode })

  const transportFee = tf ? ((tf.tripFee as number) ?? 0) : (trips.total as number)
  const tripCount    = tf ? ((tf.tripCount as number) ?? 0) : (trips.count as number)

  // เฟส 2: วันทำงานจากไฟล์ "สถานะวันทำงาน พจร." (attendance_monthly) — ถ้ามี ใช้แทนการนับวันจากเที่ยว
  const att = await db.collection("attendance_monthly").findOne({ month, contractCode })
  const workingDays  = att ? ((att.workDays as number) ?? 0) : (trips.uniqueDates as string[]).length

  // เบี้ยวันทำงาน 5 ตัว (ค่าวินัย/โซนหนาแน่น/ค่าฝีมือ/เบี้ยขยัน/ค่าเช่าบ้าน) — จ่ายเมื่อคอลัมน์ "สูตร" = ได้
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aw: any = att?.allowances ?? {}
  const attendanceAllowance = att?.eligible === true
    ? Math.round(((aw.discipline ?? 0) + (aw.denseZone ?? 0) + (aw.skill ?? 0) + (aw.diligence ?? 0) + (aw.houseRent ?? 0)) * 100) / 100
    : 0

  const fuel             = tf ? ((tf.fuelDeduct as number) ?? 0) : ((fuelRec?.deductionAmount as number) ?? 0)
  const fuelOverCharge   = tf ? ((tf.overMoney as number) ?? 0) : 0   // เกินเรต (>เกณฑ์+ค่าปรับ)
  const fuelUnderRefund  = tf ? ((tf.underMoney as number) ?? 0) : 0  // คืนต่ำกว่าเรต (รายรับ)
  // override รายเดือน (monthly_adjustments) — ใช้เมื่อยอดเก็บจริงต่างจากค่าตั้งต้น
  // (เดือนพักชำระ/เก็บบางส่วน/ข้อมูลย้อนหลังจากไฟล์) มีค่าเป็นตัวเลขเมื่อไหร่ ชนะค่า default
  const ovr = (v: unknown, dflt: number) => (typeof v === "number" ? v : dflt)

  const gps              = ovr(adjRec?.gps, (gpsRec?.monthlyFee as number) ?? 700)
  // ภาษี/ประกัน: หักตามรอบของทะเบียนรถ (vehicle_insurance_tax) — ทะเบียนที่ยังไม่มีข้อมูล
  // ในโมดูลใหม่ (null) fallback ไป field เดิมใน contract ช่วงเปลี่ยนผ่าน
  const cycleDeduction   = await getInsuranceDeductionForPlate(db, (contract.licensePlate as string) ?? "", month)
  const taxInsurance     = ovr(adjRec?.taxInsurance, cycleDeduction ?? ((contract.taxMonthlyInstallment as number) ?? 0))
  const installment      = ovr(adjRec?.installment, (installRec?.monthlyAmount as number) ?? (contract.monthlyInstallment as number) ?? 0)
  const repairInstallment = ovr(adjRec?.repairInstallment, (contract.repairMonthlyInstallment as number) ?? 0)

  // In the Excel data model, `mgmtFee8pct` stores repair management fee (ค่าดำเนินการซ่อม),
  // NOT 8% of transport. repairInHouse stores parts cost only.
  const repairInHouse = (repairRec?.partsAmount as number) ?? 0
  const repairOutside = (repairRec?.outsideRepairAmount as number) ?? 0
  const labor         = (repairRec?.laborAmount as number) ?? 0
  const tire          = (repairRec?.tireAmount as number) ?? 0
  const tirePatch     = (repairRec?.tirePatchAmount as number) ?? 0
  const carWash       = (repairRec?.cleaningAmount as number) ?? 0
  const mgmtFee8pct   = (repairRec?.managementFee as number) ?? 0

  const ot               = (adjRec?.ot as number) ?? 0

  // เฟส 4: รายการรับ-หักมีชื่อ (payroll_extras) — บวกเข้า 4 ช่องเดิมตาม kind+wht
  const extras = await db.collection("payroll_extras").find({ month, contractCode }).toArray()
  const exSum = (kind: string, wht: boolean) =>
    Math.round(extras.filter((e) => e.kind === kind && !!e.wht === wht)
      .reduce((s, e) => s + ((e.amount as number) ?? 0), 0) * 100) / 100

  const otherIncomeWHT   = (((adjRec?.otherIncomeWHT as number) ?? 0) + exSum("income", true))
  const otherIncomeNoWHT = (((adjRec?.otherIncomeNoWHT as number) ?? 0) + exSum("income", false))
  const otherDeductWHT   = (((adjRec?.otherDeductWHT as number) ?? 0) + exSum("deduct", true))
  const otherDeductNoWHT = (((adjRec?.otherDeductNoWHT as number) ?? 0) + exSum("deduct", false))
  const extrasItems = extras.map((e) => ({
    label: (e.label as string) ?? (e.type as string), kind: e.kind as string,
    amount: (e.amount as number) ?? 0, wht: !!e.wht,
  }))
  const downPaymentInstallment = ovr(adjRec?.downPaymentInstallment, 0)

  // ledger กลาง (หนี้/เงินสะสม พขร.) — ยอดหักของเดือนนี้ตาม balance ปัจจุบัน
  const ledgerItems     = await getLedgerDeductions(db, contractCode, month)
  const ledgerDeduction = Math.round(ledgerItems.reduce((s, i) => s + i.amount, 0) * 100) / 100

  // ค่างวดรถผ่าน ledger (opening จากไฟล์) แล้ว → ไม่หักซ้ำจากช่องสัญญา (override ยังชนะได้)
  const vehViaLedger = ledgerItems.some((i) => i.type === "vehicle_installment" && i.amount > 0)
  const installmentFinal = vehViaLedger ? ovr(adjRec?.installment, 0) : installment

  const totalIncome = transportFee + ot + attendanceAllowance + fuelUnderRefund + otherIncomeWHT + otherIncomeNoWHT
  const totalDeductions =
    fuel + fuelOverCharge + gps + repairInHouse + repairOutside + mgmtFee8pct +
    labor + tire + tirePatch + carWash +
    taxInsurance + installmentFinal + repairInstallment + downPaymentInstallment +
    otherDeductWHT + otherDeductNoWHT + ledgerDeduction

  // หนี้ยกยอด: สุทธิเดือนก่อนติดลบ → ยกมาหักเดือนนี้ · เดือนนี้ยังติดลบ → ยกไปเดือนหน้า (ตรงคอลัมน์ NetPay ของ Excel)
  const prev = await db.collection("payroll_entries").findOne(
    { contractCode, month: prevMonth(month) }, { projection: { carryOut: 1 } })
  const carryIn = Math.round((((prev?.carryOut as number) ?? 0)) * 100) / 100
  const netPay = Math.round((totalIncome - totalDeductions) * 100) / 100
  const payable = Math.round((netPay - carryIn) * 100) / 100

  // WHT 3% — สูตรพิสูจน์กับไฟล์จริง 112/112: ฐาน = รายรับฝั่ง WHT − รายจ่ายเกี่ยวกับรถ − หักอื่นฝั่ง WHT
  // (ประกัน/ภาษีที่เดินผ่าน ledger นับเป็นรายจ่ายรถด้วย — เทียบเท่าคอลัมน์ต่อภาษีประกันของไฟล์)
  const insLedger = ledgerItems
    .filter((i) => ["insurance", "prb", "tax", "inspection", "personal"].includes(i.type ?? ""))
    .reduce((s, i) => s + i.amount, 0)
  const whtBase = Math.round((
    (transportFee + ot + attendanceAllowance + otherIncomeWHT)
    - (fuel + fuelOverCharge - fuelUnderRefund + gps + repairInHouse + repairOutside +
       mgmtFee8pct + labor + tire + tirePatch + carWash + taxInsurance + insLedger)
    - otherDeductWHT) * 100) / 100
  const whtAmount = whtBase > 0 ? Math.round(whtBase * 0.03 * 100) / 100 : 0

  // ภาษีนำส่งสรรพากรเสมอ — เงินงวดไม่พอจ่ายภาษี → ส่วนที่บริษัทออกแทนบวกเข้าหนี้ยกไป
  // (ตรงไฟล์: MTM124 NetPay 0, ยกไป = ยอดติดลบ + WHT 890.98)
  const afterWht = Math.round((payable - whtAmount) * 100) / 100
  const paidNet = Math.max(0, afterWht)                                    // ยอดโอนจริงหลังภาษี
  const carryOut = afterWht < 0 ? Math.round(-afterWht * 100) / 100 : 0    // หนี้ยกไป (รวมภาษีที่ออกแทน)

  return {
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
    installment: installmentFinal,
    repairInstallment,
    downPaymentInstallment,
    otherDeductWHT,
    otherDeductNoWHT,
    ledgerDeduction,
    ledgerItems,
    fuelOverCharge,
    fuelUnderRefund,
    attendanceAllowance,
    extrasItems,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netPay,
    carryIn,
    payable,
    carryOut,
    whtBase,
    whtAmount,
    paidNet,
  }
}
