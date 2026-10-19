/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Users, Truck, FileText, Tag, ShieldCheck, Wrench, ClipboardList,
  Banknote, BadgeCheck, HandCoins, Receipt, SlidersHorizontal, Settings, BarChart3,
} from "lucide-react"
import { statusOf, STATUS_META, type ModuleStatus } from "@/lib/partner/module-status"

// รายการโมดูล (จัดกลุ่มตาม sidebar) — สถานะ ready/testing/dev มาจาก lib/module-status.ts
const STATUS_GROUPS: {
  group: string
  items: { href: string; label: string; icon: React.ReactNode }[]
}[] = [
  {
    group: "ข้อมูลหลัก",
    items: [
      { href: "/partner/drivers",    label: "พนักงานขับรถ", icon: <Users className="w-3.5 h-3.5" /> },
      { href: "/partner/vehicles",   label: "ทะเบียนรถ",     icon: <Truck className="w-3.5 h-3.5" /> },
      { href: "/partner/price-list", label: "ราคาขาย",       icon: <Tag className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: "สัญญา",
    items: [
      { href: "/partner/contracts", label: "สัญญา", icon: <FileText className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: "งานประจำวัน",
    items: [
      { href: "/partner/vehicle-cost",  label: "ค่าใช้จ่ายรถ",     icon: <Wrench className="w-3.5 h-3.5" /> },
      { href: "/partner/insurance-tax", label: "ภาษี & ประกันภัย", icon: <BadgeCheck className="w-3.5 h-3.5" /> },
      { href: "/partner/promotions",    label: "โปรโมชั่น",         icon: <ShieldCheck className="w-3.5 h-3.5" /> },
      { href: "/partner/trips",         label: "เที่ยววิ่ง",         icon: <ClipboardList className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: "เงินเดือน & ปิดเดือน",
    items: [
      { href: "/partner/reports/promotions", label: "รายงานสรุปยอดโปรโมชั่น", icon: <Receipt className="w-3.5 h-3.5" /> },
      { href: "/partner/driver-ledger",      label: "หนี้สิน & เงินสะสม พขร.", icon: <HandCoins className="w-3.5 h-3.5" /> },
      { href: "/partner/payroll",            label: "เงินเดือน",               icon: <Banknote className="w-3.5 h-3.5" /> },
      { href: "/partner/adjustments",        label: "รายการปรับปรุง",          icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
      { href: "/partner/reports",            label: "รายงาน",                  icon: <BarChart3 className="w-3.5 h-3.5" /> },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "/partner/import",      label: "นำเข้า Excel",   icon: <Settings className="w-3.5 h-3.5" /> },
      { href: "/partner/admin/month", label: "จัดการรอบเดือน", icon: <Settings className="w-3.5 h-3.5" /> },
    ],
  },
]

type Progress = { dataComplete: boolean; expectedDate: string | null; updatedBy?: string; updatedAt?: string }
type ProgressMap = Record<string, Progress>

function StatusPill({ status }: { status: ModuleStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${m.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export function ModuleStatusBoard() {
  const [progress, setProgress] = useState<ProgressMap>({})
  const [saving, setSaving]     = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/partner/module-status")
    if (res.ok) setProgress(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  const patch = useCallback(async (href: string, patch: Partial<Progress>) => {
    // optimistic
    setProgress((p) => {
      const prev = p[href] ?? { dataComplete: false, expectedDate: null }
      return { ...p, [href]: { ...prev, ...patch } }
    })
    setSaving(href)
    try {
      await fetch("/api/partner/module-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href, ...patch }),
      })
    } finally { setSaving(null) }
  }, [])

  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
          สถานะการใช้งานแต่ละระบบ
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          {(["ready", "testing", "dev"] as ModuleStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className={`w-2 h-2 rounded-full ${STATUS_META[s].dot}`} />
              {STATUS_META[s].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {STATUS_GROUPS.map((g) => (
          <div key={g.group} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-[0.12em] mb-2.5">{g.group}</p>
            <ul className="space-y-2">
              {g.items.map((it) => {
                const pr = progress[it.href]
                const done = pr?.dataComplete === true
                return (
                  <li key={it.href} className="flex items-center gap-2 flex-wrap">
                    {/* tick box: ข้อมูลครบถ้วน */}
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={(e) => patch(it.href, { dataComplete: e.target.checked })}
                      title="ข้อมูลครบถ้วน"
                      className="w-4 h-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <Link
                      href={it.href}
                      className="inline-flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 min-w-0"
                    >
                      <span className="text-zinc-400 shrink-0">{it.icon}</span>
                      <span className={`truncate ${done ? "line-through text-zinc-400 dark:text-zinc-500" : ""}`}>{it.label}</span>
                    </Link>

                    <span className="flex-1" />

                    <StatusPill status={statusOf(it.href)} />

                    {/* วันที่คาดจะเสร็จ — โชว์เฉพาะที่ยังไม่ติ๊กครบ */}
                    {!done && (
                      <input
                        type="date"
                        value={pr?.expectedDate ?? ""}
                        onChange={(e) => patch(it.href, { expectedDate: e.target.value })}
                        title="วันที่คาดจะเสร็จ"
                        className="h-6 text-[11px] px-1.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 w-[120px] shrink-0"
                      />
                    )}
                    {saving === it.href && <span className="text-[9px] text-zinc-400 shrink-0">บันทึก…</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
