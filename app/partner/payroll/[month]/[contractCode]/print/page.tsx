"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Printer } from "lucide-react"
import { formatMoney, formatMonth, formatDate } from "@/lib/partner/utils"
import type { PayrollEntry, Driver, Contract } from "@/lib/partner/types"

const INCOME_FIELDS: { key: keyof PayrollEntry; label: string }[] = [
  { key: "transportFee",     label: "ค่าขนส่ง" },
  { key: "ot",               label: "OT" },
  { key: "attendanceAllowance", label: "เบี้ยวันทำงาน (วินัย/โซน/ฝีมือ/ขยัน/เช่าบ้าน)" },
  { key: "fuelUnderRefund",  label: "คืนค่าน้ำมัน (ใช้ต่ำกว่าเรต)" },
  { key: "otherIncomeWHT",   label: "รับอื่นๆ (หักภาษี ณ ที่จ่าย)" },
  { key: "otherIncomeNoWHT", label: "รับอื่นๆ (ไม่หักภาษี)" },
]

const DEDUCTION_FIELDS: { key: keyof PayrollEntry; label: string }[] = [
  { key: "fuel",                   label: "ค่าเชื้อเพลิง" },
  { key: "fuelOverCharge",         label: "น้ำมันเกินเรต + ค่าปรับ" },
  { key: "gps",                    label: "GPS" },
  { key: "repairInHouse",          label: "ค่าซ่อมแซม (ใน)" },
  { key: "repairOutside",          label: "ค่าซ่อมแซม (นอก)" },
  { key: "mgmtFee8pct",            label: "ค่าดำเนินการ 8%" },
  { key: "labor",                  label: "ค่าแรง" },
  { key: "tire",                   label: "ค่ายาง" },
  { key: "tirePatch",              label: "ค่าปะยาง" },
  { key: "carWash",                label: "ค่าทำความสะอาดรถ" },
  { key: "taxInsurance",           label: "ต่อภาษีและประกัน" },
  { key: "installment",            label: "ค่างวดรถ" },
  { key: "repairInstallment",      label: "ผ่อนชำระค่าซ่อม" },
  { key: "downPaymentInstallment", label: "ผ่อนเงินดาวน์" },
  { key: "otherDeductWHT",         label: "หักอื่นๆ (หักภาษี ณ ที่จ่าย)" },
  { key: "otherDeductNoWHT",       label: "หักอื่นๆ (ไม่หักภาษี)" },
]

