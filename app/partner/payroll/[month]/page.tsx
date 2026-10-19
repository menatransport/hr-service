/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Printer, ArrowLeft, SlidersHorizontal, Settings } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { formatMoney, formatMonth } from "@/lib/partner/utils"
import type { PayrollEntry, Driver } from "@/lib/partner/types"

type MonthPhase = "draft" | "checked" | "submitted" | "approved" | "locked"

interface RowData {
  entry: PayrollEntry
  driver?: Driver
}

const PHASE_LABEL: Record<MonthPhase, string> = {
  draft:     "จัดทำข้อมูล",
  checked:   "ตรวจแล้ว (แผนกรถร่วม)",
  submitted: "รออนุมัติผู้บริหาร",
  approved:  "อนุมัติแล้ว",
  locked:    "ปิดงวด",
}
const PHASE_COLOR: Record<MonthPhase, string> = {
  draft:     "bg-zinc-100 text-zinc-600",
  checked:   "bg-amber-100 text-amber-700",
  submitted: "bg-sky-100 text-sky-700",
  approved:  "bg-blue-100 text-blue-700",
  locked:    "bg-emerald-100 text-emerald-700",
}

export default function PayrollMonthPage() {
  const { month } = useParams<{ month: string }>()

  const [entries, setEntries]   = useState<PayrollEntry[]>([])
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [phase, setPhase]       = useState<MonthPhase>("draft")
  const [loading, setLoading]   = useState(true)
  const [plantFilter, setPlantFilter] = useState("")

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/partner/payroll?month=${month}`).then((r) => r.ok ? r.json() : []),
      fetch("/api/partner/drivers").then((r) => r.ok ? r.json() : []),
      fetch(`/api/partner/month-status?month=${month}`).then((r) => r.ok ? r.json() : { phase: "draft" }),
    ]).then(([e, d, s]) => {
      setEntries(Array.isArray(e) ? e : [])
      setDrivers(Array.isArray(d) ? d : [])
      const ph = (s as { phase: string }).phase ?? "draft"
      setPhase((ph === "review" ? "checked" : ph) as MonthPhase)
    }).finally(() => setLoading(false))
  }, [month])

  const driverMap = Object.fromEntries(drivers.map((d) => [d.contractCode, d]))

  const plants: string[] = []

  const rows: RowData[] = entries
    .filter((e) => !plantFilter || false)
    .map((e) => ({ entry: e, driver: driverMap[e.contractCode] }))

  const totalIncome     = rows.reduce((s, r) => s + r.entry.totalIncome, 0)
  const totalDeductions = rows.reduce((s, r) => s + r.entry.totalDeductions, 0)
  const totalNetPay     = rows.reduce((s, r) => s + r.entry.netPay, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="text-xs text-zinc-400 animate-pulse">กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-5 print:max-w-none print:p-4">
      {/* Header — hidden on print */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/partner/payroll">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-700">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-none">
                เงินเดือน {formatMonth(month)}
              </h1>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PHASE_COLOR[phase]}`}>
                {PHASE_LABEL[phase]}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{rows.length} คน {plantFilter ? `· ${plantFilter}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {plants.length > 1 && (
            <select
              value={plantFilter}
              onChange={(e) => setPlantFilter(e.target.value)}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 h-8"
            >
              <option value="">ทุกแพลนท์</option>
              {plants.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <Link href={`/partner/adjustments/${month}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" /> ปรับรับ/หัก
            </Button>
          </Link>
          <Link href={`/partner/payroll/${month}/approval`}>
            <Button size="sm" className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <SlidersHorizontal className="w-3.5 h-3.5 rotate-90" /> สรุปงวด/อนุมัติ
            </Button>
          </Link>
          <Link href="/partner/admin/month">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Settings className="w-3.5 h-3.5" /> จัดการรอบ
            </Button>
          </Link>
          <Button
            onClick={() => window.print()}
            size="sm"
            className="h-8 text-xs gap-1.5 bg-zinc-900 hover:bg-zinc-700 text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Printer className="w-3.5 h-3.5" /> พิมพ์
          </Button>
        </div>
      </div>

      {/* Print title */}
      <div className="hidden print:block text-center pb-3 border-b">
        <h1 className="text-xl font-bold">สรุปเงินเดือนรถร่วม Mixer — {formatMonth(month)}</h1>
        {plantFilter && <p className="text-sm text-gray-500">แพลนท์: {plantFilter}</p>}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 print:gap-2">
        {[
          { label: "รายได้รวม", value: totalIncome, color: "text-emerald-600 dark:text-emerald-400" },
          { label: "หักรวม",    value: totalDeductions, color: "text-red-500 dark:text-red-400" },
          { label: "สุทธิรวม",  value: totalNetPay, color: totalNetPay >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-3.5 print:border-gray-300">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xl font-bold tabular-nums leading-none ${color}`}>
              <span className="text-sm font-normal opacity-60">฿</span>{formatMoney(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-auto print:border-gray-300">
        <table className="w-full text-sm print:text-xs">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 print:border-gray-200">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider w-28 print:text-gray-500">รหัส</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500">ชื่อ</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500 hidden lg:table-cell">วัน</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500">เที่ยว</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500">ค่าขนส่ง</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500">รายได้</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-400 uppercase tracking-wider print:text-gray-500">หัก</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-zinc-800 dark:text-zinc-300 uppercase tracking-wider print:text-gray-700">สุทธิ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60 print:divide-gray-200">
            {rows.map(({ entry, driver }) => (
              <tr
                key={entry.contractCode}
                className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors print:border-gray-200 ${
                  entry.netPay < 0 ? "bg-red-50/50 dark:bg-red-950/20 print:bg-red-50" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <Link href={`/partner/payroll/${month}/${entry.contractCode}`} className="font-mono text-[11px] text-zinc-400 hover:text-emerald-600 transition-colors print:text-gray-500 print:no-underline">
                    {entry.contractCode}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-sm text-zinc-700 dark:text-zinc-200 print:text-gray-800">
                  <Link href={`/partner/drivers/360/${entry.contractCode}`} className="hover:text-blue-600 hover:underline print:no-underline">
                    {driver?.driverName ?? entry.contractCode}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-500 hidden lg:table-cell">{entry.workingDays}</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-500">{entry.tripCount}</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{formatMoney(entry.transportFee)}</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-emerald-700 dark:text-emerald-400 font-medium">{formatMoney(entry.totalIncome)}</td>
                <td className="px-4 py-2.5 text-right text-xs tabular-nums text-red-600 dark:text-red-400">{formatMoney(entry.totalDeductions)}</td>
                <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-bold ${entry.netPay < 0 ? "text-red-600" : "text-zinc-900 dark:text-zinc-50"}`}>
                  {formatMoney(entry.netPay)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-zinc-700 print:border-gray-300 bg-zinc-50 dark:bg-zinc-800/40 print:bg-gray-50">
              <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-zinc-500 print:text-gray-500">รวม {rows.length} คน</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums font-bold text-emerald-700">{formatMoney(totalIncome)}</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums font-bold text-red-600">{formatMoney(totalDeductions)}</td>
              <td className={`px-4 py-2.5 text-right text-sm tabular-nums font-bold ${totalNetPay >= 0 ? "text-zinc-900 dark:text-zinc-50" : "text-red-700"}`}>
                {formatMoney(totalNetPay)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
