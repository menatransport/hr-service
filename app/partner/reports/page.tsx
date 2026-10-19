"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, Download, Printer, CalendarDays } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { formatMoney, formatMonth } from "@/lib/partner/utils"
import { exportToExcel } from "@/lib/partner/export-excel"

type TrendPoint = {
  month: string
  totalNetPay: number
  totalIncome: number
  totalDeductions: number
  count: number
}

type Row = {
  contractCode: string
  driverName: string
  truckNumber: string
  plant: string
  tripCount: number
  totalTripFee: number
  workingDays: number
  totalIncome: number
  totalDeductions: number
  netPay: number
  hasEntry: boolean
}

type Summary = {
  totalDrivers: number
  driversWithEntry: number
  grandNetPay: number
  grandIncome: number
  grandDeductions: number
}

type Report = { month: string; summary: Summary; rows: Row[] }

type SortKey = "contractCode" | "driverName" | "plant" | "tripCount" | "totalTripFee" | "workingDays" | "totalIncome" | "totalDeductions" | "netPay"
type SortDir = "asc" | "desc"

export default function ReportsPage() {
  const [months, setMonths]   = useState<string[]>([])
  const [month, setMonth]     = useState<string | null>(null)
  const [data, setData]       = useState<Report | null>(null)
  const [trend, setTrend]     = useState<TrendPoint[]>([])
  const [q, setQ]             = useState("")
  const [loading, setLoading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("contractCode")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  useEffect(() => {
    fetch("/api/partner/payroll/months")
      .then((r) => r.ok ? r.json() : [])
      .then((ms: string[]) => { setMonths(ms); if (ms.length > 0) setMonth(ms[0]) })
      .catch(() => {})
    fetch("/api/partner/reports/trend")
      .then((r) => r.ok ? r.json() : [])
      .then((t: TrendPoint[]) => setTrend(Array.isArray(t) ? t : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!month) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/partner/reports/netpay?month=${month}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [month])

  const filtered = data
    ? data.rows
        .filter((r) =>
          [r.contractCode, r.driverName, r.truckNumber, r.plant]
            .some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()))
        )
        .sort((a, b) => {
          const av = a[sortKey] ?? ""
          const bv = b[sortKey] ?? ""
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv))
          return sortDir === "asc" ? cmp : -cmp
        })
    : []

  const prevTrend = month && trend.length > 1
    ? trend.slice(0, -1).findLast((t) => t.month < month)
    : null

  function momPct(current: number, prev: number | undefined): string | null {
    if (!prev || prev === 0) return null
    const pct = ((current - prev) / Math.abs(prev)) * 100
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-zinc-300 ml-0.5">↕</span>
    return <span className="text-emerald-500 ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  async function exportExcel() {
    if (!data) return
    const rows = filtered.map((r) => ({
      "รหัส": r.contractCode,
      "ชื่อคนขับ": r.driverName,
      "เบอร์รถ": r.truckNumber,
      "แพล้นท์": r.plant,
      "เที่ยว": r.tripCount,
      "ค่าขนส่ง(เที่ยว)": r.totalTripFee,
      "วันทำงาน": r.workingDays,
      "รายรับ": r.totalIncome,
      "รายหัก": r.totalDeductions,
      "รับสุทธิ": r.netPay,
    }))
    await exportToExcel([{ name: "สรุปเงินเดือน", rows }], `payroll-${month}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">รายงานสรุปเงินเดือน</h1>
          {data && <p className="text-sm text-zinc-400 mt-0.5">{formatMonth(data.month)}</p>}
        </div>
        <div className="flex items-center gap-2">
          {month && data && data.summary.driversWithEntry > 0 && (
            <Link
              href={`/partner/payroll/${month}/print-all`}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์ใบแจ้งเงินเดือน
            </Link>
          )}
          <Link
            href="/partner/reports/annual"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            รายงานประจำปี
          </Link>
          <button
            onClick={exportExcel}
            disabled={!data}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2 disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
          <select
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white dark:bg-zinc-900 dark:border-zinc-700"
          >
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              {
                label: "รถร่วมทั้งหมด",
                value: `${data.summary.totalDrivers} คัน`,
                color: "", mom: null,
              },
              {
                label: "รวมรายรับ",
                value: formatMoney(data.summary.grandIncome),
                color: "text-emerald-600",
                mom: momPct(data.summary.grandIncome, prevTrend?.totalIncome),
              },
              {
                label: "รวมรายหัก",
                value: formatMoney(data.summary.grandDeductions),
                color: "text-red-500",
                mom: momPct(data.summary.grandDeductions, prevTrend?.totalDeductions),
              },
              {
                label: "รวมสุทธิ",
                value: formatMoney(data.summary.grandNetPay),
                color: "text-zinc-800 dark:text-zinc-100",
                mom: momPct(data.summary.grandNetPay, prevTrend?.totalNetPay),
              },
            ].map(({ label, value, color, mom }) => (
              <div key={label} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-5 py-4">
                <p className="text-xs text-zinc-400 mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                {mom && (
                  <p className={`text-[10px] mt-0.5 ${mom.startsWith("+") ? "text-emerald-500" : "text-red-400"}`}>
                    {mom} vs เดือนก่อน
                  </p>
                )}
              </div>
            ))}
          </div>
          {/* Plant summary */}
          {(() => {
            const plantMap: Record<string, { count: number; netPay: number; trips: number }> = {}
            for (const r of data.rows.filter((r) => r.hasEntry)) {
              const p = r.plant || "ไม่ระบุ"
              if (!plantMap[p]) plantMap[p] = { count: 0, netPay: 0, trips: 0 }
              plantMap[p].count += 1
              plantMap[p].netPay += r.netPay
              plantMap[p].trips += r.tripCount
            }
            const plants = Object.entries(plantMap).sort((a, b) => b[1].netPay - a[1].netPay)
            if (plants.length === 0) return null
            return (
              <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">สรุปตามแพล้นท์</span>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {plants.map(([plant, stats]) => (
                    <div key={plant} className="px-5 py-2.5 flex items-center text-sm gap-4">
                      <span className="font-medium w-32 shrink-0">{plant}</span>
                      <span className="text-zinc-500 text-xs w-16">{stats.count} คัน</span>
                      <span className="text-zinc-500 text-xs w-20">{stats.trips} เที่ยว</span>
                      <span className="text-emerald-600 font-semibold ml-auto">{formatMoney(stats.netPay)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </>
      )}

      <div className="flex items-center gap-2 mb-4">
        <Search className="w-4 h-4 text-zinc-400" />
        <Input
          placeholder="ค้นหา รหัส / ชื่อ / เบอร์รถ / แพล้นท์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        {q && data && (
          <span className="text-xs text-zinc-400">พบ {filtered.length} รายการ</span>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              {([
                ["contractCode", "รหัส",         "text-left"],
                ["driverName",   "ชื่อคนขับ",    "text-left"],
                [null,           "เบอร์รถ",       "text-left"],
                ["plant",        "แพล้นท์",       "text-left"],
                ["tripCount",    "เที่ยว",        "text-right"],
                ["totalTripFee", "ค่าขนส่ง(เที่ยว)", "text-right"],
                ["workingDays",  "วัน",           "text-right"],
                ["totalIncome",  "รายรับรวม",    "text-right"],
                ["totalDeductions","รายหักรวม",  "text-right"],
                ["netPay",       "รับสุทธิ",     "text-right"],
              ] as [SortKey | null, string, string][]).map(([k, label, align]) => (
                <th
                  key={label}
                  className={`px-4 py-3 ${align} ${k ? "cursor-pointer select-none hover:text-zinc-700" : ""}`}
                  onClick={k ? () => toggleSort(k) : undefined}
                >
                  {label}{k && <SortArrow k={k} />}
                </th>
              ))}
              <th className="px-4 py-3 text-center">สถานะ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-zinc-400">กำลังโหลด...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-zinc-400">ไม่พบข้อมูล</td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.contractCode} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/partner/payroll/${month}/${r.contractCode}`} className="text-emerald-600 hover:underline">
                      {r.contractCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{r.driverName}</td>
                  <td className="px-4 py-3 text-zinc-500">{r.truckNumber}</td>
                  <td className="px-4 py-3 text-zinc-500">{r.plant}</td>
                  <td className="px-4 py-3 text-right">{r.tripCount}</td>
                  <td className="px-4 py-3 text-right text-blue-600 text-xs">{r.totalTripFee > 0 ? formatMoney(r.totalTripFee) : "-"}</td>
                  <td className="px-4 py-3 text-right">{r.workingDays}</td>
                  <td className="px-4 py-3 text-right text-emerald-600">
                    <div>{formatMoney(r.totalIncome)}</div>
                    {r.hasEntry && r.totalTripFee > 0 && Math.abs(r.totalIncome - r.totalTripFee) > 500 && (
                      <div className="text-[10px] text-amber-500">≠ เที่ยว</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-red-500">{formatMoney(r.totalDeductions)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${r.netPay < 0 ? "text-red-600" : ""}`}>
                    {formatMoney(r.netPay)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.hasEntry ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {r.hasEntry ? "บันทึกแล้ว" : "รอบันทึก"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
