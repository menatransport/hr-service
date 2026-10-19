"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { Car, CreditCard, Banknote, Search, BarChart3, AlertTriangle, Wrench, X, Clock, PlusCircle, Pencil, Download, ExternalLink , FileText, BookImage } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { PriceHistoryDrawer } from "@/components/partner/price-history-drawer"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"
import { hasPerm } from "@/lib/partner/rbac"

type SaleStatus = "ready" | "repair15" | "repair30" | "review"

interface PriceRow {
  licensePlate:         string
  status:               "contract" | "active" | "inactive"
  saleStatus:           SaleStatus | null
  repairStart:          string | null
  repairEnd:            string | null
  downPayment:          number
  cashDown:             number
  remainingInstallment: number
  downInstallmentCount: number
  downInstallmentAmt:   number
  financeInstallments:  number
  monthlyPayment:       number
  financeAmount:        number
  totalSalePrice:       number
}

function fmt(n: number) {
  return n.toLocaleString("th-TH")
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(iso: string, days: number) {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** จำนวนวันจนถึงกำหนด (ติดลบ = เลยกำหนดแล้ว) */
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - new Date(todayISO()).getTime()) / 86400000)
}

function thaiShortDate(iso?: string | null) {
  if (!iso) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${String(parseInt(y)).slice(-2)}/${String(parseInt(y) + 543).slice(-2)}`
}

// ── สถานะความพร้อมขาย ──
const SALE_STATUS_CONFIG: Record<SaleStatus, { label: string; cls: string; days?: number }> = {
  ready:    { label: "พร้อมขาย",      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  repair15: { label: "รอซ่อม 15 วัน", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", days: 15 },
  repair30: { label: "รอซ่อม 30 วัน", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400", days: 30 },
  review:   { label: "ยังไม่ได้เริ่มดำเนินการ",     cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
}

// ── inline editor: ตั้งสถานะความพร้อมขาย + ช่วงซ่อม ──
function SaleStatusEditor({ row, onSaved, onClose }: {
  row: PriceRow
  onSaved: (patch: Pick<PriceRow, "saleStatus" | "repairStart" | "repairEnd">) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<SaleStatus | "">(row.saleStatus ?? "")
  const [start, setStart]   = useState(row.repairStart ?? todayISO())
  const [end, setEnd]       = useState(row.repairEnd ?? "")
  const [saving, setSaving] = useState(false)
  const isRepair = status === "repair15" || status === "repair30"

  function pick(s: SaleStatus | "") {
    setStatus(s)
    if (s === "repair15" || s === "repair30") {
      const st = start || todayISO()
      setStart(st)
      setEnd(addDays(st, SALE_STATUS_CONFIG[s].days!))
    }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/partner/price-list/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licensePlate: row.licensePlate,
          saleStatus:   status || null,
          repairStart:  isRepair ? start : null,
          repairEnd:    isRepair ? end : null,
        }),
      })
      if (!res.ok) { toast.error("บันทึกไม่สำเร็จ"); return }
      onSaved({
        saleStatus:  (status || null) as SaleStatus | null,
        repairStart: isRepair ? start : null,
        repairEnd:   isRepair ? end : null,
      })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-3 text-left">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">ความพร้อมขาย · {row.licensePlate}</span>
        <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        {(Object.entries(SALE_STATUS_CONFIG) as [SaleStatus, typeof SALE_STATUS_CONFIG[SaleStatus]][]).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
              status === key
                ? `${cfg.cls} border-transparent ring-1 ring-current`
                : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
            }`}
          >
            {cfg.label}
          </button>
        ))}
      </div>
      {isRepair && (
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">วันเริ่มซ่อม</label>
            <ThaiDateInput value={start} onChange={(iso) => {
                setStart(iso)
                if (iso) setEnd(addDays(iso, SALE_STATUS_CONFIG[status as SaleStatus].days!))
              }} />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-400 mb-0.5">กำหนดเสร็จ</label>
            <ThaiDateInput value={end} onChange={(iso) => setEnd(iso)} />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => pick("")}
          className={`text-[10px] underline ${status === "" ? "text-zinc-700 font-semibold" : "text-zinc-400 hover:text-zinc-600"}`}
        >
          ล้างสถานะ
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || (isRepair && (!start || !end))}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </div>
  )
}

