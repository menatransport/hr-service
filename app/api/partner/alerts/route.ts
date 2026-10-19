import { NextResponse } from "next/server"
import { nextMonth } from "@/lib/partner/utils"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

type Alert = {
  type: "negative_pay" | "insurance_expired" | "insurance_expiring" | "repair_budget_critical" | "trip_fee_mismatch" | "overdue_installment"
    | "deal_follow_up_due" | "deal_auto_closed"
  severity: "critical" | "warning" | "info"
  contractCode: string
  driverName: string
  message: string
  value?: string
}

export async function GET() {
  const pdb = await partnerDb()
  const db     = pdb

  const alerts: Alert[] = []

  // Latest month with payroll entries
  const months = await partnerColOf(db, "payrollEntries").distinct("month")
  months.sort((a: string, b: string) => b.localeCompare(a))
  const latestMonth = months[0] as string | undefined

  // Pre-load all driver names once (avoid N+1)
  const allDrivers = await partnerColOf(db, "drivers").find({}, { projection: { contractCode: 1, driverName: 1 } }).toArray()
  const driverNameMap = Object.fromEntries(allDrivers.map((d) => [d.contractCode as string, d.driverName as string]))

  // 1. Negative net pay in latest month
  if (latestMonth) {
    const negativeEntries = await       partnerColOf(db, "payrollEntries")
      .find({ month: latestMonth, netPay: { $lt: 0 } })
      .sort({ netPay: 1 })
      .toArray()

    for (const e of negativeEntries) {
      const code = e.contractCode as string
      alerts.push({
        type: "negative_pay",
        severity: "warning",
        contractCode: code,
        driverName: driverNameMap[code] ?? code,
        message: `ยอดสุทธิติดลบ เดือน ${latestMonth}`,
        value: `${(e.netPay as number).toLocaleString("th-TH", { minimumFractionDigits: 0 })} บาท`,
      })
    }
  }

  // 2. Insurance: expired or expiring within 60 days (single query with $or)
  // Use Bangkok offset (UTC+7) so date boundaries match user-entered local dates
  const BKK_MS = 7 * 60 * 60 * 1000
  const today = new Date(Date.now() + BKK_MS).toISOString().slice(0, 10)
  const in60  = new Date(Date.now() + BKK_MS + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // อ่านจากรายการภาษี/ประกันตามทะเบียนรถ (vehicle_insurance_tax — รายการล่าสุดต่อทะเบียน+ประเภท)
  // ถ้าโมดูลใหม่ยังไม่มีข้อมูล (ก่อน migration) fallback ไปอ่าน field เดิมใน contracts
  const ITEM_LABELS: Record<string, string> = {
    insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษีทะเบียน", inspection: "ตรวจสภาพ",
  }
  const latestItems = await partnerColOf(db, "vehicleInsuranceTax").aggregate([
    { $match: { itemType: { $exists: true } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { plate: "$platePlain", itemType: "$itemType" }, latest: { $first: "$$ROOT" } } },
  ]).toArray()

  if (latestItems.length > 0) {
    const activeContracts = await       partnerColOf(db, "contracts")
      .find({ status: "active" }, { projection: { contractCode: 1, driverName: 1, licensePlate: 1 } })
      .toArray()
    const plateNorm = (p?: string) => (p ?? "").replace(/^[^0-9]*/, "").trim()
    const byPlate = new Map(activeContracts.map((c) => [plateNorm(c.licensePlate as string), c]))

    for (const g of latestItems) {
      const item = g.latest as { licensePlate?: string; expiryDate?: string; itemType?: string }
      if (!item.expiryDate || item.expiryDate > in60) continue
      const expired = item.expiryDate < today
      const key = (g._id as { plate: string }).plate
      const con = byPlate.get(key)
      const label = ITEM_LABELS[item.itemType ?? ""] ?? "ประกันภัย/ภาษี"
      alerts.push({
        type: expired ? "insurance_expired" : "insurance_expiring",
        severity: expired ? "critical" : "warning",
        contractCode: (con?.contractCode as string) ?? (item.licensePlate ?? ""),
        driverName: (con?.driverName as string) ?? (item.licensePlate ?? ""),
        message: expired ? `${label}หมดอายุแล้ว` : `${label}ใกล้หมดอายุ`,
        value: item.expiryDate,
      })
    }
  } else {
    const insuranceContracts = await       partnerColOf(db, "contracts")
      .find(
        { taxExpiryDate: { $lte: in60 } },
        { projection: { contractCode: 1, driverName: 1, taxExpiryDate: 1 } }
      )
      .sort({ taxExpiryDate: 1 })
      .toArray()

    for (const c of insuranceContracts) {
      const expired = (c.taxExpiryDate as string) < today
      alerts.push({
        type: expired ? "insurance_expired" : "insurance_expiring",
        severity: expired ? "critical" : "warning",
        contractCode: c.contractCode as string,
        driverName: (c.driverName as string) ?? c.contractCode,
        message: expired ? "ประกันภัย/ภาษีหมดอายุแล้ว" : "ประกันภัย/ภาษีใกล้หมดอายุ",
        value: c.taxExpiryDate as string,
      })
    }
  }

  // 3. Repair budget > 90% utilized
  const configs = await     partnerColOf(db, "promoConfig")
    .find({ contractCode: { $exists: true, $ne: "" }, repairBudget: { $gt: 0 } })
    .toArray()

  const contractCodes = configs.map((c) => c.contractCode as string)
  const repairAgg = await partnerColOf(db, "repairClaims").aggregate([
    { $match: { contractCode: { $in: contractCodes } } },
    { $group: { _id: "$contractCode", total: { $sum: "$amount" } } },
  ]).toArray()
  const repairMap = Object.fromEntries(repairAgg.map((r) => [r._id as string, r.total as number]))

  for (const cfg of configs) {
    const code = cfg.contractCode as string
    const used = repairMap[code] ?? 0
    const pct  = used / (cfg.repairBudget as number)
    if (pct >= 0.9) {
      alerts.push({
        type: "repair_budget_critical",
        severity: pct >= 1.0 ? "critical" : "warning",
        contractCode: code,
        driverName: driverNameMap[code] ?? code,
        message: `โปร 2 วงเงินซ่อมใกล้เต็ม (${Math.round(pct * 100)}%)`,
        value: `คงเหลือ ${((cfg.repairBudget as number) - used).toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`,
      })
    }
  }

  // 4. Trip fee mismatch in latest month (transportFee differs from trip totals by > 500)
  if (latestMonth) {
    const start = `${latestMonth}-01`
    const end   = `${nextMonth(latestMonth)}-01`

    const payrollEntries = await partnerColOf(db, "payrollEntries")
      .find({ month: latestMonth, transportFee: { $gt: 0 } })
      .toArray()

    if (payrollEntries.length > 0) {
      const entryCodeList = payrollEntries.map((e) => e.contractCode as string)
      const tripAgg = await partnerColOf(db, "trips").aggregate([
        { $match: { contractCode: { $in: entryCodeList }, date: { $gte: start, $lt: end } } },
        { $group: { _id: "$contractCode", total: { $sum: "$tripFee" } } },
      ]).toArray()
      const tripFeeMap = Object.fromEntries(tripAgg.map((t) => [t._id as string, t.total as number]))

      for (const e of payrollEntries) {
        const code       = e.contractCode as string
        const declared   = e.transportFee as number
        const tripTotal  = tripFeeMap[code] ?? 0
        if (tripTotal > 0 && Math.abs(declared - tripTotal) > 500) {
          const diff = declared - tripTotal
          alerts.push({
            type: "trip_fee_mismatch",
            severity: "warning",
            contractCode: code,
            driverName: driverNameMap[code] ?? code,
            message: `ค่าขนส่งต่างจากเที่ยว ${diff > 0 ? "+" : ""}${diff.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`,
            value: `กรอก ${declared.toLocaleString("th-TH")} / เที่ยว ${tripTotal.toLocaleString("th-TH")}`,
          })
        }
      }
    }
  }

  // 5. Overdue installments
  const overdueContracts = await     partnerColOf(db, "contracts")
    .find({ overdueCount: { $gt: 0 } }, { projection: { contractCode: 1, driverName: 1, overdueCount: 1, overdueAmount: 1 } })
    .sort({ overdueCount: -1 })
    .toArray()

  for (const c of overdueContracts) {
    const code = c.contractCode as string
    alerts.push({
      type: "overdue_installment",
      severity: (c.overdueCount as number) >= 2 ? "critical" : "warning",
      contractCode: code,
      driverName: (c.driverName as string) ?? driverNameMap[code] ?? code,
      message: `ค้างชำระค่างวด ${c.overdueCount} งวด`,
      value: `฿${(c.overdueAmount as number).toLocaleString("th-TH", { maximumFractionDigits: 0 })}`,
    })
  }

  // ── ดีลในไปป์ไลน์ขาย: เลยวันติดตาม / ถูกระบบปิดเพราะเงียบ (รอเซลล์ระบุเหตุผลจริง) ──
  const todayISO = new Date().toISOString().slice(0, 10)
  const dueDeals = await partnerColOf(db, "quotations")
    .find({ stage: "ON_HOLD", nextFollowUpDate: { $lte: todayISO } },
      { projection: { quotationNo: 1, customerName: 1, salesName: 1, nextFollowUpDate: 1 } })
    .limit(50).toArray()
  for (const d of dueDeals) {
    alerts.push({
      type: "deal_follow_up_due", severity: "warning",
      contractCode: String(d.quotationNo ?? ""),
      driverName: String(d.customerName ?? ""),
      message: `ดีลพักติดตาม เลยวันนัดติดตามแล้ว (${d.nextFollowUpDate}) — ${d.salesName ?? "ไม่ระบุเซลล์"}`,
    })
  }

  const autoClosed = await partnerColOf(db, "quotations")
    .find({ stage: "CLOSED_LOST", lossNote: { $regex: "ระบบปิดให้อัตโนมัติ" } },
      { projection: { quotationNo: 1, customerName: 1, salesName: 1 } })
    .limit(50).toArray()
  for (const d of autoClosed) {
    alerts.push({
      type: "deal_auto_closed", severity: "info",
      contractCode: String(d.quotationNo ?? ""),
      driverName: String(d.customerName ?? ""),
      message: `ระบบปิดดีลเพราะไม่มีความเคลื่อนไหว — รอเซลล์ระบุเหตุผลจริง (${d.salesName ?? "ไม่ระบุเซลล์"})`,
    })
  }

  // Sort: critical first
  const severityOrder = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return NextResponse.json(alerts)
}
