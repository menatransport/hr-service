/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

/**
 * หนี้สิน & เงินสะสม พขร. — ติดตามหนี้ผ่อนรายเดือน (debt) และเงินสะสม (deposit) ต่อ พขร./สัญญา
 * ข้อมูลจาก GET /api/ledger — จัดการรายรายการผ่าน slide-over (พัก/เดินต่อ/ยกเลิก/แก้ยอดหัก/ข้ามงวด/ถอนเงินสะสม)
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import {
  HandCoins, Search, Download, Settings2, PlusCircle, X,
  PauseCircle, PlayCircle, Ban, Trash2, SkipForward, Pencil,
} from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { ActivityHistory } from "@/components/partner/activity-history"
import { formatMoney, formatMonth } from "@/lib/partner/utils"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"
import type { Contract } from "@/lib/partner/types"
import { PARTNER } from "@/lib/db/registry.mjs"

/* ────────────────────────────── types ────────────────────────────── */

type LedgerKind   = "debt" | "deposit"
type LedgerStatus = "active" | "paid" | "paused" | "cancelled"

interface SkipRec {
  month: string
  reason?: string
  overrideAmount?: number
}

interface Withdrawal {
  amount: number
  note?: string
  refMR?: string
  by?: string
  at?: string
}

interface LedgerEntry {
  _id: string
  debtCode: string
  kind: LedgerKind
  contractCode?: string
  licensePlate?: string
  driverName?: string
  source: { type: string; refId?: string; refLabel?: string }
  principal?: number        // debt: ยอดตั้งต้น
  targetAmount?: number     // deposit: เป้าสะสม
  monthlyAmount: number
  startMonth: string        // "YYYY-MM"
  paidAmount: number
  withdrawnAmount?: number
  remaining?: number        // debt
  balance?: number          // deposit = paid − withdrawn
  monthsPaid: number
  lastPayment?: string
  status: LedgerStatus
  notes?: string
  skips?: SkipRec[]         // อาจไม่มาจาก API — จัดการแบบ defensive
  createdAt?: string
}

/* ────────────────────────────── labels ────────────────────────────── */

const SOURCE_LABEL: Record<string, string> = {
  insurance:       "ประกันภัย",
  prb:             "พรบ.",
  tax:             "ภาษีทะเบียน",
  inspection:      "ตรวจสภาพ",
  personal:        "ประกันภาคสมัครใจ (บุคคล)",
  debt_acceptance: "ใบรับสภาพหนี้",
  down_payment:    "เงินดาวน์",
  vehicle_installment: "ค่างวดรถ",
  tire_deposit:    "เงินสะสมค่ายาง",
  security_deposit: "เงินประกัน",
  manual:          "อื่นๆ",
}

const STATUS_LABEL: Record<LedgerStatus, string> = {
  active: "ใช้งาน", paused: "พัก", paid: "ปิดแล้ว", cancelled: "ยกเลิก",
}
const STATUS_COLOR: Record<LedgerStatus, string> = {
  active:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  paused:    "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  paid:      "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  cancelled: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}

const TABS = [
  { key: "",        label: "ทั้งหมด" },
  { key: "debt",    label: "หนี้" },
  { key: "deposit", label: "เงินสะสม" },
  { key: "paused",  label: "พัก" },
  { key: "closed",  label: "ปิดแล้ว" },
]

const DEBT_SOURCES: string[]    = ["manual", "debt_acceptance", "down_payment", "insurance", "prb", "tax", "inspection", "personal"]
const DEPOSIT_SOURCES: string[] = ["tire_deposit", "security_deposit", "manual"]

/* ────────────────────────────── helpers ────────────────────────────── */

const currentMonth = () => new Date().toISOString().slice(0, 7)

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US")
}

/** debt: ยอดคงเหลือ (defensive ถ้า API ไม่ส่ง remaining) */
function debtRemaining(e: LedgerEntry) {
  return e.remaining ?? Math.max(0, (e.principal ?? 0) - (e.paidAmount ?? 0))
}
/** deposit: ยอดสะสมคงเหลือ (paid − withdrawn) */
function depositBalance(e: LedgerEntry) {
  return e.balance ?? Math.max(0, (e.paidAmount ?? 0) - (e.withdrawnAmount ?? 0))
}
/** จำนวนงวดทั้งหมดของหนี้ (ประมาณจาก principal ÷ monthlyAmount ถ้าคำนวณได้) */
function debtTotalMonths(e: LedgerEntry): number | null {
  if (!e.principal || !e.monthlyAmount) return null
  return Math.ceil(e.principal / e.monthlyAmount)
}
function progressPct(e: LedgerEntry) {
  if (e.kind === "debt") {
    if (!e.principal) return 0
    return Math.min(100, ((e.paidAmount ?? 0) / e.principal) * 100)
  }
  if (!e.targetAmount) return 0
  return Math.min(100, (depositBalance(e) / e.targetAmount) * 100)
}