function PayBar({ down, finance }: { down: number; finance: number }) {
  const total = down + finance
  if (!total) return null
  const downPct = Math.round((down / total) * 100)
  return (
    <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 mt-1.5" title={`ดาวน์ ${downPct}% / ไฟแนนซ์ ${100 - downPct}%`}>
      <div className="bg-amber-400 dark:bg-amber-500" style={{ width: `${downPct}%` }} />
      <div className="bg-blue-400 dark:bg-blue-500 flex-1" />
    </div>
  )
}


// ── ฟอร์มเพิ่ม/แก้ไขราคาขาย (ทุก user ที่ login ใช้ได้) ──
const PRICE_FIELDS: { key: string; label: string }[] = [
  { key: "totalSalePrice",       label: "ราคาขายรวม (บาท)" },
  { key: "downPayment",          label: "เงินดาวน์รวม (บาท)" },
  { key: "cashDown",             label: "ดาวน์ชำระแล้ว (บาท)" },
  { key: "remainingInstallment", label: "ดาวน์คงเหลือ (บาท)" },
  { key: "downInstallmentCount", label: "จำนวนงวดดาวน์ (เดือน)" },
  { key: "downInstallmentAmt",   label: "ค่างวดดาวน์/เดือน (บาท)" },
  { key: "financeAmount",        label: "ยอดไฟแนนซ์ (บาท)" },
  { key: "financeInstallments",  label: "จำนวนงวดไฟแนนซ์ (เดือน)" },
  { key: "monthlyPayment",       label: "ค่างวด/เดือน (บาท)" },
]

