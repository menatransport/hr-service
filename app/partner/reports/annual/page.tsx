"use client"

import { useEffect, useState } from "react"
import { Download } from "lucide-react"
import { formatMoney } from "@/lib/partner/utils"
import { exportToExcel } from "@/lib/partner/export-excel"

type Row = {
  contractCode: string
  driverName: string
  plant: string
  truckNumber: string
  months: number
  workingDays: number
  tripCountActual: number
  tripFeeTotal: number
  totalIncome: number
  totalDeductions: number
  netPay: number
}

type MonthBreakdown = {
  month: string
  totalIncome: number
  totalDeductions: number
  netPay: number
  count: number
}

type Summary = {
  year: string
  monthCount: number
  driverCount: number
  grandIncome: number
  grandDeductions: number
  grandNetPay: number
  grandTrips: number
}

type Report = { year: string; summary: Summary; rows: Row[]; monthBreakdown: MonthBreakdown[] }

type SortKey = "contractCode" | "driverName" | "plant" | "months" | "tripCountActual" | "totalIncome" | "totalDeductions" | "netPay"
type SortDir = "asc" | "desc"

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

function thaiYear(year: string): string {
  return `${year}/${Number(year) + 543}`
}

export default function AnnualReportPage() {
  const currentYear = new Date().getFullYear()
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2].map(String)

  const [year, setYear]       = useState(String(currentYear))
  const [data, setData]       = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("netPay")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/partner/reports/annual?year=${year}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [year])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-zinc-300 ml-0.5">↕</span>
    return <span className="text-emerald-500 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  const sorted = data
    ? [...data.rows].sort((a, b) => {
        const av = a[sortKey] ?? ""
        const bv = b[sortKey] ?? ""
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv))
        return sortDir === "asc" ? cmp : -cmp
      })
    : []

  async function exportExcel() {
    if (!data) return
    const rows = sorted.map((r) => ({
      "รหัส": r.contractCode,
      "ชื่อคนขับ": r.driverName,
      "แพล้นท์": r.plant,
      "เบอร์รถ": r.truckNumber,
      "เดือนที่บันทึก": r.months,
      "วันทำงาน": r.workingDays,
      "เที่ยวทั้งปี": r.tripCountActual,
      "รายรับรวม": r.totalIncome,
      "รายหักรวม": r.totalDeductions,
      "รับสุทธิรวม": r.netPay,
    }))
    await exportToExcel([{ name: `รายงานปี ${year}`, rows }], `annual-${year}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">รายงานประจำปี</h1>
          {data && (
            <p className="text-sm text-zinc-400 mt-0.5">
              ปี {thaiYear(year)} (ค.ศ. {year}) · {data.summary.driverCount} คน · {data.summary.monthCount} เดือน
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={!data}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white dark:bg-zinc-900 dark:border-zinc-700"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>ปี {thaiYear(y)} ({y})</option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: "รายรับรวมทั้งปี",  value: formatMoney(data.summary.grandIncome),     color: "text-emerald-600" },
              { label: "รายหักรวมทั้งปี",  value: formatMoney(data.summary.grandDeductions), color: "text-red-500" },
              { label: "สุทธิรวมทั้งปี",   value: formatMoney(data.summary.grandNetPay),     color: "text-zinc-800 dark:text-zinc-100" },
              { label: "เที่ยวรวมทั้งปี",  value: `${data.summary.grandTrips.toLocaleString()} เที่ยว`, color: "text-blue-600" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-5 py-4">
                <p className="text-xs text-zinc-400 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Month-by-month breakdown */}
          {data.monthBreakdown.length > 0 && (
            <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">รายเดือน</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 text-left">เดือน</th>
                      {THAI_MONTHS.map((m) => (
                        <th key={m} className="px-3 py-2 text-right font-normal text-zinc-400">{m}</th>
                      ))}
                      <th className="px-4 py-2 text-right font-semibold">รวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["totalIncome", "totalDeductions", "netPay"] as const).map((field) => {
                      const label = field === "totalIncome" ? "รายรับ" : field === "totalDeductions" ? "รายหัก" : "สุทธิ"
                      const color = field === "totalIncome" ? "text-emerald-600" : field === "totalDeductions" ? "text-red-500" : "text-zinc-700 dark:text-zinc-200"
                      const total = data.monthBreakdown.reduce((s, m) => s + m[field], 0)
                      return (
                        <tr key={field} className="border-t border-zinc-100 dark:border-zinc-800">
                          <td className={`px-4 py-2 text-xs font-medium ${color}`}>{label}</td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const monthStr = `${year}-${String(i + 1).padStart(2, "0")}`
                            const mb = data.monthBreakdown.find((m) => m.month === monthStr)
                            return (
                              <td key={i} className={`px-3 py-2 text-right text-xs ${color}`}>
                                {mb ? formatMoney(mb[field]) : <span className="text-zinc-200 dark:text-zinc-700">-</span>}
                              </td>
                            )
                          })}
                          <td className={`px-4 py-2 text-right text-xs font-bold ${color}`}>{formatMoney(total)}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2 text-xs font-medium text-zinc-400">คนที่บันทึก</td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthStr = `${year}-${String(i + 1).padStart(2, "0")}`
                        const mb = data.monthBreakdown.find((m) => m.month === monthStr)
                        return (
                          <td key={i} className="px-3 py-2 text-right text-xs text-zinc-400">
                            {mb ? mb.count : <span className="text-zinc-200 dark:text-zinc-700">-</span>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right text-xs text-zinc-400">
                        {data.summary.driverCount}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Per-driver table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              {([
                ["contractCode", "รหัส",         "text-left"],
                ["driverName",   "ชื่อคนขับ",    "text-left"],
                ["plant",        "แพล้นท์",       "text-left"],
                ["months",       "เดือน",         "text-right"],
                ["tripCountActual", "เที่ยว",     "text-right"],
                ["totalIncome",  "รายรับรวม",     "text-right"],
                ["totalDeductions","รายหักรวม",   "text-right"],
                ["netPay",       "สุทธิรวม",      "text-right"],
              ] as [SortKey, string, string][]).map(([k, label, align]) => (
                <th
                  key={k}
                  className={`px-4 py-3 ${align} cursor-pointer select-none hover:text-zinc-700`}
                  onClick={() => toggleSort(k)}
                >
                  {label}<SortArrow k={k} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">กำลังโหลด...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">ไม่มีข้อมูลในปีนี้</td></tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.contractCode} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-medium text-emerald-600">{r.contractCode}</td>
                  <td className="px-4 py-3">{r.driverName}</td>
                  <td className="px-4 py-3 text-zinc-500">{r.plant}</td>
                  <td className="px-4 py-3 text-right text-zinc-500">{r.months}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{r.tripCountActual.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">{formatMoney(r.totalIncome)}</td>
                  <td className="px-4 py-3 text-right text-red-500">{formatMoney(r.totalDeductions)}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatMoney(r.netPay)}</td>
                </tr>
              ))
            )}
            {/* Totals row */}
            {sorted.length > 0 && (
              <tr className="bg-zinc-50 dark:bg-zinc-800 font-semibold text-sm border-t-2 border-zinc-200 dark:border-zinc-700">
                <td className="px-4 py-3" colSpan={4}>รวมทั้งหมด ({sorted.length} คน)</td>
                <td className="px-4 py-3 text-right text-blue-600">
                  {sorted.reduce((s, r) => s + r.tripCountActual, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-emerald-600">
                  {formatMoney(sorted.reduce((s, r) => s + r.totalIncome, 0))}
                </td>
                <td className="px-4 py-3 text-right text-red-500">
                  {formatMoney(sorted.reduce((s, r) => s + r.totalDeductions, 0))}
                </td>
                <td className="px-4 py-3 text-right text-zinc-800 dark:text-zinc-100">
                  {formatMoney(sorted.reduce((s, r) => s + r.netPay, 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
