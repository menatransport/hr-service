"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { usePartnerSession } from "@/lib/partner/auth/client"
import Link from "next/link"
import {
  Lock, CheckCircle, FileEdit, Eye, Upload, Calculator,
  ArrowRight, AlertTriangle, Truck, Fuel, Wrench, SlidersHorizontal,
  TrendingDown, ChevronDown, ChevronUp,
} from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { formatMonth, formatMoney } from "@/lib/partner/utils"

type Phase = "draft" | "review" | "approved" | "locked"

interface MonthStatus { month: string; phase: Phase; updatedAt: string; updatedBy?: string }

interface MonthSummary {
  month: string
  checklist: {
    trips:       { count: number; ok: boolean }
    fuel:        { count: number; ok: boolean }
    repair:      { count: number; ok: boolean }
    adjustments: { count: number; total: number }
  }
  summary: { driverCount: number; activeDrivers: number; totalIncome: number; totalNetPay: number }
  problems: {
    noFuel:      { contractCode: string; driverName: string }[]
    negativePay: { contractCode: string; driverName: string; netPay: number }[]
  }
}

const PHASE_ORDER: Phase[] = ["draft", "review", "approved", "locked"]
const PHASE_LABEL: Record<Phase, string> = { draft: "ร่าง", review: "ตรวจสอบ", approved: "อนุมัติ", locked: "ล็อค" }
const PHASE_COLOR: Record<Phase, string> = {
  draft:    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  review:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  locked:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
}
const PHASE_ICON: Record<Phase, React.ReactNode> = {
  draft:    <FileEdit className="w-4 h-4" />,
  review:   <Eye className="w-4 h-4" />,
  approved: <CheckCircle className="w-4 h-4" />,
  locked:   <Lock className="w-4 h-4" />,
}