function safeMonth(m?: string) {
  return m && /^\d{4}-\d{2}$/.test(m) ? formatMonth(m) : (m || "—")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeEntry(r: any): LedgerEntry {
  return {
    ...r,
    _id: String(r._id ?? ""),
    debtCode: r.debtCode ?? "",
    kind: r.kind === "deposit" ? "deposit" : "debt",
    source: r.source && typeof r.source === "object" ? r.source : { type: "manual" },
    monthlyAmount: Number(r.monthlyAmount ?? 0),
    paidAmount: Number(r.paidAmount ?? 0),
    monthsPaid: Number(r.monthsPaid ?? 0),
    startMonth: r.startMonth ?? "",
    status: (["active", "paid", "paused", "cancelled"].includes(r.status) ? r.status : "active") as LedgerStatus,
  }
}

async function api(path: string, init?: RequestInit): Promise<{ ok: boolean; msg?: string }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    })
    if (res.ok) return { ok: true }
    let msg = `เกิดข้อผิดพลาด (${res.status})`
    try {
      const d = await res.json()
      if (d?.error || d?.message) msg = d.error ?? d.message
    } catch { /* ไม่มี body */ }
    return { ok: false, msg }
  } catch {
    return { ok: false, msg: "เชื่อมต่อ API ไม่ได้" }
  }
}

/* ────────────────────────────── page ────────────────────────────── */

