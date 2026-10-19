"use client"

/**
 * ปุ่ม 🕐 ประวัติ + drawer แสดง audit log ของ record หนึ่ง (ใช้ร่วมทุกหน้า)
 * อ่านจาก /api/activity-log?entity=&entityId=  (เขียนโดย logActivity ฝั่ง API)
 *
 * <ActivityHistory entity="contract" entityId={contractCode} fieldLabels={{...}} actionLabels={{...}} />
 */

import { useState } from "react"
import { Clock, X } from "lucide-react"

type Change = { from: unknown; to: unknown }
type Entry = {
  action: string
  changes: Record<string, Change>
  editedBy: { email: string; name?: string }
  editedAt: string
}

function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
    }).format(new Date(iso))
  } catch { return iso }
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "number") return v.toLocaleString("th-TH")
  return String(v)
}

export function ActivityHistory({
  entity, entityId, label = "ประวัติการแก้ไข",
  fieldLabels = {}, actionLabels = {},
}: {
  entity: string
  entityId?: string
  label?: string
  fieldLabels?: Record<string, string>
  actionLabels?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [logs, setLogs] = useState<Entry[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!entityId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/partner/activity-log?entity=${encodeURIComponent(entity)}&entityId=${encodeURIComponent(entityId)}`)
      const d = r.ok ? await r.json() : { history: [] }
      setLogs(d.history ?? [])
    } catch { setLogs([]) }
    finally { setLoading(false) }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && logs === null) load()
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={!entityId}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 disabled:opacity-40"
        title="ดูประวัติการแก้ไข (ใคร/เมื่อไหร่)"
      >
        <Clock className="w-3.5 h-3.5" /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full max-w-lg h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
                <Clock className="w-4 h-4 text-emerald-500" /> {label}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {loading ? (
                <p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด…</p>
              ) : !logs || logs.length === 0 ? (
                <p className="text-xs text-zinc-400">ยังไม่มีประวัติการแก้ไข</p>
              ) : (
                logs.map((e, i) => (
                  <div key={i} className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        {actionLabels[e.action] ?? e.action}
                      </span>
                      <span className="text-[11px] text-zinc-400">{fmtTime(e.editedAt)}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mb-1.5">โดย {e.editedBy?.name || e.editedBy?.email || "unknown"}</p>
                    <div className="space-y-1">
                      {Object.entries(e.changes ?? {}).map(([k, c]) => (
                        <div key={k} className="text-[11px] flex flex-wrap items-baseline gap-1.5">
                          <span className="text-zinc-500 shrink-0">{fieldLabels[k] ?? k}:</span>
                          <span className="text-red-500 line-through">{fmtVal(c.from)}</span>
                          <span className="text-zinc-400">→</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{fmtVal(c.to)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