export default function AdminMonthPage() {
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  const [statuses, setStatuses]       = useState<MonthStatus[]>([])
  const [payrollMonths, setPayrollMonths] = useState<string[]>([])
  const [summaries, setSummaries]     = useState<Record<string, MonthSummary>>({})
  const [expanded, setExpanded]       = useState<string | null>(null)
  const [advancing, setAdvancing]     = useState<string | null>(null)
  const [calculating, setCalculating] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/api/partner/month-status").then((r) => r.ok ? r.json() : []),
      fetch("/api/partner/payroll/months").then((r) => r.ok ? r.json() : []),
    ]).then(([s, m]) => {
      setStatuses(s)
      setPayrollMonths(m)
      // Auto-expand the most recent month
      const all = Array.from(new Set([...s.map((x: MonthStatus) => x.month), ...m])).sort((a: string, b: string) => b.localeCompare(a))
      if (all.length > 0) setExpanded(all[0] as string)
    })
  }, [])

  const months = Array.from(new Set([...statuses.map((s) => s.month), ...payrollMonths]))
    .sort((a, b) => b.localeCompare(a))

  function getStatus(month: string): MonthStatus {
    return statuses.find((s) => s.month === month) ?? { month, phase: "draft", updatedAt: "" }
  }

  const loadSummary = useCallback(async (month: string) => {
    if (summaries[month]) return
    const r = await fetch(`/api/partner/admin/month-summary?month=${month}`)
    if (r.ok) {
      const data = await r.json() as MonthSummary
      setSummaries((prev) => ({ ...prev, [month]: data }))
    }
  }, [summaries])

  function toggleExpand(month: string) {
    if (expanded === month) {
      setExpanded(null)
    } else {
      setExpanded(month)
      loadSummary(month)
    }
  }

  async function advance(month: string, phase: Phase) {
    if (!isAdmin) return
    setAdvancing(month)
    try {
      await fetch("/api/partner/month-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, phase }),
      })
      setStatuses((prev) => {
        const exists = prev.find((s) => s.month === month)
        const updated = { month, phase, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email ?? "" }
        return exists ? prev.map((s) => s.month === month ? updated : s) : [...prev, updated]
      })
    } finally {
      setAdvancing(null)
    }
  }

  async function calculate(month: string) {
    if (!isAdmin) return
    setCalculating(month)
    try {
      const r = await fetch(`/api/partner/payroll/calculate?month=${month}`, { method: "POST" })
      const data = await r.json()
      setSummaries((prev) => { const n = { ...prev }; delete n[month]; return n })
      await loadSummary(month)
      toast.success(`คำนวณเสร็จ: ${data.updated} ราย อัปเดต, ${data.skipped} ข้าม, ${data.errors} ผิดพลาด`)
    } finally {
      setCalculating(null)
    }
  }

  if (!isAdmin) return <div className="p-8 text-zinc-400">เฉพาะผู้ดูแลระบบเท่านั้น</div>

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-widest mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 leading-none">จัดการรอบเดือน</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/partner/import">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Upload className="w-3.5 h-3.5" /> นำเข้า Excel
            </Button>
          </Link>
          <Link href="/partner/payroll">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Eye className="w-3.5 h-3.5" /> ดูสลิป
            </Button>
          </Link>
        </div>
      </div>

      {months.length === 0 ? (
        <div className="text-zinc-400 text-sm">ไม่พบข้อมูลเดือน</div>
      ) : (
        <div className="space-y-3">
          {months.map((month) => {
            const status   = getStatus(month)
            const idx      = PHASE_ORDER.indexOf(status.phase)
            const next     = PHASE_ORDER[idx + 1] as Phase | undefined
            const isLocked = status.phase === "locked"
            const isOpen   = expanded === month
            const smry     = summaries[month]

            const problemCount = smry
              ? smry.problems.noFuel.length + smry.problems.negativePay.length
              : 0

            return (
              <div key={month} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  onClick={() => toggleExpand(month)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 w-32 shrink-0">
                      {formatMonth(month)}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${PHASE_COLOR[status.phase]}`}>
                      {PHASE_ICON[status.phase]}
                      {PHASE_LABEL[status.phase]}
                    </span>
                    {problemCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        <AlertTriangle className="w-3 h-3" /> {problemCount} ปัญหา
                      </span>
                    )}
                    {smry && (
                      <span className="text-xs text-zinc-400 hidden sm:block">
                        {smry.summary.driverCount} คน · Net {formatMoney(smry.summary.totalNetPay)} บาท
                      </span>
                    )}
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />}
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-4 space-y-4">
                    {/* Checklist */}
                    {smry ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <CheckItem icon={<Truck className="w-4 h-4" />} label="รายเที่ยว" ok={smry.checklist.trips.ok} value={`${smry.checklist.trips.count.toLocaleString()} trips`} />
                        <CheckItem icon={<Fuel className="w-4 h-4" />} label="เชื้อเพลิง" ok={smry.checklist.fuel.ok} value={`${smry.checklist.fuel.count} คน`} />
                        <CheckItem icon={<Wrench className="w-4 h-4" />} label="ค่าซ่อม" ok={smry.checklist.repair.ok} value={`${smry.checklist.repair.count} คน`} />
                        <CheckItem
                          icon={<SlidersHorizontal className="w-4 h-4" />}
                          label="รับ/หักอื่นๆ"
                          ok={true}
                          value={`${smry.checklist.adjustments.count}/${smry.checklist.adjustments.total} คน`}
                        />
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-400 animate-pulse">กำลังโหลดข้อมูล...</div>
                    )}

                    {/* Summary KPIs */}
                    {smry && (
                      <div className="grid grid-cols-3 gap-3">
                        <KpiCard label="จำนวนคน" value={`${smry.summary.driverCount} / ${smry.summary.activeDrivers}`} />
                        <KpiCard label="รายรับรวม" value={`฿${formatMoney(smry.summary.totalIncome)}`} />
                        <KpiCard label="Net Pay รวม" value={`฿${formatMoney(smry.summary.totalNetPay)}`} />
                      </div>
                    )}

                    {/* Problem drivers */}
                    {smry && smry.problems.negativePay.length > 0 && (
                      <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400 mb-2">
                          <TrendingDown className="w-3.5 h-3.5" /> Net pay ติดลบ
                        </div>
                        <div className="space-y-1">
                          {smry.problems.negativePay.map((p) => (
                            <div key={p.contractCode} className="flex items-center justify-between text-xs">
                              <span className="text-red-700 dark:text-red-400">{p.contractCode} — {p.driverName}</span>
                              <span className="font-mono text-red-600 font-semibold">{formatMoney(p.netPay)} บาท</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {smry && smry.problems.noFuel.length > 0 && (
                      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                          <AlertTriangle className="w-3.5 h-3.5" /> ไม่มีข้อมูลเชื้อเพลิง ({smry.problems.noFuel.length} คน)
                        </div>
                        <div className="text-xs text-amber-700 dark:text-amber-400">
                          {smry.problems.noFuel.slice(0, 5).map((p) => p.contractCode).join(", ")}
                          {smry.problems.noFuel.length > 5 && ` และอีก ${smry.problems.noFuel.length - 5} คน`}
                        </div>
                      </div>
                    )}

                    {/* Phase pipeline */}
                    <div className="flex items-center gap-0">
                      {PHASE_ORDER.map((p, i) => {
                        const done    = i < idx
                        const current = i === idx
                        return (
                          <div key={p} className="flex items-center">
                            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                              current
                                ? "bg-emerald-500 text-white"
                                : done
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600"
                            }`}>
                              {done && <CheckCircle className="w-3 h-3" />}
                              {PHASE_LABEL[p]}
                            </div>
                            {i < PHASE_ORDER.length - 1 && (
                              <ArrowRight className={`w-3 h-3 mx-1 ${i < idx ? "text-emerald-400" : "text-zinc-200 dark:text-zinc-700"}`} />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Link href={`/partner/payroll/${month}`}>
                        <Button variant="outline" size="sm">ดูสลิปทั้งหมด</Button>
                      </Link>
                      <Link href={`/partner/adjustments/${month}`}>
                        <Button variant="outline" size="sm">ปรับรับ/หัก</Button>
                      </Link>

                      {!isLocked && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => calculate(month)}
                          disabled={calculating === month}
                          className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
                        >
                          <Calculator className="w-3.5 h-3.5 mr-1" />
                          {calculating === month ? "คำนวณ..." : "คำนวณใหม่"}
                        </Button>
                      )}

                      {next && (
                        <Button
                          size="sm"
                          onClick={() => advance(month, next)}
                          disabled={advancing === month}
                          className={next === "locked" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
                        >
                          {next === "review"   && <><Eye className="w-3.5 h-3.5 mr-1" />ส่งตรวจสอบ</>}
                          {next === "approved" && <><CheckCircle className="w-3.5 h-3.5 mr-1" />อนุมัติ</>}
                          {next === "locked"   && <><Lock className="w-3.5 h-3.5 mr-1" />ล็อคข้อมูล</>}
                        </Button>
                      )}

                      {isLocked && idx > 0 && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => advance(month, PHASE_ORDER[idx - 1])}
                          className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400"
                          disabled={advancing === month}
                        >
                          ปลดล็อค
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CheckItem({ icon, label, ok, value }: { icon: React.ReactNode; label: string; ok: boolean; value: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20"}`}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        {icon} {label}
      </div>
      <div className={`text-xs ${ok ? "text-emerald-600 dark:text-emerald-500" : "text-red-500"}`}>{value}</div>
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">{label}</div>
      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{value}</div>
    </div>
  )
}