export default function DriverLedgerPage() {
  const [items, setItems]     = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ]             = useState(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("q") ?? "" : "")
  const [tab, setTab]         = useState("")
  const [manageId, setManageId] = useState<string | null>(null)
  const [showAdd, setShowAdd]   = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/partner/ledger")
      if (!res.ok) throw new Error()
      const data = await res.json()
      const list = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : []
      setItems(list.map(normalizeEntry))
    } catch {
      // backend ยังไม่พร้อม → empty state
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((e) => {
      if (tab === "debt"    && e.kind !== "debt") return false
      if (tab === "deposit" && e.kind !== "deposit") return false
      if (tab === "paused"  && e.status !== "paused") return false
      if (tab === "closed"  && e.status !== "paid" && e.status !== "cancelled") return false
      if (!kw) return true
      return [
        e.driverName, e.licensePlate, e.contractCode, e.debtCode,
        SOURCE_LABEL[e.source?.type] ?? e.source?.type, e.source?.refLabel, e.notes,
      ].some((v) => v?.toLowerCase().includes(kw))
    })
  }, [items, q, tab])

  const pg = usePagination(visible, 50, [q, tab])

  // KPI รวม (ไม่ขึ้นกับ filter) — หนี้/เงินสะสมนับเฉพาะที่ยังไม่ปิด
  const kpi = useMemo(() => {
    let debtSum = 0, depositSum = 0, debtActive = 0, depositActive = 0, paused = 0
    for (const e of items) {
      if (e.status === "paused") paused++
      if (e.kind === "debt") {
        if (e.status === "active" || e.status === "paused") debtSum += debtRemaining(e)
        if (e.status === "active") debtActive++
      } else {
        if (e.status !== "cancelled") depositSum += depositBalance(e)
        if (e.status === "active") depositActive++
      }
    }
    return { debtSum, depositSum, debtActive, depositActive, paused }
  }, [items])

  const manageEntry = manageId ? items.find((e) => e._id === manageId) ?? null : null

  async function handleExportExcel() {
    if (!visible.length) return
    const rows = visible.map((e) => ({
      "รหัส": e.debtCode,
      "ชนิด": e.kind === "debt" ? "หนี้" : "เงินสะสม",
      "ประเภท": SOURCE_LABEL[e.source?.type] ?? e.source?.type ?? "",
      "ชื่อ พขร.": e.driverName ?? "",
      "ทะเบียน": e.licensePlate ?? "",
      "สัญญา": e.contractCode ?? "",
      "ยอดตั้งต้น/เป้า": e.kind === "debt" ? (e.principal ?? "") : (e.targetAmount ?? ""),
      "หัก/เดือน": e.monthlyAmount,
      "งวดที่ชำระแล้ว": e.monthsPaid,
      "ชำระ/สะสมแล้ว": e.paidAmount,
      "ถอนแล้ว": e.kind === "deposit" ? (e.withdrawnAmount ?? 0) : "",
      "คงเหลือ": e.kind === "debt" ? debtRemaining(e) : depositBalance(e),
      "เดือนเริ่ม": e.startMonth,
      "สถานะ": STATUS_LABEL[e.status],
      "หมายเหตุ": e.notes ?? "",
    }))
    await exportToExcel([{ name: "หนี้สิน & เงินสะสม", rows }], `driver-ledger-${todayStamp()}`)
  }

  const KPI = [
    { label: "หนี้คงเหลือรวม (บาท)",    value: formatMoney(kpi.debtSum),    dot: "bg-red-500",     accent: "text-red-700 dark:text-red-400" },
    { label: "เงินสะสมคงเหลือรวม (บาท)", value: formatMoney(kpi.depositSum), dot: "bg-sky-500",     accent: "text-sky-700 dark:text-sky-400" },
    { label: "หนี้ Active",             value: String(kpi.debtActive),      dot: "bg-emerald-500", accent: "text-emerald-700 dark:text-emerald-400" },
    { label: "เงินสะสม Active",         value: String(kpi.depositActive),   dot: "bg-emerald-500", accent: "text-emerald-700 dark:text-emerald-400" },
    { label: "พัก/ข้ามเดือนนี้",         value: String(kpi.paused),          dot: "bg-amber-500",   accent: "text-amber-700 dark:text-amber-400" },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <HandCoins className="w-5 h-5 text-emerald-500" />
            หนี้สิน &amp; เงินสะสม พขร.
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {visible.length} รายการ
            {tab === "" && items.length > 0 && (
              <> · หนี้ <span className="text-zinc-600 dark:text-zinc-300 font-medium">{items.filter((e) => e.kind === "debt").length}</span> / เงินสะสม <span className="text-sky-600 font-medium">{items.filter((e) => e.kind === "deposit").length}</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          )}
          <Button onClick={() => setShowAdd(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <PlusCircle className="w-4 h-4 mr-1.5" /> เพิ่มรายการ
          </Button>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {KPI.map((k) => (
          <div key={k.label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${k.dot}`} />
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{k.label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums leading-none ${k.accent}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <Input
            placeholder="ค้นหา ชื่อ / ทะเบียน / สัญญา / รหัส / ประเภท"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          {/* คอลัมน์แบบกระชับ — รวมฟิลด์ที่เกี่ยวข้องเป็นเซลล์ 2 บรรทัด ให้พอดีจอโน้ตบุ๊ก (ไม่ตัดข้อมูลทิ้ง) */}
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[11px] text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">รหัส / ประเภท</th>
                <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">พขร. / ทะเบียน · สัญญา</th>
                <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">ยอดตั้งต้น/เป้า · หัก/เดือน</th>
                <th className="px-2.5 py-2 text-left font-semibold min-w-[150px]">ความคืบหน้า</th>
                <th className="px-2.5 py-2 text-center font-semibold whitespace-nowrap">เริ่ม / ล่าสุด</th>
                <th className="px-2.5 py-2 text-center font-semibold">สถานะ</th>
                <th className="px-2.5 py-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">กำลังโหลด...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">ไม่พบข้อมูล</td></tr>
              ) : pg.paged.map((e) => {
                const isDebt = e.kind === "debt"
                const pct = progressPct(e)
                const totalMonths = debtTotalMonths(e)
                const sourceLabel = SOURCE_LABEL[e.source?.type] ?? e.source?.type ?? "—"
                const idLine = [e.licensePlate, e.contractCode].filter(Boolean).join(" · ")
                return (
                  <tr key={e._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors align-top">
                    {/* รหัส / ประเภท (+ refLabel) */}
                    <td className="px-2.5 py-2">
                      <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                        {e.debtCode || "—"}
                      </span>
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                          isDebt
                            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
                        }`}>
                          {sourceLabel}
                        </span>
                      </div>
                      {e.source?.refLabel && (
                        <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[140px]" title={e.source.refLabel}>{e.source.refLabel}</div>
                      )}
                    </td>

                    {/* ชื่อ พขร. / ทะเบียน · สัญญา */}
                    <td className="px-2.5 py-2">
                      <div className="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[160px]" title={e.driverName || ""}>
                        {e.driverName || <span className="text-zinc-300 dark:text-zinc-600 font-normal">—</span>}
                      </div>
                      {idLine
                        ? <div className="text-[10px] text-zinc-400 mt-0.5 font-mono truncate max-w-[160px]" title={idLine}>{idLine}</div>
                        : null}
                    </td>

                    {/* ยอดตั้งต้น/เป้า · หัก/เดือน */}
                    <td className="px-2.5 py-2 text-right tabular-nums whitespace-nowrap">
                      {(isDebt ? e.principal : e.targetAmount) != null
                        ? <div className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(isDebt ? e.principal! : e.targetAmount!)}</div>
                        : <div className="text-zinc-300 dark:text-zinc-600">—</div>}
                      <div className="text-[10px] text-zinc-400 mt-0.5">
                        {e.monthlyAmount ? <>หัก {formatMoney(e.monthlyAmount)}/ด</> : "—"}
                      </div>
                    </td>

                    {/* ความคืบหน้า */}
                    <td className="px-2.5 py-2">
                      <div className="w-full h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden mb-1">
                        <div
                          className={`h-full rounded-full transition-all ${
                            e.status === "paused" ? "bg-amber-400" : isDebt ? "bg-emerald-500" : "bg-sky-500"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {isDebt ? (
                          <>ผ่อนแล้ว {e.monthsPaid}{totalMonths ? `/${totalMonths}` : ""} · คงเหลือ {fmtInt(debtRemaining(e))}</>
                        ) : (
                          <>สะสม {fmtInt(depositBalance(e))}{e.targetAmount ? `/${fmtInt(e.targetAmount)}` : ""}</>
                        )}
                      </p>
                    </td>

                    {/* เริ่ม / ล่าสุด */}
                    <td className="px-2.5 py-2 text-center text-zinc-500 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                      <div>{safeMonth(e.startMonth)}</div>
                      {e.lastPayment && (
                        <div className="text-[10px] text-zinc-400 mt-0.5">ล่าสุด {safeMonth(e.lastPayment.slice(0, 7))}</div>
                      )}
                    </td>

                    {/* สถานะ */}
                    <td className="px-2.5 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[e.status]}`}>
                        {STATUS_LABEL[e.status]}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-2.5 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setManageId(e._id)}
                        title="จัดการรายการนี้"
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                      >
                        <Settings2 className="w-3 h-3" /> จัดการ
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pg} unit="รายการ" />
      </div>

      {/* Slide-over: จัดการรายการ */}
      {manageEntry && (
        <ManageDrawer
          entry={manageEntry}
          onClose={() => setManageId(null)}
          onChanged={load}
        />
      )}

      {/* Slide-over: เพิ่มรายการ */}
      {showAdd && (
        <AddDrawer
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

/* ────────────────────────────── drawer: จัดการ ────────────────────────────── */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[11px] text-zinc-400 shrink-0">{label}</span>
      <span className="text-xs text-zinc-700 dark:text-zinc-300 text-right font-medium">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">{children}</p>
}

function ManageDrawer({ entry, onClose, onChanged }: {
  entry: LedgerEntry
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const isDebt = entry.kind === "debt"
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState("")

  // แก้ยอดหัก/เดือน
  const [editMonthly, setEditMonthly] = useState(false)
  const [monthlyVal, setMonthlyVal]   = useState(String(entry.monthlyAmount || ""))

  // ข้ามงวด
  const [skipMonth, setSkipMonth]     = useState(currentMonth())
  const [skipReason, setSkipReason]   = useState("")
  const [skipOverride, setSkipOverride] = useState("")
  const [skips, setSkips]             = useState<SkipRec[] | null>(null)   // null = ไม่มี endpoint ให้ดึง
  const [skipsLocalOnly, setSkipsLocalOnly] = useState(false)

  // ถอนเงินสะสม (deposit)
  const [wdAmount, setWdAmount] = useState("")
  const [wdNote, setWdNote]     = useState("")
  const [wdRefMR, setWdRefMR]   = useState("")
  const [withdrawals, setWithdrawals] = useState<Withdrawal[] | null>(null)

  // บันทึกจ่ายรายงวด (manual) + หลักฐาน — debt เท่านั้น
  const [payMonth, setPayMonth]   = useState(currentMonth())
  const [payAmount, setPayAmount] = useState(String(entry.monthlyAmount || ""))
  const [payNote, setPayNote]     = useState("")
  const [payEvidence, setPayEvidence] = useState("")   // url สลิป
  const [payUploading, setPayUploading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payments, setPayments] = useState<any[] | null>(null)

  const loadPayments = useCallback(async () => {
    if (!isDebt) return
    try {
      const res = await fetch(`/api/partner/ledger/${entry._id}/pay`)
      setPayments(res.ok ? await res.json() : [])
    } catch { setPayments([]) }
  }, [entry._id, isDebt])

  async function uploadEvidence(file: File) {
    setPayUploading(true); setError("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "ledger-payments")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error()
      const { url } = await res.json()
      setPayEvidence(url)
    } catch { setError("อัปโหลดหลักฐานไม่สำเร็จ") }
    finally { setPayUploading(false) }
  }

  async function recordPayment() {
    if (!/^\d{4}-\d{2}$/.test(payMonth)) { setError("ระบุเดือนให้ถูกต้อง"); return }
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { setError("ยอดจ่ายต้องมากกว่า 0"); return }
    const ok = await run(
      () => api(`/api/partner/ledger/${entry._id}/pay`, {
        method: "POST",
        body: JSON.stringify({ month: payMonth, amount: amt, evidenceUrl: payEvidence || undefined, note: payNote.trim() || undefined }),
      }),
      () => { setPayNote(""); setPayEvidence("") },
    )
    if (ok) await loadPayments()
  }

  async function removePayment(month: string) {
    if (!await confirm(`ยกเลิกการจ่ายเดือน ${month}? (คืนยอด)`)) return
    const ok = await run(() => api(`/api/partner/ledger/${entry._id}/pay`, { method: "DELETE", body: JSON.stringify({ month }) }))
    if (ok) await loadPayments()
  }

  const loadSkips = useCallback(async () => {
    try {
      const res = await fetch(`/api/partner/ledger/${entry._id}/skip`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      const list = Array.isArray(d) ? d : Array.isArray(d?.skips) ? d.skips : null
      if (list) { setSkips(list); setSkipsLocalOnly(false); return }
      throw new Error()
    } catch {
      // ไม่มี GET endpoint → ใช้ skips จาก entry (ถ้ามี) หรือ track เฉพาะที่ทำในหน้านี้
      setSkips((prev) => prev ?? entry.skips ?? [])
      setSkipsLocalOnly(!Array.isArray(entry.skips))
    }
  }, [entry._id, entry.skips])

  const loadWithdrawals = useCallback(async () => {
    if (isDebt) return
    try {
      const res = await fetch(`/api/partner/ledger/${entry._id}/withdraw`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setWithdrawals(Array.isArray(d) ? d : Array.isArray(d?.withdrawals) ? d.withdrawals : [])
    } catch {
      setWithdrawals([])
    }
  }, [entry._id, isDebt])

  useEffect(() => { loadSkips(); loadWithdrawals(); loadPayments() }, [loadSkips, loadWithdrawals, loadPayments])

  async function run(fn: () => Promise<{ ok: boolean; msg?: string }>, after?: () => void) {
    setBusy(true); setError("")
    const r = await fn()
    if (!r.ok) setError(r.msg ?? "เกิดข้อผิดพลาด")
    else { after?.(); await onChanged() }
    setBusy(false)
    return r.ok
  }

  const setStatus = (status: "active" | "paused" | "cancelled") =>
    run(() => api(`/api/partner/ledger/${entry._id}`, { method: "PUT", body: JSON.stringify({ status }) }))

  async function saveMonthly() {
    const v = Number(monthlyVal)
    if (!v || v <= 0) { setError("ยอดหัก/เดือนต้องมากกว่า 0"); return }
    const ok = await run(() => api(`/api/partner/ledger/${entry._id}`, { method: "PUT", body: JSON.stringify({ monthlyAmount: v }) }))
    if (ok) setEditMonthly(false)
  }

  async function addSkip() {
    if (!/^\d{4}-\d{2}$/.test(skipMonth)) { setError("ระบุเดือนที่ข้ามให้ถูกต้อง"); return }
    const body: Record<string, unknown> = { month: skipMonth }
    if (skipReason.trim()) body.reason = skipReason.trim()
    if (skipOverride && Number(skipOverride) > 0) body.overrideAmount = Number(skipOverride)
    const ok = await run(
      () => api(`/api/partner/ledger/${entry._id}/skip`, { method: "POST", body: JSON.stringify(body) }),
      () => {
        setSkips((prev) => [...(prev ?? []), { month: skipMonth, reason: skipReason.trim() || undefined, overrideAmount: body.overrideAmount as number | undefined }])
        setSkipReason(""); setSkipOverride("")
      },
    )
    if (ok) await loadSkips()
  }

  async function removeSkip(month: string) {
    const ok = await run(
      () => api(`/api/partner/ledger/${entry._id}/skip`, { method: "DELETE", body: JSON.stringify({ month }) }),
      () => setSkips((prev) => (prev ?? []).filter((s) => s.month !== month)),
    )
    if (ok) await loadSkips()
  }

  async function withdraw() {
    const amt = Number(wdAmount)
    if (!amt || amt <= 0) { setError("ระบุจำนวนเงินถอนให้ถูกต้อง"); return }
    const body: Record<string, unknown> = { amount: amt, note: wdNote.trim() }
    if (wdRefMR.trim()) body.refMR = wdRefMR.trim()
    const ok = await run(
      () => api(`/api/partner/ledger/${entry._id}/withdraw`, { method: "POST", body: JSON.stringify(body) }),
      () => { setWdAmount(""); setWdNote(""); setWdRefMR("") },
    )
    if (ok) await loadWithdrawals()
  }

  async function removeEntry() {
    if (!await confirm(`ลบรายการ ${entry.debtCode}? (ลบไม่ได้ถ้ามีการชำระแล้ว)`)) return
    const ok = await run(() => api(`/api/partner/ledger/${entry._id}`, { method: "DELETE" }))
    if (ok) onClose()
  }

  const totalMonths = debtTotalMonths(entry)

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <span className="font-mono">{entry.debtCode}</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[entry.status]}`}>
                {STATUS_LABEL[entry.status]}
              </span>
            </div>
            <div className="text-xs text-zinc-400 truncate">
              {[entry.driverName, entry.licensePlate, entry.contractCode].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ActivityHistory
              entity={PARTNER.driverLedger}
              entityId={entry.debtCode}
              label="ประวัติ"
              fieldLabels={{ monthlyAmount: "หัก/เดือน", targetAmount: "เป้าสะสม", notes: "หมายเหตุ", status: "สถานะ" }}
              actionLabels={{ edit: "แก้ไข", skip: "ข้ามงวด", override: "หักบางส่วน", withdraw: "ถอนเงินสะสม", create: "สร้างรายการ" }}
            />
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* รายละเอียด */}
          <div>
            <SectionTitle>รายละเอียด</SectionTitle>
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-3 py-1.5 divide-y divide-zinc-100 dark:divide-zinc-800">
              <DetailRow label="ชนิด" value={isDebt ? "หนี้" : "เงินสะสม"} />
              <DetailRow label="ประเภท" value={`${SOURCE_LABEL[entry.source?.type] ?? entry.source?.type ?? "—"}${entry.source?.refLabel ? ` · ${entry.source.refLabel}` : ""}`} />
              <DetailRow label={isDebt ? "ยอดตั้งต้น" : "เป้าสะสม"} value={(isDebt ? entry.principal : entry.targetAmount) != null ? formatMoney(isDebt ? entry.principal! : entry.targetAmount!) : "—"} />
              <DetailRow
                label="หัก/เดือน"
                value={
                  editMonthly ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Input
                        type="number"
                        value={monthlyVal}
                        onChange={(e) => setMonthlyVal(e.target.value)}
                        className="h-7 w-24 text-right text-xs"
                      />
                      <button type="button" onClick={saveMonthly} disabled={busy} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">บันทึก</button>
                      <button type="button" onClick={() => { setEditMonthly(false); setMonthlyVal(String(entry.monthlyAmount || "")) }} className="text-[10px] text-zinc-400 hover:text-zinc-600">ยกเลิก</button>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      {entry.monthlyAmount ? formatMoney(entry.monthlyAmount) : "—"}
                      {(entry.status === "active" || entry.status === "paused") && (
                        <button type="button" onClick={() => setEditMonthly(true)} title="แก้ยอดหัก/เดือน" className="text-zinc-400 hover:text-emerald-600">
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  )
                }
              />
              <DetailRow label="เดือนเริ่ม" value={safeMonth(entry.startMonth)} />
              <DetailRow label="งวดที่ชำระแล้ว" value={`${entry.monthsPaid}${totalMonths ? ` / ${totalMonths}` : ""} งวด`} />
              <DetailRow label={isDebt ? "ชำระแล้ว" : "สะสมแล้ว"} value={formatMoney(entry.paidAmount ?? 0)} />
              {!isDebt && <DetailRow label="ถอนแล้ว" value={formatMoney(entry.withdrawnAmount ?? 0)} />}
              <DetailRow
                label={isDebt ? "คงเหลือ" : "ยอดสะสมคงเหลือ"}
                value={<span className={isDebt ? "text-red-600 dark:text-red-400" : "text-sky-600 dark:text-sky-400"}>{formatMoney(isDebt ? debtRemaining(entry) : depositBalance(entry))}</span>}
              />
              {entry.lastPayment && <DetailRow label="ชำระล่าสุด" value={safeMonth(entry.lastPayment.slice(0, 7))} />}
              {entry.notes && <DetailRow label="หมายเหตุ" value={entry.notes} />}
            </div>
          </div>

          {/* การจัดการสถานะ */}
          {entry.status !== "paid" && entry.status !== "cancelled" && (
            <div>
              <SectionTitle>จัดการสถานะ</SectionTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {entry.status === "active" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus("paused")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/60 disabled:opacity-50"
                  >
                    <PauseCircle className="w-3.5 h-3.5" /> พักการหัก
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStatus("active")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/60 disabled:opacity-50"
                  >
                    <PlayCircle className="w-3.5 h-3.5" /> เดินต่อ
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => { if (await confirm(`ยกเลิกรายการ ${entry.debtCode}?`)) setStatus("cancelled") }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  <Ban className="w-3.5 h-3.5" /> ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeEntry}
                  title="ลบได้เฉพาะรายการที่ยังไม่มีการชำระ"
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-red-500 px-2 py-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบ
                </button>
              </div>
            </div>
          )}

          {/* บันทึกจ่ายรายงวด + หลักฐาน (debt เท่านั้น) */}
          {isDebt && (
            <div>
              <SectionTitle>บันทึกจ่าย + หลักฐาน</SectionTitle>

              {entry.status !== "paid" && entry.status !== "cancelled" && (
                <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">เดือนที่จ่าย</label>
                      <Input type="month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">ยอดจ่าย (บาท)</label>
                      <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-8 text-xs text-right" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">หมายเหตุ (ถ้ามี)</label>
                    <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} className="h-8 text-xs" placeholder="เช่น เลขอ้างอิงโอน" />
                  </div>
                  {/* แนบหลักฐาน */}
                  {payEvidence ? (
                    <div className="flex items-center gap-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5">
                      <a href={payEvidence} target="_blank" rel="noreferrer" className="flex-1 text-emerald-600 hover:underline truncate">✓ แนบหลักฐานแล้ว — ดู</a>
                      <button type="button" onClick={() => setPayEvidence("")} className="text-zinc-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <label className={`flex items-center justify-center gap-2 text-xs rounded-lg border-2 border-dashed px-2.5 py-2 cursor-pointer ${payUploading ? "border-blue-300 text-blue-600" : "border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-emerald-400"}`}>
                      {payUploading ? "กำลังอัปโหลด..." : "📎 แนบสลิป / หลักฐานการจ่าย"}
                      <input type="file" accept="image/*,.pdf" className="hidden" disabled={payUploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(f); e.target.value = "" }} />
                    </label>
                  )}
                  <button
                    type="button" disabled={busy || payUploading} onClick={recordPayment}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-lg disabled:opacity-50"
                  >
                    บันทึกการจ่าย
                  </button>
                </div>
              )}

              {/* ประวัติการจ่าย */}
              {payments && payments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {payments.map((p) => (
                    <div key={p._id} className="flex items-center gap-2 text-xs bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-2.5 py-1.5">
                      <span className="font-mono text-zinc-600 dark:text-zinc-300 w-16 shrink-0">{safeMonth(p.month)}</span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200 tabular-nums">{formatMoney(p.amount)}</span>
                      {p.payrollRef && <span className="text-[9px] text-zinc-400">(เงินเดือน)</span>}
                      {p.note && <span className="text-[10px] text-zinc-400 truncate">· {p.note}</span>}
                      <span className="flex-1" />
                      {p.evidenceUrl
                        ? <a href={p.evidenceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-emerald-600 hover:underline shrink-0">ดูหลักฐาน</a>
                        : <span className="text-[10px] text-zinc-300 shrink-0">ไม่มีหลักฐาน</span>}
                      {!p.payrollRef && entry.status !== "cancelled" && (
                        <button type="button" onClick={() => removePayment(p.month)} className="text-zinc-300 hover:text-red-500 shrink-0" title="ยกเลิกการจ่ายเดือนนี้">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {payments && payments.length === 0 && entry.status !== "paid" && (
                <p className="text-[11px] text-zinc-400 mt-1.5">ยังไม่มีการบันทึกจ่าย</p>
              )}
            </div>
          )}

          {/* ข้ามงวด */}
          {entry.status !== "paid" && entry.status !== "cancelled" && (
            <div>
              <SectionTitle>ข้ามงวด / หักไม่เต็มงวด</SectionTitle>
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">เดือนที่ข้าม</label>
                    <Input type="month" value={skipMonth} onChange={(e) => setSkipMonth(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">หักแทนเป็นยอด (ไม่บังคับ)</label>
                    <Input type="number" placeholder="เว้นว่าง = ข้ามทั้งงวด" value={skipOverride} onChange={(e) => setSkipOverride(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">เหตุผล</label>
                  <Input placeholder="เช่น รถจอดซ่อม ไม่มีรายได้เดือนนี้" value={skipReason} onChange={(e) => setSkipReason(e.target.value)} className="h-8 text-xs" />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={addSkip}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-700 hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 px-3 py-1.5 rounded-lg disabled:opacity-50"
                >
                  <SkipForward className="w-3.5 h-3.5" /> บันทึกข้ามงวด
                </button>
              </div>

              {/* รายการข้ามงวด */}
              {(skips?.length ?? 0) > 0 && (
                <div className="mt-2 space-y-1.5">
                  {skips!.map((s) => (
                    <div key={s.month} className="flex items-center justify-between gap-2 text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-1.5">
                      <div className="min-w-0">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{safeMonth(s.month)}</span>
                        {s.overrideAmount != null && <span className="text-zinc-500 ml-1.5">หัก {formatMoney(s.overrideAmount)}</span>}
                        {s.reason && <span className="text-zinc-400 ml-1.5 truncate">· {s.reason}</span>}
                      </div>
                      <button type="button" disabled={busy} onClick={() => removeSkip(s.month)} title="ลบการข้ามงวดนี้" className="text-zinc-400 hover:text-red-500 shrink-0 disabled:opacity-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {skipsLocalOnly && (
                    <p className="text-[10px] text-zinc-400">* แสดงเฉพาะที่บันทึกในหน้านี้ — รีเฟรชเพื่อดูผลทั้งหมด</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ถอนเงินสะสม (deposit เท่านั้น) */}
          {!isDebt && (
            <div>
              <SectionTitle>ถอนเงินสะสม</SectionTitle>
              {entry.status !== "cancelled" && (
                <div className="bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/40 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">จำนวนเงิน (บาท)</label>
                      <Input type="number" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block mb-1">เลขที่ MR (ไม่บังคับ)</label>
                      <Input placeholder="อ้างอิงใบเบิก" value={wdRefMR} onChange={(e) => setWdRefMR(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">หมายเหตุ</label>
                    <Input placeholder="เช่น เบิกค่ายาง 2 เส้น" value={wdNote} onChange={(e) => setWdNote(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={withdraw}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    <HandCoins className="w-3.5 h-3.5" /> บันทึกการถอน
                  </button>
                </div>
              )}

              {/* ประวัติการถอน */}
              <div className="mt-2 space-y-1.5">
                {withdrawals === null ? (
                  <p className="text-[11px] text-zinc-400">กำลังโหลดประวัติการถอน...</p>
                ) : withdrawals.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">ยังไม่มีประวัติการถอน</p>
                ) : withdrawals.map((w, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">{formatMoney(w.amount ?? 0)}</span>
                      {w.refMR && <span className="text-zinc-500 ml-1.5 font-mono">MR {w.refMR}</span>}
                      {w.note && <span className="text-zinc-400 ml-1.5 truncate">· {w.note}</span>}
                    </div>
                    <span className="text-[10px] text-zinc-400 shrink-0">
                      {w.at ? `${new Date(w.at).getDate()}/${new Date(w.at).getMonth() + 1}/${String(new Date(w.at).getFullYear()).slice(-2)}/${String(new Date(w.at).getFullYear() + 543).slice(-2)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────── drawer: เพิ่มรายการ ────────────────────────────── */

function AddDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind]         = useState<LedgerKind>("debt")
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractCode, setContractCode] = useState("")
  const [sourceType, setSourceType]     = useState("manual")
  const [amount, setAmount]     = useState("")     // principal (debt) / targetAmount (deposit)
  const [count, setCount]       = useState("")     // จำนวนงวด
  const [monthly, setMonthly]   = useState("")
  const [monthlyTouched, setMonthlyTouched] = useState(false)
  const [startMonth, setStartMonth] = useState(currentMonth())
  const [alreadyPaid, setAlreadyPaid] = useState("")   // migrate: ผ่อนมาแล้ว (debt เท่านั้น)
  const [notes, setNotes]       = useState("")
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState("")

  useEffect(() => {
    fetch("/api/partner/contracts?status=active")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setContracts(Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []))
      .catch(() => setContracts([]))
  }, [])

  // เปลี่ยนชนิด → รีเซ็ต source type เป็นค่าเริ่มต้นของชนิดนั้น
  useEffect(() => {
    setSourceType(kind === "deposit" ? "tire_deposit" : "manual")
  }, [kind])

  // auto-suggest หัก/เดือน = ยอดตั้งต้น ÷ จำนวนงวด (เมื่อผู้ใช้ยังไม่แก้เอง)
  useEffect(() => {
    if (monthlyTouched) return
    const a = Number(amount), c = Number(count)
    if (a > 0 && c > 0) setMonthly(String(Math.ceil((a / c) * 100) / 100))
  }, [amount, count, monthlyTouched])

  const selected = contracts.find((c) => c.contractCode === contractCode)
  const sources = kind === "debt" ? DEBT_SOURCES : DEPOSIT_SOURCES

  async function submit() {
    setError("")
    const m = Number(monthly)
    if (!m || m <= 0) { setError("ระบุยอดหัก/เดือนให้ถูกต้อง"); return }
    if (!/^\d{4}-\d{2}$/.test(startMonth)) { setError("ระบุเดือนเริ่มให้ถูกต้อง"); return }
    const a = Number(amount)
    const body: Record<string, unknown> = {
      kind,
      source: { type: sourceType },
      monthlyAmount: m,
      startMonth,
    }
    if (contractCode && selected) {
      body.contractCode = selected.contractCode
      if (selected.licensePlate) body.licensePlate = selected.licensePlate
      const name = selected.driverName || selected.buyerName
      if (name) body.driverName = name
    }
    if (a > 0) {
      if (kind === "debt") body.principal = a
      else body.targetAmount = a
    }
    if (Number(count) > 0) body.installmentCount = Number(count)
    if (kind === "debt" && Number(alreadyPaid) > 0) body.alreadyPaid = Number(alreadyPaid)
    if (notes.trim()) body.notes = notes.trim()

    setBusy(true)
    const r = await api("/api/partner/ledger", { method: "POST", body: JSON.stringify(body) })
    setBusy(false)
    if (!r.ok) { setError(r.msg ?? "บันทึกไม่สำเร็จ"); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
            <PlusCircle className="w-4 h-4 text-emerald-500" /> เพิ่มรายการหนี้ / เงินสะสม
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* ชนิด */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">ชนิดรายการ</label>
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
              {([
                { key: "debt",    label: "หนี้ (หักรายเดือน)" },
                { key: "deposit", label: "เงินสะสม" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setKind(t.key)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    kind === t.key
                      ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* สัญญา */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">สัญญา / พขร.</label>
            <select
              value={contractCode}
              onChange={(e) => setContractCode(e.target.value)}
              className="w-full h-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">— ไม่ผูกกับสัญญา —</option>
              {contracts.map((c) => (
                <option key={c._id} value={c.contractCode}>
                  {c.contractCode} · {c.buyerName}{c.licensePlate ? ` (${c.licensePlate})` : ""}
                </option>
              ))}
            </select>
            {selected && (
              <p className="text-[10px] text-zinc-400 mt-1">
                พขร. {selected.driverName || selected.buyerName} · ทะเบียน {selected.licensePlate || "—"}
              </p>
            )}
          </div>

          {/* ประเภทที่มา */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">ประเภท</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full h-9 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {sources.map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </div>

          {/* ยอดตั้งต้น / เป้า + จำนวนงวด + หัก/เดือน */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                {kind === "debt" ? "ยอดหนี้ตั้งต้น (บาท)" : "เป้าสะสม (บาท)"}
              </label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-xs" placeholder={kind === "deposit" ? "ไม่บังคับ" : ""} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">จำนวนงวด</label>
              <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} className="h-9 text-xs" placeholder="ไม่บังคับ" />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">หัก/เดือน (บาท) *</label>
              <Input
                type="number"
                value={monthly}
                onChange={(e) => { setMonthly(e.target.value); setMonthlyTouched(true) }}
                className="h-9 text-xs"
              />
              {!monthlyTouched && Number(amount) > 0 && Number(count) > 0 && (
                <p className="text-[10px] text-zinc-400 mt-1">แนะนำจาก {kind === "debt" ? "ยอดหนี้" : "เป้าสะสม"} ÷ จำนวนงวด</p>
              )}
            </div>
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">เริ่มหักเดือน *</label>
              <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>

          {/* migrate: ผ่อนมาแล้ว (หนี้เท่านั้น) — ยอดรวมคงเต็ม ระบบเดินต่อจากงวดจริง */}
          {kind === "debt" && (
            <div>
              <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                ผ่อนมาแล้ว (บาท) — สำหรับหนี้เก่าที่หักไปบางส่วนแล้ว (เว้นว่าง = ยังไม่เคยหัก)
              </label>
              <Input
                type="number" min="0" step="any"
                value={alreadyPaid}
                placeholder="0"
                onChange={(e) => setAlreadyPaid(e.target.value)}
                className="h-9 text-xs"
              />
              {Number(alreadyPaid) > 0 && Number(amount) > 0 && (
                <p className="text-[10px] text-zinc-400 mt-1">
                  คงเหลือ {(Number(amount) - Number(alreadyPaid)).toLocaleString("th-TH")} บาท
                  {Number(monthly) > 0 && <> · เริ่มต่อที่งวดที่ {Math.round(Number(alreadyPaid) / Number(monthly)) + 1}</>}
                </p>
              )}
            </div>
          )}

          {/* หมายเหตุ */}
          <div>
            <label className="text-[11px] font-semibold text-zinc-500 block mb-1.5">หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="รายละเอียดเพิ่มเติม เช่น ที่มาของหนี้"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={submit} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1">
              {busy ? "กำลังบันทึก..." : "บันทึกรายการ"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
