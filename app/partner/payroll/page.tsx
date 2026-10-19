"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { confirm } from "@/components/partner/ui/confirm"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Printer, ChevronRight, Zap, Trash2, Download } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { formatMonth, formatMoney, prevMonth as getPrevMonth } from "@/lib/partner/utils"
import { exportToExcel } from "@/lib/partner/export-excel"
import type { Driver, PayrollEntry } from "@/lib/partner/types"
import { usePartnerSession } from "@/lib/partner/auth/client"
export default function PayrollPage() {
  const router = useRouter()
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  const [months, setMonths]     = useState<string[]>([])
  const [month, setMonth]       = useState<string | null>(null)
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [entries, setEntries]   = useState<PayrollEntry[]>([])
  const [prevEntries, setPrevEntries] = useState<PayrollEntry[]>([])
  const [q, setQ]               = useState("")
  const [plantFilter, setPlantFilter] = useState("")
  const [showPending, setShowPending] = useState(false)
  const [loading, setLoading]   = useState(false)

  const loadEntries = useCallback(async (m: string) => {
    setLoading(true)
    try {
      const [curr, prev] = await Promise.all([
        fetch(`/api/partner/payroll?month=${m}`).then((r) => r.ok ? r.json() : []),
        fetch(`/api/partner/payroll?month=${getPrevMonth(m)}`).then((r) => r.ok ? r.json() : []),
      ])
      setEntries(Array.isArray(curr) ? curr : [])
      setPrevEntries(Array.isArray(prev) ? prev : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetch("/api/partner/payroll/months")
      .then((r) => r.ok ? r.json() : [])
      .then((ms: string[]) => { setMonths(ms); if (ms.length > 0) setMonth(ms[0]) })
      .catch(() => {})
    fetch("/api/partner/drivers?status=active")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setDrivers(Array.isArray(d) ? d : []))
      .catch(() => setDrivers([]))
  }, [])

  useEffect(() => {
    if (!month) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEntries(month)
  }, [month, loadEntries])

  const entryMap     = Object.fromEntries(entries.map((e) => [e.contractCode, e]))
  const prevEntryMap = Object.fromEntries(prevEntries.map((e) => [e.contractCode, e]))

  const plants: string[] = []

  const filtered = drivers.filter((d) => {
    const matchQ = !q || [d.contractCode ?? "", d.driverName ?? ""]
      .some((v) => v.toLowerCase().includes(q.toLowerCase()))
    const matchPending = !showPending || !entryMap[d.contractCode ?? ""]
    const matchPlant = !plantFilter
    return matchQ && matchPending && matchPlant
  })

  const recorded = entries.length
  const totalNetPay = entries.reduce((s, e) => s + (e.netPay ?? 0), 0)
  const entryCodeSet = new Set(entries.map((e) => e.contractCode))
  const nextPending = drivers.find((d) => !entryCodeSet.has(d.contractCode ?? ""))
  const pendingCount = drivers.filter((d) => !entryCodeSet.has(d.contractCode ?? "")).length

  async function handleBatchCreate() {
    if (!month) return
    const pending = drivers.filter((d) => !entryCodeSet.has(d.contractCode ?? "")).length
    if (!await confirm(`สร้างเงินเดือนอัตโนมัติให้ ${pending} คนที่ยังไม่บันทึก?\n\nระบบจะดึงค่าขนส่งจากรายเที่ยว, คำนวณค่าดำเนินการ 8%, และเติมค่างวด+ประกันจากสัญญาอัตโนมัติ`)) return
    setLoading(true)
    try {
      const r = await fetch(`/api/partner/payroll/batch-create?month=${month}`, { method: "POST" })
      const d = await r.json()
      if (r.ok) {
        toast.success(`สร้างสำเร็จ ${d.created} รายการ${d.errors > 0 ? ` (${d.errors} ผิดพลาด)` : ""}`)
        await loadEntries(month)
      } else {
        toast.error(d.error ?? "เกิดข้อผิดพลาด")
      }
    } finally { setLoading(false) }
  }

  async function handleBatchDelete() {
    if (!month) return
    if (!await confirm(`ลบข้อมูลเงินเดือนทั้งหมดของเดือน ${formatMonth(month)} (${recorded} รายการ)?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return
    setLoading(true)
    try {
      const r = await fetch(`/api/partner/payroll?month=${month}`, { method: "DELETE" })
      const d = await r.json()
      if (r.ok) {
        toast.success(`ลบแล้ว ${d.deleted} รายการ`)
        await loadEntries(month)
      }
    } finally { setLoading(false) }
  }

  async function handleExportExcel() {
    if (!month || entries.length === 0) return
    const driverMap = Object.fromEntries(drivers.map((d) => [d.contractCode, d]))

    const rows = entries.map((e) => {
      const d = driverMap[e.contractCode]
      return {
        "รหัส": e.contractCode,
        "ชื่อ": d?.driverName ?? "",
        "แพล้นท์": d?.plant ?? "",
        "เที่ยว": e.tripCount,
        "วันทำงาน": e.workingDays,
        "ค่าขนส่ง": e.transportFee,
        "OT": e.ot,
        "รับอื่นๆ WHT": e.otherIncomeWHT,
        "รับอื่นๆ ไม่WHT": e.otherIncomeNoWHT,
        "รวมรับ": e.totalIncome,
        "เชื้อเพลิง": e.fuel,
        "GPS": e.gps,
        "ซ่อมใน": e.repairInHouse,
        "ซ่อมนอก": e.repairOutside,
        "ค่าดำเนินการ8%": e.mgmtFee8pct,
        "ค่าแรง": e.labor,
        "ยาง": e.tire,
        "ปะยาง": e.tirePatch,
        "ล้างรถ": e.carWash,
        "ต่อภาษี": e.taxInsurance,
        "ค่างวด": e.installment,
        "ผ่อนซ่อม": e.repairInstallment,
        "ดาวน์": e.downPaymentInstallment,
        "รวมหัก": e.totalDeductions,
        "สุทธิ": e.netPay,
      }
    })

    await exportToExcel([{ name: "เงินเดือน", rows }], `payroll-${month}`)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">เงินเดือน</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            บันทึกแล้ว {recorded} / {drivers.length} คน
            {recorded > 0 && <> · สุทธิรวม <span className="text-zinc-600 font-medium">{formatMoney(totalNetPay)}</span></>}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {pendingCount > 0 && month && (
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={handleBatchCreate}
              className="flex items-center gap-1 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
              title={`สร้างเงินเดือนอัตโนมัติให้ ${pendingCount} คนที่ยังไม่บันทึก`}
            >
              <Zap className="w-3 h-3" />
              สร้างอัตโนมัติ ({pendingCount})
            </Button>
          )}
          {nextPending && month && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push(`/partner/payroll/${month}/${nextPending.contractCode}`)}
              className="flex items-center gap-1 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              กรอกถัดไป ({nextPending.contractCode})
              <ChevronRight className="w-3 h-3" />
            </Button>
          )}
          {month && recorded > 0 && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
          )}
          {month && recorded > 0 && (
            <Link
              href={`/partner/payroll/${month}`}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
            >
              สรุปรอบเดือน
            </Link>
          )}
          {month && recorded > 0 && (
            <Link
              href={`/partner/payroll/${month}/print-all`}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
            >
              <Printer className="w-3.5 h-3.5" />
              พิมพ์ทั้งหมด
            </Link>
          )}
          {isAdmin && month && recorded > 0 && (
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50"
              title="ลบข้อมูลเงินเดือนทั้งหมดของเดือนนี้"
            >
              <Trash2 className="w-3.5 h-3.5" />
              ล้างเดือนนี้
            </button>
          )}
          <select
            value={month ?? ""}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white dark:bg-zinc-900 dark:border-zinc-700"
          >
            {months.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
          </select>
        </div>
      </div>

      {/* Progress bar */}
      {drivers.length > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-500 mb-1">
            <span>บันทึกแล้ว {recorded} / {drivers.length} คน</span>
            <span>{Math.round((recorded / drivers.length) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${recorded === drivers.length ? "bg-emerald-500" : "bg-amber-400"}`}
              style={{ width: `${(recorded / drivers.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Plant filter tabs */}
      {plants.length > 1 && (
        <div className="flex items-center gap-1 mb-4 flex-wrap">
          <button
            onClick={() => setPlantFilter("")}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              !plantFilter
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            ทั้งหมด
          </button>
          {plants.map((p) => {
            const driversInPlant = drivers.filter((_d) => false || p)
            const recordedInPlant = driversInPlant.filter((d) => entryMap[d.contractCode ?? ""]).length
            return (
              <button
                key={p}
                onClick={() => setPlantFilter(p)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  plantFilter === p
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                }`}
              >
                {p}
                <span className="ml-1 text-zinc-400">
                  ({recordedInPlant}/{driversInPlant.length})
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Search className="w-4 h-4 text-zinc-400" />
        <Input
          placeholder="ค้นหา รหัส / ชื่อ / แพล้นท์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showPending}
            onChange={(e) => setShowPending(e.target.checked)}
            className="rounded"
          />
          แสดงเฉพาะที่ยังไม่บันทึก
        </label>
        {showPending && <span className="text-xs text-amber-600 font-medium">{filtered.length} คน</span>}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 uppercase tracking-wide">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">รหัส / ชื่อ</th>
              <th className="px-2.5 py-2 text-right font-semibold w-24">เที่ยว / วันทำงาน</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">รายรับ / OT</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">รายหัก / ดำเนินการ</th>
              <th className="px-2.5 py-2 text-right font-semibold w-32">สุทธิ / เทียบเดือนก่อน</th>
              <th className="px-2.5 py-2 text-center font-semibold w-24">สถานะ</th>
              <th className="px-2.5 py-2 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">กำลังโหลด...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-400">ไม่พบข้อมูล</td></tr>
            ) : filtered.map((d) => {
              const entry     = entryMap[d.contractCode ?? ""]
              const prevEntry = prevEntryMap[d.contractCode ?? ""]
              const delta     = entry && prevEntry ? entry.netPay - prevEntry.netPay : null

              return (
                <tr key={d._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {/* รหัส / ชื่อ */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="font-medium font-mono text-zinc-800 dark:text-zinc-100">{d.contractCode}</div>
                    <div className="text-[11px] text-zinc-500 truncate max-w-[200px]" title={d.driverName}>{d.driverName}</div>
                  </td>

                  {/* เที่ยว / วันทำงาน */}
                  <td className="px-2.5 py-2 align-top text-right tabular-nums text-zinc-600">
                    {entry ? (
                      <>
                        <div>{entry.tripCount} <span className="text-[10px] text-zinc-400">เที่ยว</span></div>
                        <div className="text-[10px] text-zinc-400">{entry.workingDays} วัน</div>
                      </>
                    ) : <span className="text-zinc-300">-</span>}
                  </td>

                  {/* รายรับ / OT */}
                  <td className="px-2.5 py-2 align-top text-right tabular-nums">
                    {entry ? (
                      <>
                        <div className="text-emerald-600 font-medium">{formatMoney(entry.totalIncome)}</div>
                        {entry.ot ? <div className="text-[10px] text-zinc-400">OT {formatMoney(entry.ot)}</div> : null}
                      </>
                    ) : <span className="text-zinc-300">-</span>}
                  </td>

                  {/* รายหัก / ค่าดำเนินการ */}
                  <td className="px-2.5 py-2 align-top text-right tabular-nums">
                    {entry ? (
                      <>
                        <div className="text-red-500 font-medium">{formatMoney(entry.totalDeductions)}</div>
                        {entry.mgmtFee8pct ? <div className="text-[10px] text-zinc-400">ดำเนินการ {formatMoney(entry.mgmtFee8pct)}</div> : null}
                      </>
                    ) : <span className="text-zinc-300">-</span>}
                  </td>

                  {/* สุทธิ / เทียบเดือนก่อน */}
                  <td className="px-2.5 py-2 align-top text-right tabular-nums">
                    {entry ? (
                      <>
                        <div className={`font-semibold ${entry.netPay < 0 ? "text-red-600" : "text-zinc-800 dark:text-zinc-100"}`}>
                          {formatMoney(entry.netPay)}
                        </div>
                        {delta !== null ? (
                          <div className={`text-[10px] font-medium ${
                            delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-zinc-400"
                          }`}>
                            {delta > 0 ? "+" : ""}{formatMoney(delta)}
                          </div>
                        ) : null}
                      </>
                    ) : <span className="text-zinc-300">-</span>}
                  </td>

                  {/* สถานะ */}
                  <td className="px-2.5 py-2 align-top text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                      entry ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {entry ? "บันทึกแล้ว" : "ยังไม่บันทึก"}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-2.5 py-2 align-top text-right">
                    <div className="flex items-center justify-end gap-2">
                      {entry && (
                        <Link
                          href={`/partner/payroll/${month}/${d.contractCode}/print`}
                          className="text-zinc-400 hover:text-zinc-600"
                          title="พิมพ์ใบแจ้งเงินเดือน"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </Link>
                      )}
                      <Link
                        href={`/partner/payroll/${month}/${d.contractCode}`}
                        className="text-emerald-600 hover:underline whitespace-nowrap"
                      >
                        {entry ? "แก้ไข →" : "กรอก →"}
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {/* Totals row */}
          {!loading && filtered.length > 0 && entries.length > 0 && (() => {
            const visibleEntries = filtered.map((d) => entryMap[d.contractCode ?? ""]).filter(Boolean)
            if (visibleEntries.length === 0) return null
            const sumIncome     = visibleEntries.reduce((s, e) => s + (e.totalIncome ?? 0), 0)
            const sumDeductions = visibleEntries.reduce((s, e) => s + (e.totalDeductions ?? 0), 0)
            const sumNet        = visibleEntries.reduce((s, e) => s + (e.netPay ?? 0), 0)
            const prevVisible   = filtered.map((d) => prevEntryMap[d.contractCode ?? ""]).filter(Boolean)
            const prevSumNet    = prevVisible.reduce((s, e) => s + (e.netPay ?? 0), 0)
            const totalDelta    = prevVisible.length > 0 ? sumNet - prevSumNet : null
            return (
              <tfoot>
                <tr className="bg-zinc-50 dark:bg-zinc-800 font-semibold border-t-2 border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-2" colSpan={2}>รวม {visibleEntries.length} คน</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-emerald-600">{formatMoney(sumIncome)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-red-500">{formatMoney(sumDeductions)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    <div>{formatMoney(sumNet)}</div>
                    {totalDelta !== null && (
                      <div className={`text-[10px] font-medium ${
                        totalDelta > 0 ? "text-emerald-600" : totalDelta < 0 ? "text-red-500" : "text-zinc-400"
                      }`}>
                        {totalDelta > 0 ? "+" : ""}{formatMoney(totalDelta)}
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2" colSpan={2} />
                </tr>
              </tfoot>
            )
          })()}
        </table>
        </div>
      </div>
    </div>
  )
}