export default function PrintPayslipPage() {
  const { month, contractCode } = useParams<{ month: string; contractCode: string }>()
  const [entry, setEntry]       = useState<PayrollEntry | null>(null)
  const [driver, setDriver]     = useState<Driver | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [tripCount, setTripCount] = useState(0)

  useEffect(() => {
    fetch(`/api/partner/payroll/${month}/${contractCode}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setEntry(d) })

    fetch(`/api/partner/drivers?q=${encodeURIComponent(contractCode)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((ds: Driver[]) => {
        const found = ds.find((d) => d.contractCode === contractCode)
        if (found) setDriver(found)
      })

    fetch(`/api/partner/contracts?q=${encodeURIComponent(contractCode)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((cs: Contract[]) => {
        const found = cs.find((c) => c.contractCode === contractCode)
        if (found) setContract(found)
      })

    fetch(`/api/partner/trips?contractCode=${contractCode}&month=${month}`)
      .then((r) => r.ok ? r.json() : [])
      .then((ts: unknown[]) => setTripCount(Array.isArray(ts) ? ts.length : 0))
  }, [month, contractCode])

  if (!entry) {
    return <div className="p-8 text-sm text-zinc-400">กำลังโหลด...</div>
  }

  const extras  = entry.extrasItems ?? []
  const ledgers = entry.ledgerItems ?? []
  const r2 = (n: number) => Math.round(n * 100) / 100
  const exSum = (kind: string, wht: boolean) =>
    extras.filter((x) => x.kind === kind && x.wht === wht).reduce((s, x) => s + x.amount, 0)

  // ยอด "รับ/หักอื่นๆ" ใน doc รวม extras แล้ว — บรรทัดรวมโชว์เฉพาะส่วนปรับปรุง (adjustment)
  // ส่วน extras แตกเป็นรายบรรทัดของมันเอง → ผลรวมบรรทัด = ยอดรวมท้ายตารางพอดี
  const OVERRIDE: Partial<Record<keyof PayrollEntry, number>> = {
    otherIncomeWHT:   r2((entry.otherIncomeWHT   ?? 0) - exSum("income", true)),
    otherIncomeNoWHT: r2((entry.otherIncomeNoWHT ?? 0) - exSum("income", false)),
    otherDeductWHT:   r2((entry.otherDeductWHT   ?? 0) - exSum("deduct", true)),
    otherDeductNoWHT: r2((entry.otherDeductNoWHT ?? 0) - exSum("deduct", false)),
  }
  const numVal = (key: keyof PayrollEntry) => {
    if (key in OVERRIDE) return OVERRIDE[key] ?? 0
    const v = entry[key]
    return typeof v === "number" ? v : 0
  }

  const incomeRows   = INCOME_FIELDS.filter((f) => numVal(f.key) !== 0)
  const deductRows   = DEDUCTION_FIELDS.filter((f) => numVal(f.key) !== 0)
  const extraIncomes = extras.filter((x) => x.kind === "income" && x.amount !== 0)
  const extraDeducts = extras.filter((x) => x.kind === "deduct" && x.amount !== 0)
  const carryIn  = entry.carryIn  ?? 0
  const carryOut = entry.carryOut ?? 0
  const payable  = entry.payable  ?? entry.netPay
  const wht      = entry.whtAmount ?? 0
  const paidNet  = entry.paidNet ?? r2(Math.max(0, payable) - wht)

  return (
    <div>
      {/* Print button — hidden when printing */}
      <div className="print:hidden flex items-center gap-3 mb-6">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          <Printer className="w-4 h-4" />
          พิมพ์ใบแจ้งเงินเดือน
        </button>
        <button
          onClick={() => window.history.back()}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          ← กลับ
        </button>
      </div>

      {/* Payslip — styled for print */}
      <div className="print-page bg-white max-w-[210mm] mx-auto p-10 shadow-md print:shadow-none print:p-8">
        {/* Header */}
        <div className="border-b-2 border-zinc-800 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-wide">บริษัท มีนา ทรานสปอร์ต จำกัด</h1>
              <p className="text-xs text-zinc-500 mt-0.5">Mena Transport Co., Ltd.</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">ใบแจ้งเงินเดือน</p>
              <p className="text-xs text-zinc-500">Payslip</p>
            </div>
          </div>
        </div>

        {/* Employee info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-6 text-sm">
          <Row label="เดือน"          value={formatMonth(month)} bold />
          <Row label="รหัสสัญญา"      value={contractCode} bold />
          <Row label="ชื่อผู้ขับขี่"   value={driver?.driverName ?? contract?.driverName ?? "-"} />
          <Row label="ชื่อผู้เช่าซื้อ"  value={driver?.buyerName  ?? contract?.buyerName  ?? "-"} />
          <Row label="ทะเบียนรถ"      value={driver?.licensePlate ?? contract?.licensePlate ?? "-"} />
          <Row label="แพล้นท์"         value={contract?.plant ?? "-"} />
          <Row label="วันทำงาน"       value={`${entry.workingDays} วัน`} />
          <Row label="จำนวนเที่ยว"    value={`${tripCount || entry.tripCount} เที่ยว`} />
        </div>

        {/* Income / Deductions table */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Income */}
          <div className="flex flex-col">
            <div className="bg-zinc-100 px-3 py-1.5 rounded-t text-xs font-semibold text-zinc-700 uppercase tracking-wide">
              รายการรับ
            </div>
            <table className="w-full text-sm border border-zinc-200 rounded-b overflow-hidden flex-1 flex flex-col [&>tbody]:flex-1 [&>tbody]:block [&>tbody>tr]:flex [&>tbody>tr]:justify-between [&>tfoot]:block [&>tfoot>tr]:flex [&>tfoot>tr]:justify-between">
              <tbody className="divide-y divide-zinc-100">
                {incomeRows.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="px-3 py-1.5 text-zinc-600">{label}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatMoney(numVal(key))}</td>
                  </tr>
                ))}
                {extraIncomes.map((x, i) => (
                  <tr key={`ex-inc-${i}`}>
                    <td className="px-3 py-1.5 text-zinc-600">{x.label}{x.wht ? " *" : ""}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatMoney(x.amount)}</td>
                  </tr>
                ))}
                {incomeRows.length === 0 && extraIncomes.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-2 text-zinc-400 text-xs text-center">ไม่มีรายการ</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-emerald-50 font-semibold text-emerald-700">
                  <td className="px-3 py-2 text-sm">รวมรายรับ</td>
                  <td className="px-3 py-2 text-right text-sm">{formatMoney(entry.totalIncome)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Deductions */}
          <div className="flex flex-col">
            <div className="bg-zinc-100 px-3 py-1.5 rounded-t text-xs font-semibold text-zinc-700 uppercase tracking-wide">
              รายการหัก
            </div>
            <table className="w-full text-sm border border-zinc-200 rounded-b overflow-hidden flex-1 flex flex-col [&>tbody]:flex-1 [&>tbody]:block [&>tbody>tr]:flex [&>tbody>tr]:justify-between [&>tfoot]:block [&>tfoot>tr]:flex [&>tfoot>tr]:justify-between">
              <tbody className="divide-y divide-zinc-100">
                {deductRows.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="px-3 py-1.5 text-zinc-600">{label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(numVal(key))}</td>
                  </tr>
                ))}
                {extraDeducts.map((x, i) => (
                  <tr key={`ex-ded-${i}`}>
                    <td className="px-3 py-1.5 text-zinc-600">{x.label}{x.wht ? " *" : ""}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(x.amount)}</td>
                  </tr>
                ))}
                {ledgers.map((l, i) => (
                  <tr key={`lg-${i}`}>
                    <td className="px-3 py-1.5 text-zinc-600">{l.label}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
                {deductRows.length === 0 && extraDeducts.length === 0 && ledgers.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-2 text-zinc-400 text-xs text-center">ไม่มีรายการ</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-red-50 font-semibold text-red-600">
                  <td className="px-3 py-2 text-sm">รวมรายหัก</td>
                  <td className="px-3 py-2 text-right text-sm">{formatMoney(entry.totalDeductions)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Net pay */}
        <div className="border-2 border-zinc-800 rounded-xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500">เงินได้สุทธิ / Net Pay</p>
            <p className="text-sm text-zinc-500 mt-0.5">{contractCode} · {formatMonth(month)}</p>
          </div>
          <div className="text-right">
            <p className={`text-3xl font-bold ${entry.netPay < 0 ? "text-red-600" : "text-zinc-900"}`}>
              {formatMoney(entry.netPay)}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">บาท / THB</p>
          </div>
        </div>

        {/* หนี้ยกยอด — โชว์เมื่อมีบรรทัดใดไม่เป็นศูนย์ */}
        {(carryIn !== 0 || carryOut !== 0 || wht > 0) && (
          <div className="mt-3 border border-zinc-200 rounded-xl px-6 py-3 text-sm space-y-1">
            <div className="flex justify-between text-zinc-600">
              <span>เงินได้สุทธิงวดนี้</span>
              <span className="font-medium">{formatMoney(entry.netPay)}</span>
            </div>
            {carryIn !== 0 && (
              <div className="flex justify-between text-red-600">
                <span>หัก หนี้ยกมาจากงวดก่อน</span>
                <span className="font-medium">−{formatMoney(carryIn)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-200 pt-1 font-semibold">
              <span>ยอดจ่ายจริงงวดนี้</span>
              <span>{formatMoney(payable > 0 ? payable : 0)}</span>
            </div>
            {wht > 0 && (
              <>
                <div className="flex justify-between text-zinc-600">
                  <span>หักภาษี ณ ที่จ่าย 3%</span>
                  <span className="font-medium">−{formatMoney(wht)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-300 pt-1 text-base font-bold">
                  <span>ยอดโอนสุทธิ</span>
                  <span>{formatMoney(paidNet)}</span>
                </div>
              </>
            )}
            {carryOut > 0 && (
              <div className="flex justify-between text-red-600">
                <span>หนี้ยกไปงวดถัดไป{wht > 0 && payable < wht ? " (รวมภาษีที่บริษัทออกแทน)" : ""}</span>
                <span className="font-semibold">{formatMoney(carryOut)}</span>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-zinc-300 mt-6 text-center print:text-zinc-400">
          พิมพ์โดยระบบ Mena Partner · {formatDate(new Date().toISOString())}
        </p>
      </div>

      <style>{`
        @media print {
          body { margin: 0; }
          .print-page { max-width: 100%; box-shadow: none; }
        }
        @page { margin: 10mm; size: A4; }
      `}</style>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-zinc-400 w-28 shrink-0">{label}:</span>
      <span className={bold ? "font-semibold" : "font-normal"}>{value}</span>
    </div>
  )
}
