"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowRight } from "lucide-react"
import { Skeleton } from "@/components/partner/ui/skeleton"

type Alert = { type: string; severity: "critical" | "warning" | "info"; contractCode: string; driverName: string; message: string; value?: string }
const DOT: Record<string, string> = { critical: "#ef4444", warning: "#f59e0b", info: "#0ea5e9" }
const TYPE_LABEL: Record<string, string> = {
  negative_pay: "เงินเดือนติดลบ", insurance_expired: "ประกัน/ภาษีหมดอายุ", insurance_expiring: "ประกัน/ภาษีใกล้หมด",
  repair_budget_critical: "วงเงินซ่อมใกล้เต็ม", trip_fee_mismatch: "ค่าขนส่งไม่ตรงเที่ยว", overdue_installment: "ค้างชำระค่างวด",
}

/** วิดเจ็ตสรุป "ต้องดูด่วน" บนหน้าหลัก — นับตามประเภท + วิกฤตล่าสุด, ดูเต็มที่ /alerts */
export function AlertsWidget() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  useEffect(() => { fetch("/api/partner/alerts").then((r) => (r.ok ? r.json() : [])).then(setAlerts).catch(() => setAlerts([])) }, [])

  if (alerts === null) return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-6"><Skeleton className="h-4 w-40" /><div className="mt-3 flex gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-24" />)}</div></div>
  )
  if (alerts.length === 0) return null

  const crit = alerts.filter((a) => a.severity === "critical").length
  const byType: Record<string, number> = {}
  alerts.forEach((a) => (byType[a.type] = (byType[a.type] ?? 0) + 1))
  const topCrit = alerts.filter((a) => a.severity === "critical").slice(0, 4)

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">ต้องดูด่วน ({alerts.length})</h2>
          {crit > 0 && <span className="text-[11px] font-semibold text-red-600 bg-red-100 dark:bg-red-950/40 rounded-full px-2 py-0.5">{crit} วิกฤต</span>}
        </div>
        <Link href="/partner/alerts" className="text-xs font-semibold text-[#8C6B1F] dark:text-[#E7C86E] hover:underline flex items-center gap-1">ดูทั้งหมด <ArrowRight className="w-3 h-3" /></Link>
      </div>

      {/* สรุปตามประเภท (คลิกไปหน้าเต็มพร้อมกรอง) */}
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <Link key={t} href={`/partner/alerts?type=${t}`}
            className="text-xs px-2.5 py-1 rounded-full bg-white/70 dark:bg-zinc-800/50 border border-amber-200/70 dark:border-amber-900/30 text-zinc-600 dark:text-zinc-300 hover:border-amber-400">
            {TYPE_LABEL[t] ?? t} <span className="font-bold tabular-nums">{n}</span>
          </Link>
        ))}
      </div>

      {/* วิกฤตล่าสุด */}
      {topCrit.length > 0 && (
        <div className="space-y-1">
          {topCrit.map((a, i) => (
            <Link key={i} href={`/partner/drivers/360/${a.contractCode}`} className="flex items-center justify-between gap-3 text-sm px-2 py-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-zinc-800/50">
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOT[a.severity] }} />
                <span className="font-medium text-zinc-700 dark:text-zinc-200 truncate">{a.driverName}</span>
                <span className="text-zinc-400 truncate hidden sm:inline">· {a.message}</span>
              </span>
              {a.value && <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">{a.value}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