function PriceFormPanel({ mode, row, existingPlates, onClose, onSaved }: {
  mode: "add" | "edit"
  row?: PriceRow
  existingPlates: Set<string>
  onClose: () => void
  onSaved: () => void
}) {
  const [plate, setPlate] = useState(row?.licensePlate ?? "")
  const [plateOptions, setPlateOptions] = useState<string[]>([])
  const [f, setF] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const { key } of PRICE_FIELDS) {
      const v = row?.[key as keyof PriceRow]
      init[key] = v === null || v === undefined ? "" : String(v)
    }
    return init
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  // ทะเบียนจาก vehicle_master ที่ยังไม่มีราคา (เฉพาะโหมดเพิ่ม)
  useEffect(() => {
    if (mode !== "add") return
    fetch("/api/partner/vehicles")
      .then((r) => (r.ok ? r.json() : []))
      .then((vs: { licensePlate?: string }[]) =>
        setPlateOptions(
          vs.map((v) => v.licensePlate ?? "").filter((p) => p && !existingPlates.has(p)).sort()
        ))
      .catch(() => setPlateOptions([]))
  }, [mode, existingPlates])

  const num = (k: string) => { const n = Number(f[k]); return f[k] !== "" && Number.isFinite(n) ? n : null }

  // auto-calc: กรอกช่องต้นทางแล้วช่องปลายทางเติมให้เอง (ถ้าผู้ใช้ยังไม่พิมพ์ทับ)
  function setField(k: string, v: string) {
    setTouched((t) => ({ ...t, [k]: true }))
    setF((prev) => {
      const next = { ...prev, [k]: v }
      const n = (kk: string) => { const x = Number(next[kk]); return next[kk] !== "" && Number.isFinite(x) ? x : null }
      const auto = (kk: string, val: number | null) => {
        if (val === null || touched[kk]) return
        next[kk] = String(Math.round(val * 100) / 100)
      }
      const total = n("totalSalePrice"), down = n("downPayment"), cash = n("cashDown")
      const downCnt = n("downInstallmentCount"), fin = n("financeAmount"), finCnt = n("financeInstallments")
      if (total !== null && down !== null) auto("financeAmount", total - down)
      if (down !== null && cash !== null) auto("remainingInstallment", down - cash)
      const remain = n("remainingInstallment")
      if (remain !== null && downCnt) auto("downInstallmentAmt", remain / downCnt)
      const fin2 = n("financeAmount")
      if ((fin ?? fin2) !== null && finCnt) auto("monthlyPayment", (fin2 ?? fin)! / finCnt)
      return next
    })
  }

  async function handleSave() {
    setErr("")
    if (!plate) { setErr("เลือกทะเบียนรถก่อน"); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { licensePlate: plate }
      for (const { key } of PRICE_FIELDS) payload[key] = num(key)
      const res = mode === "add"
        ? await fetch("/api/partner/price-list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/partner/price-list/${encodeURIComponent(plate)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? "บันทึกไม่สำเร็จ")
      }
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
            {mode === "add" ? "เพิ่มราคาขาย" : `แก้ไขราคาขาย — ${plate}`}
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {mode === "add" && (
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">ทะเบียนรถ (เฉพาะคันที่ยังไม่มีราคา)</label>
              <select
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
              >
                <option value="">— เลือกทะเบียน —</option>
                {plateOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {mode === "edit" && row?.status === "contract" && (
            <div className="text-[11px] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg px-3 py-2">
              ทะเบียนนี้ติดสัญญาอยู่ — การแก้ราคาไม่กระทบสัญญาเดิม (สัญญาเก็บตัวเลข ณ วันทำสัญญาแล้ว)
              มีผลเฉพาะสัญญาใหม่เท่านั้น
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {PRICE_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-zinc-500">{label}</label>
                <input
                  type="number" step="any" min="0"
                  value={f[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm tabular-nums"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-400">
            ระบบเติมให้อัตโนมัติ: ไฟแนนซ์ = ราคารวม − ดาวน์ · ดาวน์คงเหลือ = ดาวน์ − ชำระแล้ว ·
            ค่างวด = ยอด ÷ จำนวนงวด (พิมพ์ทับได้)
          </p>
          {err && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button
              type="button" disabled={saving} onClick={handleSave}
              className="flex-1 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm">
              ยกเลิก
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  contract: { label: "ติดสัญญา", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
  active:   { label: "ว่าง",     cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400" },
  inactive: { label: "ไม่ใช้งาน", cls: "bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400" },
}

const STATUS_TABS = [
  { key: "",         label: "ทั้งหมด" },
  { key: "contract", label: "ติดสัญญา" },
  { key: "active",   label: "ว่าง" },
  { key: "inactive", label: "ไม่ใช้งาน" },
]

export default function PriceListPage() {
  const { data: session } = usePartnerSession()
  // แก้ราคา/ยอดผ่อนได้ = สิทธิ์ masterdata (superadmin/admin/fleet) — ตรงกับที่ API บังคับ
  const isAdmin = hasPerm(session?.user?.role, "masterdata")

  const [rows,    setRows]    = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q,       setQ]       = useState("")
  const [installFilter, setInstallFilter] = useState<number | null>(null)
  const [statusFilter,  setStatusFilter]  = useState("")
  const [saleFilter,    setSaleFilter]    = useState("")
  const [editingPlate,  setEditingPlate]  = useState<string | null>(null)
  const [historyPlate,  setHistoryPlate]  = useState<string | null>(null)
  const [priceForm, setPriceForm] = useState<{ mode: "add" } | { mode: "edit"; row: PriceRow } | null>(null)

  const load = useCallback(() => {
    fetch("/api/partner/price-list")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setRows(data); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const installmentGroups = useMemo(() =>
    Array.from(new Set(rows.map((r) => r.financeInstallments)))
      .sort((a, b) => a - b)
      .map((v) => ({ value: v, count: rows.filter((r) => r.financeInstallments === v).length })),
    [rows]
  )

  const filtered = useMemo(() => {
    let res = rows
    if (statusFilter)        res = res.filter((r) => r.status === statusFilter)
    if (saleFilter)          res = res.filter((r) => saleFilter === "none" ? !r.saleStatus : r.saleStatus === saleFilter)
    if (installFilter !== null) res = res.filter((r) => r.financeInstallments === installFilter)
    if (q) res = res.filter((r) => r.licensePlate.toLowerCase().includes(q.toLowerCase()))
    return res
  }, [rows, q, installFilter, statusFilter, saleFilter])

  // ── แจ้งเตือนรถรอซ่อมถึง/ใกล้ถึงกำหนด ──
  const repairRows = useMemo(() =>
    rows.filter((r) => (r.saleStatus === "repair15" || r.saleStatus === "repair30") && r.repairEnd),
    [rows]
  )
  const overdueRepairs = repairRows.filter((r) => daysUntil(r.repairEnd!) <= 0)
  const dueSoonRepairs = repairRows.filter((r) => { const d = daysUntil(r.repairEnd!); return d > 0 && d <= 3 })

  const totalFleetValue = rows.reduce((s, r) => s + r.totalSalePrice, 0)
  const totalFinance    = rows.reduce((s, r) => s + r.financeAmount, 0)
  const avgMonthly      = rows.length ? Math.round(rows.reduce((s, r) => s + r.monthlyPayment, 0) / rows.length) : 0
  const avgDown         = rows.length ? Math.round(rows.reduce((s, r) => s + r.downPayment, 0) / rows.length) : 0

  const sumTotal    = filtered.reduce((s, r) => s + r.totalSalePrice, 0)
  const sumFinance  = filtered.reduce((s, r) => s + r.financeAmount, 0)
  const sumDown     = filtered.reduce((s, r) => s + r.downPayment, 0)
  const avgMonthlyF = filtered.length ? Math.round(filtered.reduce((s, r) => s + r.monthlyPayment, 0) / filtered.length) : 0

  const pg = usePagination(filtered, 50, [q, installFilter, statusFilter, saleFilter])

  const contractCount  = rows.filter((r) => r.status === "contract").length
  const availableCount = rows.filter((r) => r.status === "active").length

  // ── Export Excel — เฉพาะแถวที่กรองอยู่ (respect search + status + sale + งวด filters) ──
  async function handleExportExcel() {
    const rows_ = filtered.map((r) => ({
      "ทะเบียน":            r.licensePlate,
      "สถานะ":             STATUS_CONFIG[r.status]?.label ?? r.status,
      "ความพร้อมขาย":       r.status === "contract" ? "ขายแล้ว" : r.saleStatus ? SALE_STATUS_CONFIG[r.saleStatus].label : "",
      "ราคาขายรวม":         r.totalSalePrice,
      "เงินดาวน์รวม":        r.downPayment,
      "ดาวน์ชำระแล้ว":       r.cashDown,
      "ดาวน์คงเหลือ":        r.remainingInstallment,
      "จำนวนงวดดาวน์":       r.downInstallmentCount,
      "ค่างวดดาวน์":         r.downInstallmentAmt,
      "ยอดไฟแนนซ์":         r.financeAmount,
      "จำนวนงวดไฟแนนซ์":     r.financeInstallments,
      "ค่างวด/เดือน":        r.monthlyPayment,
    }))
    await exportToExcel([{ name: "ราคาขาย", rows: rows_ }], `price-list-${todayStamp()}`)
  }

  // สัดส่วนความพร้อมขายของฝูงรถ (แยกกลุ่มไม่ซ้ำ รวม = จำนวนคันทั้งหมด)
  const soldCount   = contractCount
  const readyCount  = rows.filter((r) => r.status !== "contract" && r.saleStatus === "ready").length
  const repairCnt   = rows.filter((r) => r.status !== "contract" && (r.saleStatus === "repair15" || r.saleStatus === "repair30")).length
  const unsetCount  = rows.length - soldCount - readyCount - repairCnt
  const saleBreakdown = [
    { key: "sold",   label: "ขายแล้ว",    count: soldCount,  cls: "bg-blue-500" },
    { key: "ready",  label: "พร้อมขาย",   count: readyCount, cls: "bg-emerald-500" },
    { key: "repair", label: "รอซ่อม",     count: repairCnt,  cls: "bg-amber-500" },
    { key: "unset",  label: "ยังไม่ระบุ", count: unsetCount, cls: "bg-zinc-300 dark:bg-zinc-600" },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="text-xs text-zinc-400 animate-pulse">กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">ข้อมูลอ้างอิงหลัก</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Master Price List</h1>
          <p className="text-xs text-zinc-400 mt-0.5">ราคาขาย / เงินดาวน์ / ค่างวดไฟแนนซ์ ต่อทะเบียนรถ</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-medium">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />เงินดาวน์</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" />ไฟแนนซ์</span>
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3.5 py-2 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
            title="ดาวน์โหลดเป็น Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setPriceForm({ mode: "add" })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3.5 py-2"
            >
              <PlusCircle className="w-3.5 h-3.5" /> เพิ่มราคาขาย
            </button>
          )}
        </div>
      </div>

      {/* ── แจ้งเตือนรถรอซ่อมถึงกำหนด ── */}
      {(overdueRepairs.length > 0 || dueSoonRepairs.length > 0) && (
        <div className="space-y-2">
          {overdueRepairs.length > 0 && (
            <div className="rounded-xl border-2 border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-bold text-sm mb-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                ถึงกำหนดซ่อมเสร็จแล้ว {overdueRepairs.length} คัน — ตรวจสอบและอัปเดตสถานะ
              </div>
              <div className="flex flex-wrap gap-1.5">
                {overdueRepairs.map((r) => (
                  <button
                    key={r.licensePlate}
                    onClick={() => isAdmin && setEditingPlate(r.licensePlate)}
                    className="text-[11px] font-mono font-semibold bg-white dark:bg-zinc-900 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 rounded-full px-2.5 py-0.5 hover:bg-red-100 dark:hover:bg-red-950/50"
                    title={`กำหนดเสร็จ ${thaiShortDate(r.repairEnd)} (เลยมา ${Math.abs(daysUntil(r.repairEnd!))} วัน)`}
                  >
                    {r.licensePlate} · เลยกำหนด {Math.abs(daysUntil(r.repairEnd!))} วัน
                  </button>
                ))}
              </div>
            </div>
          )}
          {dueSoonRepairs.length > 0 && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-bold text-sm mb-1.5">
                <Wrench className="w-4 h-4 shrink-0" />
                ใกล้ถึงกำหนดซ่อมเสร็จ (ภายใน 3 วัน) {dueSoonRepairs.length} คัน
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dueSoonRepairs.map((r) => (
                  <button
                    key={r.licensePlate}
                    onClick={() => isAdmin && setEditingPlate(r.licensePlate)}
                    className="text-[11px] font-mono font-semibold bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-full px-2.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                  >
                    {r.licensePlate} · อีก {daysUntil(r.repairEnd!)} วัน ({thaiShortDate(r.repairEnd)})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            icon: <Car className="w-4 h-4 text-zinc-400" />,
            label: "ทะเบียนทั้งหมด",
            value: `${rows.length} คัน`,
            sub: `ติดสัญญา ${contractCount} · ว่าง ${availableCount}`,
            accent: "text-zinc-900 dark:text-zinc-50",
          },
          {
            icon: <BarChart3 className="w-4 h-4 text-blue-500" />,
            label: "มูลค่าฝูงรถรวม",
            value: `฿${fmt(totalFleetValue)}`,
            sub: `จัดไฟแนนซ์ ฿${fmt(totalFinance)}`,
            accent: "text-blue-700 dark:text-blue-400",
          },
          {
            icon: <Banknote className="w-4 h-4 text-amber-500" />,
            label: "เงินดาวน์เฉลี่ย",
            value: `฿${fmt(avgDown)}`,
            sub: `${Math.round((avgDown / (avgDown + (rows.length ? Math.round(totalFinance / rows.length) : 1))) * 100)}% ของราคาขาย`,
            accent: "text-amber-700 dark:text-amber-400",
          },
          {
            icon: <CreditCard className="w-4 h-4 text-violet-500" />,
            label: "ผ่อนเดือนละเฉลี่ย",
            value: `฿${fmt(avgMonthly)}`,
            sub: "ค่าเฉลี่ยทุกสัญญา",
            accent: "text-violet-700 dark:text-violet-400",
          },
        ].map(({ icon, label, value, sub, accent }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-4">
            <div className="flex items-center gap-1.5 mb-2">{icon}<p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p></div>
            <p className={`text-xl font-bold tabular-nums leading-none ${accent}`}>{value}</p>
            {sub && <p className="text-[10px] text-zinc-400 mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── สัดส่วนความพร้อมขาย ── */}
      <div className="mt-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">สัดส่วนความพร้อมขาย</p>
          <p className="text-[10px] text-zinc-400">รวม {rows.length} คัน</p>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          {saleBreakdown.filter((s) => s.count > 0).map((s) => (
            <div key={s.key} className={s.cls} style={{ width: `${(s.count / Math.max(rows.length, 1)) * 100}%` }}
              title={`${s.label} ${s.count} คัน`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
          {saleBreakdown.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[11px]">
              <span className={`w-2 h-2 rounded-full ${s.cls}`} />
              <span className="text-zinc-500">{s.label}</span>
              <span className="font-bold tabular-nums text-zinc-800 dark:text-zinc-100">{s.count}</span>
              <span className="text-zinc-400">({rows.length ? Math.round((s.count / rows.length) * 100) : 0}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status tabs ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">สถานะ</span>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
              <span className="ml-1 text-[10px] opacity-60">
                ({tab.key === "" ? rows.length : rows.filter((r) => r.status === tab.key).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sale-readiness filter pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ความพร้อมขาย</span>
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 flex-wrap">
          {[
            { key: "",         label: "ทั้งหมด" },
            { key: "ready",    label: "พร้อมขาย" },
            { key: "repair15", label: "รอซ่อม 15 วัน" },
            { key: "repair30", label: "รอซ่อม 30 วัน" },
            { key: "review",   label: "ยังไม่ได้เริ่มดำเนินการ" },
            { key: "none",     label: "ยังไม่ระบุ" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSaleFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                saleFilter === tab.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
              <span className="ml-1 text-[10px] opacity-60">
                ({tab.key === "" ? rows.length
                  : tab.key === "none" ? rows.filter((r) => !r.saleStatus).length
                  : rows.filter((r) => r.saleStatus === tab.key).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Installment filter pills ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">งวดผ่อน</span>
        <button
          onClick={() => setInstallFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            installFilter === null
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          ทั้งหมด ({rows.length})
        </button>
        {installmentGroups.map(({ value, count }) => (
          <button
            key={value}
            onClick={() => setInstallFilter(installFilter === value ? null : value)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              installFilter === value
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/40"
            }`}
          >
            {value} งวด
            <span className={`ml-1.5 text-[10px] ${installFilter === value ? "opacity-80" : "opacity-60"}`}>
              ({count})
            </span>
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-auto">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500">
            {filtered.length} ทะเบียน
            {(q || installFilter !== null || statusFilter) && (
              <span className="text-zinc-400 font-normal"> (จาก {rows.length})</span>
            )}
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <Input
              placeholder="ค้นหาทะเบียน..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-7 w-48 text-xs pl-8"
            />
          </div>
        </div>

        <table className="w-full text-xs">
          <thead>
            {/* คอลัมน์แบบกระชับ — รวมฟิลด์ที่เกี่ยวข้องเป็นเซลล์ 2 บรรทัด (ไม่ตัดข้อมูลทิ้ง) */}
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <th className="px-2.5 py-2 text-left text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap min-w-[100px]">ทะเบียน</th>
              <th className="px-2.5 py-2 text-right text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider whitespace-nowrap border-l border-zinc-200 dark:border-zinc-700">ดาวน์รวม / ชำระแล้ว</th>
              <th className="px-2.5 py-2 text-right text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider whitespace-nowrap">ดาวน์คงเหลือ / งวด</th>
              <th className="px-2.5 py-2 text-right text-[10px] font-semibold text-blue-500 uppercase tracking-wider whitespace-nowrap border-l border-zinc-200 dark:border-zinc-700">ยอดจัดไฟแนนซ์ / งวด×ผ่อน</th>
              <th className="px-2.5 py-2 text-right text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider whitespace-nowrap border-l border-zinc-200 dark:border-zinc-700 min-w-[110px]">รวมราคาขาย</th>
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-l border-zinc-200 dark:border-zinc-700">สถานะ</th>
              <th className="px-2.5 py-2 text-center text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap border-l border-zinc-200 dark:border-zinc-700 min-w-[130px]">ความพร้อมขาย</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {pg.paged.map((r) => {
              const downPct = r.totalSalePrice ? Math.round((r.downPayment / r.totalSalePrice) * 100) : 0
              const sc = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.active
              return (
                <tr key={r.licensePlate} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors group">

                  {/* License plate → jump to vehicle record */}
                  <td className="px-2.5 py-2 align-top">
                    <Link
                      href={`/partner/vehicles?plate=${encodeURIComponent(r.licensePlate)}`}
                      title="ดูข้อมูลรถคันนี้ในทะเบียนรถ"
                      className="group/plate inline-flex items-center gap-1 font-mono text-[12px] font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                    >
                      {r.licensePlate}
                      <ExternalLink className="w-3 h-3 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover/plate:opacity-100 transition-opacity" />
                    </Link>
                  </td>

                  {/* ดาวน์รวม / ชำระแล้ว (เงินสด) */}
                  <td className="px-2.5 py-2 align-top text-right whitespace-nowrap border-l border-zinc-50 dark:border-zinc-800/60">
                    <div className="text-xs tabular-nums text-amber-700 dark:text-amber-400 font-semibold">{fmt(r.downPayment)}</div>
                    <div className="text-[10px] tabular-nums text-zinc-400 mt-0.5" title="เงินสดที่ชำระดาวน์แล้ว">ชำระ {fmt(r.cashDown)}</div>
                  </td>

                  {/* ดาวน์คงเหลือ / จำนวนงวด × ค่างวดดาวน์ */}
                  <td className="px-2.5 py-2 align-top text-right whitespace-nowrap">
                    <div className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">{fmt(r.remainingInstallment)}</div>
                    <div className="text-[10px] tabular-nums text-zinc-400 mt-0.5" title="จำนวนงวดดาวน์ × ค่างวดดาวน์/เดือน">{r.downInstallmentCount} งวด × {fmt(r.downInstallmentAmt)}</div>
                  </td>

                  {/* ยอดจัดไฟแนนซ์ / จำนวนงวด × ผ่อนเดือนละ */}
                  <td className="px-2.5 py-2 align-top text-right whitespace-nowrap border-l border-zinc-50 dark:border-zinc-800/60">
                    <div className="text-xs tabular-nums text-blue-600 dark:text-blue-300 font-semibold">{fmt(r.financeAmount)}</div>
                    <div className="text-[10px] mt-0.5 flex items-center justify-end gap-1">
                      <span className="inline-block px-1 py-0 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold tabular-nums">{r.financeInstallments} งวด</span>
                      <span className="tabular-nums text-blue-700/70 dark:text-blue-400/80 font-medium" title="ค่างวดไฟแนนซ์/เดือน">× {fmt(r.monthlyPayment)}</span>
                    </div>
                  </td>

                  {/* Total */}
                  <td className="px-2.5 py-2 align-top border-l border-zinc-50 dark:border-zinc-800/60 min-w-[110px]">
                    <div className="text-right text-xs tabular-nums font-bold text-zinc-900 dark:text-zinc-50">
                      {fmt(r.totalSalePrice)}
                    </div>
                    <PayBar down={r.downPayment} finance={r.financeAmount} />
                    <div className="text-right text-[9px] text-zinc-400 mt-0.5 tabular-nums">
                      ดาวน์ {downPct}%
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-2.5 py-2 align-top text-center border-l border-zinc-50 dark:border-zinc-800/60">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.cls}`}>
                      {sc.label}
                    </span>
                  </td>

                  {/* Sale readiness */}
                  <td className="px-2.5 py-2 align-top text-center border-l border-zinc-50 dark:border-zinc-800/60 relative">
                    {(() => {
                      // รถติดสัญญา = ขายไปแล้ว → โชว์ "ขายแล้ว" (ตั้งความพร้อมขายไม่ได้)
                      if (r.status === "contract") return (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                          ขายแล้ว
                        </span>
                      )
                      const ss = r.saleStatus ? SALE_STATUS_CONFIG[r.saleStatus] : null
                      const isRepair = r.saleStatus === "repair15" || r.saleStatus === "repair30"
                      const dLeft = isRepair && r.repairEnd ? daysUntil(r.repairEnd) : null
                      return (
                        <>
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => setEditingPlate(editingPlate === r.licensePlate ? null : r.licensePlate)}
                            title={isAdmin ? "คลิกเพื่อตั้งสถานะความพร้อมขาย" : undefined}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold transition-shadow ${
                              ss ? ss.cls : "bg-zinc-50 text-zinc-300 dark:bg-zinc-800/60 dark:text-zinc-600 border border-dashed border-zinc-200 dark:border-zinc-700"
                            } ${isAdmin ? "cursor-pointer hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600" : "cursor-default"}`}
                          >
                            {ss ? ss.label : "＋ ระบุ"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryPlate(r.licensePlate)}
                            title="ประวัติการแก้ไข (ใคร/เมื่อไหร่)"
                            className="ml-1 align-middle text-zinc-300 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300"
                          >
                            <Clock className="w-3 h-3 inline" />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setPriceForm({ mode: "edit", row: r })}
                              title="แก้ไขราคา / ยอดผ่อน"
                              className="ml-1 inline-flex items-center gap-1 align-middle rounded-md border border-emerald-200 dark:border-emerald-800/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            >
                              <Pencil className="w-3 h-3" /> แก้ราคา
                            </button>
                          )}
                          <Link
                            href={`/partner/quotations?vehicle=${encodeURIComponent(r.licensePlate)}`}
                            title="ทำใบเสนอราคาจากรถคันนี้"
                            className="ml-1 align-middle text-zinc-300 hover:text-[#C9A227] dark:text-zinc-600"
                          >
                            <FileText className="w-3 h-3 inline" />
                          </Link>
                          <a
                            href={`/api/partner/catalog/${encodeURIComponent(r.licensePlate)}/pdf`}
                            target="_blank" rel="noreferrer"
                            title="Catalog PDF รถคันนี้"
                            className="ml-1 align-middle text-zinc-300 hover:text-[#C9A227] dark:text-zinc-600"
                          >
                            <BookImage className="w-3 h-3 inline" />
                          </a>
                          {isRepair && r.repairEnd && dLeft !== null && (
                            <div
                              className={`text-[9px] font-semibold mt-0.5 tabular-nums ${
                                dLeft <= 0 ? "text-red-500" : dLeft <= 3 ? "text-amber-500" : "text-zinc-400"
                              }`}
                              title={`${thaiShortDate(r.repairStart)} — ${thaiShortDate(r.repairEnd)}`}
                            >
                              {dLeft <= 0 ? `เลยกำหนด ${Math.abs(dLeft)} วัน` : `อีก ${dLeft} วัน (${thaiShortDate(r.repairEnd)})`}
                            </div>
                          )}
                          {editingPlate === r.licensePlate && (
                            <SaleStatusEditor
                              row={r}
                              onClose={() => setEditingPlate(null)}
                              onSaved={(patch) =>
                                setRows((prev) => prev.map((x) =>
                                  x.licensePlate === r.licensePlate ? { ...x, ...patch } : x))
                              }
                            />
                          )}
                        </>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>

          {/* Footer totals */}
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40">
                <td className="px-2.5 py-2.5 text-xs font-semibold text-zinc-500 whitespace-nowrap">
                  รวม {filtered.length} คัน
                </td>
                <td className="px-2.5 py-2.5 text-right text-xs tabular-nums font-bold text-amber-700 dark:text-amber-400 border-l border-zinc-200 dark:border-zinc-700">
                  {fmt(sumDown)}
                </td>
                <td className="px-2.5 py-2.5" />
                <td className="px-2.5 py-2.5 text-right border-l border-zinc-200 dark:border-zinc-700 whitespace-nowrap">
                  <div className="text-xs tabular-nums font-bold text-blue-600 dark:text-blue-400">{fmt(sumFinance)}</div>
                  <div className="text-[10px] tabular-nums text-blue-500/80 mt-0.5">เฉลี่ย/เดือน {fmt(avgMonthlyF)}</div>
                </td>
                <td className="px-2.5 py-2.5 text-right text-xs tabular-nums font-bold text-zinc-900 dark:text-zinc-50 border-l border-zinc-200 dark:border-zinc-700">
                  {fmt(sumTotal)}
                </td>
                <td className="border-l border-zinc-200 dark:border-zinc-700" />
                <td className="border-l border-zinc-200 dark:border-zinc-700" />
              </tr>
            </tfoot>
          )}
        </table>
        <PaginationBar {...pg} unit="ทะเบียน" />
      </div>

      <PriceHistoryDrawer plate={historyPlate} onClose={() => setHistoryPlate(null)} />
      {/* ฟอร์มเพิ่ม/แก้ไขราคาขาย */}
      {priceForm && (
        <PriceFormPanel
          mode={priceForm.mode}
          row={priceForm.mode === "edit" ? priceForm.row : undefined}
          existingPlates={new Set(rows.map((r) => r.licensePlate))}
          onClose={() => setPriceForm(null)}
          onSaved={load}
        />
      )}

    </div>
  )
}
