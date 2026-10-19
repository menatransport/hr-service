"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Search } from "lucide-react"
import { Skeleton } from "@/components/partner/ui/skeleton"

type Alert = { type: string; severity: "critical" | "warning" | "info"; contractCode: string; driverName: string; message: string; value?: string }

const TYPE_LABEL: Record<string, string> = {
  negative_pay: "เงินเดือนติดลบ",
  insurance_expired: "ประกัน/ภาษีหมดอายุ",
  insurance_expiring: "ประกัน/ภาษีใกล้หมด",
  repair_budget_critical: "วงเงินซ่อมใกล้เต็ม",
  trip_fee_mismatch: "ค่าขนส่งไม่ตรงเที่ยว",
  overdue_installment: "ค้างชำระค่างวด",
}
const SEV: Record<string, { label: string; color: string }> = {
  critical: { label: "วิกฤต", color: "#ef4444" },
  warning: { label: "เตือน", color: "#f59e0b" },
  info: { label: "ข้อมูล", color: "#0ea5e9" },
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [sev, setSev] = useState("")
  const [type, setType] = useState("")
  const [q, setQ] = useState("")

  useEffect(() => {
    // อ่าน ?type= / ?sev= จาก URL (จากวิดเจ็ตหน้าหลัก) โดยไม่ต้องใช้ Suspense
    const sp = new URLSearchParams(window.location.search)
    if (sp.get("type")) setType(sp.get("type") as string)
    if (sp.get("sev")) setSev(sp.get("sev") as string)
    fetch("/api/partner/alerts").then((r) => (r.ok ? r.json() : [])).then(setAlerts).catch(() => setAlerts([]))
  }, [])

  const byType = useMemo(() => { const c: Record<string, number> = {}; (alerts ?? []).forEach((a) => (c[a.type] = (c[a.type] ?? 0) + 1)); return c }, [alerts])
  const bySev = useMemo(() => { const c: Record<string, number> = {}; (alerts ?? []).forEach((a) => (c[a.severity] = (c[a.severity] ?? 0) + 1)); return c }, [alerts])
  const filtered = useMemo(() => (alerts ?? []).filter((a) =>
    (!sev || a.severity === sev) && (!type || a.type === type) &&
    (!q || `${a.driverName} ${a.contractCode} ${a.message} ${a.value ?? ""}`.toLowerCase().includes(q.toLowerCase()))
  ), [alerts, sev, type, q])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/partner" className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600" aria-label="กลับหน้าหลัก"><ArrowLeft className="w-5 h-5" /></Link>
        <p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">แจ้งเตือน</p>
      </div>
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-5"><AlertTriangle className="w-6 h-6 text-amber-500" /> ต้องดูด่วน {alerts && <span className="text-zinc-400 dark:text-zinc-500 font-normal text-lg">({alerts.length})</span>}</h1>

      {alerts === null ? (
        <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-emerald-600">✓ ไม่มีรายการต้องดูด่วน</div>
      ) : (
        <>
          {/* filter: severity */}
          <div className="flex flex-wrap gap-2 mb-2">
            {[["", "ทั้งหมด", alerts.length], ...Object.keys(SEV).filter((s) => bySev[s]).map((s) => [s, SEV[s].label, bySev[s]] as const)].map(([key, label, n]) => (
              <button key={key as string} onClick={() => setSev(key as string)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${sev === key ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent" : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"}`}>
                {key && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: SEV[key as string]?.color }} />}{label as string} ({n as number})
              </button>
            ))}
          </div>
          {/* filter: type */}
          <div className="flex flex-wrap gap-2 mb-3">
            <button onClick={() => setType("")} className={`px-3 py-1 rounded-full text-xs font-medium border ${type === "" ? "bg-[#C9A227] text-white border-transparent" : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"}`}>ทุกประเภท</button>
            {Object.keys(byType).map((t) => (
              <button key={t} onClick={() => setType(type === t ? "" : t)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${type === t ? "bg-[#C9A227] text-white border-transparent" : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400"}`}>
                {TYPE_LABEL[t] ?? t} ({byType[t]})
              </button>
            ))}
          </div>
          {/* search */}
          <div className="relative mb-3 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ/รหัส"
              className="h-9 w-full text-sm pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
          </div>

          <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">แสดง {filtered.length} รายการ</div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden">
            {filtered.map((a, i) => (
              <Link key={i} href={`/partner/drivers/360/${a.contractCode}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEV[a.severity]?.color }} />
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{a.driverName}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-2">{a.contractCode}</span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] mr-1.5" style={{ background: (SEV[a.severity]?.color ?? "#999") + "22", color: SEV[a.severity]?.color }}>{TYPE_LABEL[a.type] ?? a.type}</span>
                      {a.message}
                    </span>
                  </span>
                </span>
                {a.value && <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0 text-right">{a.value}</span>}
              </Link>
            ))}
            {filtered.length === 0 && <div className="px-4 py-10 text-center text-sm text-zinc-400">ไม่พบรายการตามตัวกรอง</div>}
          </div>
        </>
      )}
    </div>
  )
}
