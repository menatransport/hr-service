"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import Link from "next/link"
import {
  ChevronRight, ChevronDown, Gift, Wrench, Settings2,
  Plus, Power, PowerOff, Trash2, Search, X, Check, Car, ExternalLink, Download,
} from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { Button } from "@/components/partner/ui/button"

// ─── Types ───────────────────────────────────────────────────────────────────

type ProType = "pro1" | "pro2" | "pro3" | "custom"

interface PromoEntry {
  id:             string
  licensePlate:   string
  proType:        ProType
  label:          string
  active:         boolean
  disabledReason: string | null
  disabledAt:     string | null
  details:        Record<string, unknown>
  createdAt:      string
  updatedAt:      string
}

interface Vehicle { _id?: string; licensePlate?: string; truckNumber?: string }

/** Budget + usage per plate from /api/promotions/by-plate (single source of truth
 *  shared with the vehicle-cost page: repair_claims + pm_records + stock_movements) */
interface BudgetRow {
  plate:               string
  licensePlate:        string
  contractCode:        string
  driverName:          string
  repairBudget:        number
  repairUsed:          number
  repairRemaining:     number
  annualPmCap:         number
  pmUsedThisYear:      number
  pmRemainingThisYear: number
}

type GroupedData = Record<string, PromoEntry[]>

function normPlate(p: string): string {
  const m = String(p).match(/\d{2}-\d{4}/)
  return m ? m[0] : String(p).trim()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: unknown) {
  const num = Number(n)
  return isNaN(num) ? "—" : num.toLocaleString("th-TH")
}

const TYPE_META: Record<ProType, { icon: React.ReactNode; color: string; label: string }> = {
  pro1:   { icon: <Gift className="w-3.5 h-3.5" />,      color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-800",   label: "ค่าตอบแทนพิเศษเมื่อผ่อนชำระครบกำหนด" },
  pro2:   { icon: <Wrench className="w-3.5 h-3.5" />,    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", label: "ฟรีซ่อม" },
  pro3:   { icon: <Settings2 className="w-3.5 h-3.5" />, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800",   label: "PM" },
  custom: { icon: <Plus className="w-3.5 h-3.5" />,      color: "text-zinc-600 bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",           label: "อื่นๆ" },
}

function ProTypeBadge({ type }: { type: ProType }) {
  const m = TYPE_META[type] ?? TYPE_META.custom
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${m.color}`}>
      {m.icon}{m.label}
    </span>
  )
}

function DetailLine({ entry }: { entry: PromoEntry }) {
  const d = entry.details
  if (entry.proType === "pro1") return (
    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
      {d.condition as string} · ฟรี {fmt(d.freeCount)} งวด · รวม ฿{fmt(d.totalValue)} · ทุกงวดที่ {d.freeAtInstallments as string}
    </span>
  )
  if (entry.proType === "pro2") return (
    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">วงเงินซ่อมฟรี ฿{fmt(d.repairBudget)}</span>
  )
  if (entry.proType === "pro3") return (
    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">PM รวม/ปี ฿{fmt(d.annualPm)}</span>
  )
  return (
    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
      {Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(" · ")}
    </span>
  )
}

// ─── Plate combobox ───────────────────────────────────────────────────────────

function PlateCombobox({
  vehicles,
  existingPlates,
  value,
  onChange,
}: {
  vehicles: Vehicle[]
  existingPlates: Set<string>
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const filtered = useMemo(() => {
    const sq = q.toLowerCase()
    return vehicles.filter((v) => {
      const plate = v.licensePlate ?? ""
      return plate.toLowerCase().includes(sq)
    }).slice(0, 40)
  }, [vehicles, q])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Car className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
        <Input
          className="pl-8 h-9 text-sm font-mono"
          placeholder="ค้นหาหรือพิมพ์ทะเบียนรถ..."
          value={q}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 max-h-52 overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
          {filtered.map((v) => {
            const plate = v.licensePlate ?? ""
            const already = existingPlates.has(plate)
            return (
              <button
                key={plate}
                type="button"
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${already ? "opacity-50" : ""}`}
                onClick={() => { onChange(plate); setQ(plate); setOpen(false) }}
              >
                <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{plate}</span>
                <div className="flex items-center gap-2">
                  {v.truckNumber && <span className="text-[10px] text-zinc-400">#{v.truckNumber}</span>}
                  {already && <span className="text-[9px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded font-semibold">มีโปรฯแล้ว</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Promo fields form (shared) ───────────────────────────────────────────────

const PROMO_FIELDS: Record<ProType, Array<{ key: string; placeholder: string; numeric?: boolean }>> = {
  pro1: [
    { key: "freeCount",          placeholder: "จำนวนงวดที่ฟรี",         numeric: true },
    { key: "totalValue",         placeholder: "รวมมูลค่า (฿)",           numeric: true },
    { key: "installmentValue",   placeholder: "มูลค่า/งวด (฿)",         numeric: true },
    { key: "condition",          placeholder: "เงื่อนไข เช่น 9 ฟรี 1" },
    { key: "freeAtInstallments", placeholder: "ทุกงวดที่ เช่น 10, 20, 30" },
  ],
  pro2:   [{ key: "repairBudget", placeholder: "วงเงินซ่อมฟรี (฿)", numeric: true }],
  pro3:   [{ key: "annualPm",     placeholder: "PM รวม/ปี (฿)",     numeric: true }],
  custom: [{ key: "description",  placeholder: "รายละเอียด" }],
}

/** ยอดเงินของโปรโมชั่น 1 รายการ — ดึงจากช่องเงินตามประเภทใน PROMO_FIELDS
 *  custom ไม่มีช่องกรอกเงิน (มีแต่รายละเอียด) จึงนับเป็น 0 */
function promoAmount(e: PromoEntry): number {
  const d = e.details ?? {}
  const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0 }
  if (e.proType === "pro1") return num(d.totalValue) || num(d.freeCount) * num(d.installmentValue)
  if (e.proType === "pro2") return num(d.repairBudget)
  if (e.proType === "pro3") return num(d.annualPm)
  return 0
}

// ─── Add-plate modal ──────────────────────────────────────────────────────────

interface AddPlateModalProps {
  vehicles:       Vehicle[]
  existingPlates: Set<string>
  onSave:         (plate: string, entry: Omit<PromoEntry, "id" | "active" | "disabledReason" | "disabledAt" | "createdAt" | "updatedAt">) => Promise<void>
  onClose:        () => void
}

function AddPlateModal({ vehicles, existingPlates, onSave, onClose }: AddPlateModalProps) {
  const [plate,   setPlate]   = useState("")
  const [proType, setProType] = useState<ProType>("pro1")
  const [label,   setLabel]   = useState("")
  const [details, setDetails] = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState("")

  function setField(k: string, v: string) {
    setDetails((p) => ({ ...p, [k]: v }))
  }

  async function handleSave() {
    if (!plate.trim()) { setError("กรุณาเลือกทะเบียนรถ"); return }
    if (!label.trim()) { setError("กรุณาระบุชื่อโปรโมชั่น"); return }
    const parsedDetails: Record<string, unknown> = {}
    for (const f of PROMO_FIELDS[proType]) {
      const raw = details[f.key] ?? ""
      parsedDetails[f.key] = f.numeric ? (parseFloat(raw) || 0) : raw
    }
    setSaving(true); setError("")
    try {
      await onSave(plate.trim(), { licensePlate: plate.trim(), proType, label: label.trim(), details: parsedDetails })
    } catch {
      setError("เกิดข้อผิดพลาด"); setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10 rounded-t-2xl">
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">เพิ่มรถพร้อมโปรโมชั่น</h2>
              <p className="text-xs text-zinc-400 mt-0.5">เลือกทะเบียนรถและกำหนดโปรโมชั่นแรก</p>
            </div>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5">

            {/* Plate picker */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">ทะเบียนรถ <span className="text-red-400">*</span></label>
              <PlateCombobox
                vehicles={vehicles}
                existingPlates={existingPlates}
                value={plate}
                onChange={setPlate}
              />
              {plate && existingPlates.has(plate) && (
                <p className="text-[11px] text-amber-600 mt-1">ทะเบียนนี้มีโปรโมชั่นอยู่แล้ว — จะเพิ่มโปรโมชั่นใหม่ให้</p>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">โปรโมชั่น</span>
              <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            </div>

            {/* ProType selector */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">ประเภทโปรโมชั่น</label>
              <div className="flex gap-2 flex-wrap">
                {(["pro1", "pro2", "pro3", "custom"] as ProType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setProType(t); setDetails({}) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      proType === t
                        ? TYPE_META[t].color + " border-current"
                        : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Label */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">ชื่อโปรโมชั่น <span className="text-red-400">*</span></label>
              <Input
                placeholder="ตั้งชื่อโปรโมชั่น เช่น 9 ฟรี 1, ฟรีซ่อม 30,000"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Type-specific fields */}
            <div>
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">รายละเอียด</label>
              <div className="grid grid-cols-2 gap-2">
                {PROMO_FIELDS[proType].map((f) => (
                  <Input
                    key={f.key}
                    placeholder={f.placeholder}
                    value={details[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className="h-8 text-xs"
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-2 sticky bottom-0 bg-white dark:bg-zinc-900 rounded-b-2xl">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-9"
              disabled={!plate.trim() || !label.trim() || saving}
              onClick={handleSave}
            >
              {saving ? "กำลังบันทึก..." : <><Check className="w-3.5 h-3.5 mr-1.5" />บันทึกโปรโมชั่น</>}
            </Button>
            <Button variant="outline" className="h-9" onClick={onClose}>ยกเลิก</Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Inline add-form (per existing plate) ────────────────────────────────────

interface AddFormProps {
  licensePlate: string
  onSave:   (plate: string, entry: Omit<PromoEntry, "id" | "active" | "disabledReason" | "disabledAt" | "createdAt" | "updatedAt">) => Promise<void>
  onCancel: () => void
}

function AddPromoForm({ licensePlate, onSave, onCancel }: AddFormProps) {
  const [proType, setProType] = useState<ProType>("pro1")
  const [label,   setLabel]   = useState("")
  const [details, setDetails] = useState<Record<string, string>>({})
  const [saving,  setSaving]  = useState(false)

  function setField(k: string, v: string) {
    setDetails((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSave() {
    if (!label.trim()) return
    const parsedDetails: Record<string, unknown> = {}
    for (const f of PROMO_FIELDS[proType]) {
      const raw = details[f.key] ?? ""
      parsedDetails[f.key] = f.numeric ? (parseFloat(raw) || 0) : raw
    }
    setSaving(true)
    await onSave(licensePlate, { licensePlate, proType, label: label.trim(), details: parsedDetails })
    setSaving(false)
  }

  return (
    <div className="mt-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">เพิ่มโปรโมชั่น — {licensePlate}</p>

      <div className="flex gap-2 flex-wrap">
        {(["pro1", "pro2", "pro3", "custom"] as ProType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setProType(t); setDetails({}) }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              proType === t
                ? TYPE_META[t].color + " border-current"
                : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
            }`}
          >
            {TYPE_META[t].label}
          </button>
        ))}
      </div>

      <Input
        placeholder="ชื่อโปรโมชั่น (ตั้งเอง)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-8 text-xs"
      />

      <div className="grid grid-cols-2 gap-2">
        {PROMO_FIELDS[proType].map((f) => (
          <Input
            key={f.key}
            placeholder={f.placeholder}
            value={details[f.key] ?? ""}
            onChange={(e) => setField(f.key, e.target.value)}
            className="h-8 text-xs"
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" disabled={!label.trim() || saving} onClick={handleSave}>
          {saving ? "กำลังบันทึก..." : <><Check className="w-3 h-3 mr-1" />บันทึก</>}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>
          <X className="w-3 h-3 mr-1" />ยกเลิก
        </Button>
      </div>
    </div>
  )
}

// ─── Entry card ───────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry:    PromoEntry
  onToggle: (id: string, active: boolean, reason?: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function EntryCard({ entry, onToggle, onDelete }: EntryCardProps) {
  const [disabling, setDisabling] = useState(false)
  const [reason,    setReason]    = useState("")
  const [busy,      setBusy]      = useState(false)

  async function handleDisable() {
    setBusy(true)
    await onToggle(entry.id, false, reason.trim())
    setBusy(false); setDisabling(false); setReason("")
  }

  async function handleEnable() {
    setBusy(true)
    await onToggle(entry.id, true)
    setBusy(false)
  }

  async function handleDelete() {
    if (!await confirm(`ลบโปรโมชั่น "${entry.label}" ออกถาวร?`)) return
    setBusy(true); await onDelete(entry.id); setBusy(false)
  }

  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-col gap-1.5 transition-colors ${
      entry.active
        ? "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        : "border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/20 opacity-70"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <ProTypeBadge type={entry.proType} />
          <span className={`text-sm font-semibold ${entry.active ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-400 line-through"}`}>
            {entry.label}
          </span>
          {entry.active
            ? <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">ใช้งาน</span>
            : <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded-full">ระงับสิทธิ์</span>
          }
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {entry.active ? (
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-[10px] text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setDisabling(true)} disabled={busy || disabling}>
              <PowerOff className="w-3 h-3 mr-0.5" />ระงับสิทธิ์
            </Button>
          ) : (
            <Button size="sm" variant="ghost"
              className="h-6 px-2 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              onClick={handleEnable} disabled={busy}>
              <Power className="w-3 h-3 mr-0.5" />เปิด
            </Button>
          )}
          <Button size="sm" variant="ghost"
            className="h-6 px-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            onClick={handleDelete} disabled={busy}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <DetailLine entry={entry} />

      {!entry.active && entry.disabledReason && (
        <p className="text-[10px] text-red-500 dark:text-red-400 flex items-center gap-1">
          <span className="font-semibold">หมายเหตุ:</span> {entry.disabledReason}
        </p>
      )}

      {disabling && (
        <div className="mt-2 space-y-2 rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50/50 dark:bg-red-950/20 p-3">
          <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">ระงับสิทธิ์โปรโมชั่น</p>
          <Input
            autoFocus
            placeholder="หมายเหตุ / เหตุผลระงับสิทธิ์..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-8 text-xs border-red-200 dark:border-red-800 focus-visible:ring-red-400"
            onKeyDown={(e) => { if (e.key === "Enter") handleDisable() }}
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleDisable} disabled={busy || !reason.trim()}>
              {busy ? "กำลังระงับ..." : "ยืนยันระงับสิทธิ์"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setDisabling(false); setReason("") }}>
              <X className="w-3 h-3 mr-0.5" />ยกเลิก
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "disabled"

export default function PromotionsPage() {
  const [data,         setData]        = useState<GroupedData>({})
  const [vehicles,     setVehicles]    = useState<Vehicle[]>([])
  const [loading,      setLoading]     = useState(true)
  const [expanded,     setExpanded]    = useState<Set<string>>(new Set())
  const [addingTo,     setAddingTo]    = useState<string | null>(null)
  const [showModal,    setShowModal]   = useState(false)
  const [q,            setQ]           = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const [budgets, setBudgets] = useState<BudgetRow[]>([])

  const load = useCallback(async () => {
    const [entriesRes, vehiclesRes, budgetRes] = await Promise.all([
      fetch("/api/partner/promotions/entries"),
      fetch("/api/partner/vehicles"),
      fetch("/api/partner/promotions/by-plate"),
    ])
    if (entriesRes.ok) setData(await entriesRes.json())
    if (vehiclesRes.ok) setVehicles(await vehiclesRes.json())
    if (budgetRes.ok) setBudgets(await budgetRes.json())
    setLoading(false)
  }, [])

  // budget/usage lookup by normalized plate (same numbers as vehicle-cost page)
  const budgetMap = useMemo(() => {
    const m: Record<string, BudgetRow> = {}
    for (const b of budgets) m[b.plate] = b
    return m
  }, [budgets])

  useEffect(() => { load() }, [load])

  const plates = useMemo(() => {
    const set = new Set(Object.keys(data))
    // รวมรถ fleet ที่มีสัญญา/มีการใช้งบจริง แม้ยังไม่มี entry (เช่น รถที่หักโปรฯ จากหน้า ค่าใช้จ่ายรถ)
    for (const b of budgets) {
      if (b.contractCode || b.repairUsed > 0 || b.pmUsedThisYear > 0) set.add(b.licensePlate)
    }
    return [...set].sort()
  }, [data, budgets])
  const existingPlates = useMemo(() => new Set(plates), [plates])

  const filteredPlates = useMemo(() => plates.filter((plate) => {
    if (q) {
      const b = budgetMap[normPlate(plate)]
      const hay = `${plate} ${b?.driverName ?? ""} ${b?.contractCode ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    const entries = data[plate] ?? []
    if (statusFilter === "active"   && !entries.some((e) => e.active))  return false
    if (statusFilter === "disabled" && !entries.some((e) => !e.active)) return false
    return true
  }), [plates, data, q, statusFilter, budgetMap])

  const pg = usePagination(filteredPlates, 50, [q, statusFilter])

  const totalEntries    = plates.reduce((s, p) => s + (data[p] ?? []).length, 0)
  const activeEntries   = plates.reduce((s, p) => s + (data[p] ?? []).filter((e) => e.active).length, 0)
  const disabledEntries = totalEntries - activeEntries

  function toggleExpand(plate: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(plate) ? next.delete(plate) : next.add(plate)
      return next
    })
  }

  async function handleToggle(id: string, active: boolean, reason?: string) {
    await fetch(`/api/partner/promotions/entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active, disabledReason: reason ?? null }),
    })
    await load()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/partner/promotions/entries/${id}`, { method: "DELETE" })
    await load()
  }

  async function handleAdd(
    plate: string,
    entry: Omit<PromoEntry, "id" | "active" | "disabledReason" | "disabledAt" | "createdAt" | "updatedAt">
  ) {
    await fetch("/api/partner/promotions/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    })
    await load()
    setAddingTo(null)
    setShowModal(false)
    setExpanded((prev) => new Set([...prev, plate]))
  }

  // Export Excel — 2 ชีต: งบโปรฯ ต่อทะเบียน + รายการโปรฯ ทั้งหมด (lazy import xlsx กัน bundle)
  async function handleExportExcel() {
    const XLSX = await import("xlsx")
    const rows = filteredPlates.map((plate) => {
      // ต้อง normPlate ให้ตรงกับคีย์ของ budgetMap เหมือนที่หน้าจอใช้ ไม่งั้นงบซ่อม/PM ออกเป็น 0 หมด
      const b = budgetMap[normPlate(plate)]
      const entries = data[plate] ?? []
      return {
        "ทะเบียน": plate,
        "รหัสสัญญา": b?.contractCode ?? "",
        "คนขับ": b?.driverName ?? "",
        "วงเงินซ่อม": b?.repairBudget ?? 0,
        "ซ่อมใช้ไป": b?.repairUsed ?? 0,
        "ซ่อมคงเหลือ": b?.repairRemaining ?? 0,
        "เพดาน PM/ปี": b?.annualPmCap ?? 0,
        "PM ใช้ไปปีนี้": b?.pmUsedThisYear ?? 0,
        "PM คงเหลือ": b?.pmRemainingThisYear ?? 0,
        "จำนวนโปรฯ": entries.length,
        "โปรฯ ใช้งาน": entries.filter((e) => e.active).length,
        "ยอดโปรโมชั่นรวม": entries.reduce((s, e) => s + promoAmount(e), 0),
        "ยอดโปรฯ ใช้งาน": entries.filter((e) => e.active).reduce((s, e) => s + promoAmount(e), 0),
      }
    })
    const entryRows = filteredPlates.flatMap((plate) =>
      (data[plate] ?? []).map((e) => ({
        "ทะเบียน": plate,
        "ประเภท": TYPE_META[e.proType as ProType]?.label ?? e.proType,
        "ชื่อโปรโมชั่น": e.label ?? "",
        "ยอดโปรโมชั่น": promoAmount(e),
        "สถานะ": e.active ? "ใช้งาน" : "ระงับ",
        "เหตุผลที่ระงับ": e.disabledReason ?? "",
        "รายละเอียด": Object.entries(e.details ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · "),
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "งบโปรโมชั่น")
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows), "รายการโปรโมชั่น")
    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `promotions-${today}.xlsx`)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="text-xs text-zinc-400 animate-pulse">กำลังโหลดข้อมูล...</div>
    </div>
  )

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">โปรโมชั่น</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">จัดการโปรโมชั่น</h1>
          <p className="text-xs text-zinc-400 mt-0.5">สิทธิ์โปรโมชั่นต่อทะเบียนรถ — เพิ่ม / ระงับสิทธิ์ / จัดการได้ต่อคัน</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg h-9 px-3 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
            title="ดาวน์โหลดเป็น Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 gap-1.5"
            onClick={() => setShowModal(true)}
          >
            <Plus className="w-4 h-4" />เพิ่มรถ / โปรโมชั่น
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "ทะเบียนทั้งหมด",  value: `${plates.length} คัน`,       color: "text-zinc-900 dark:text-zinc-50" },
          { label: "โปรโมชั่นใช้งาน", value: `${activeEntries} รายการ`,    color: "text-emerald-600 dark:text-emerald-400" },
          { label: "ระงับสิทธิ์",      value: `${disabledEntries} รายการ`, color: disabledEntries > 0 ? "text-red-500 dark:text-red-400" : "text-zinc-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">{label}</p>
            <p className={`text-xl font-bold tabular-nums leading-none ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "active", "disabled"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === f
                ? f === "disabled" ? "bg-red-500 text-white" : f === "active" ? "bg-emerald-600 text-white" : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {{ all: "ทั้งหมด", active: "ใช้งาน", disabled: "ระงับสิทธิ์" }[f]}
            {" "}({f === "all" ? filteredPlates.length : f === "active"
              ? plates.filter((p) => (data[p] ?? []).some((e) => e.active)).length
              : plates.filter((p) => (data[p] ?? []).some((e) => !e.active)).length})
          </button>
        ))}

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="ค้นหาทะเบียน / ชื่อ พขร..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-56 text-xs pl-8"
          />
        </div>
      </div>

      {/* Plate list */}
      <div className="space-y-1.5">
        {pg.paged.map((plate) => {
          const entries      = data[plate] ?? []
          const isOpen       = expanded.has(plate)
          const isAdding     = addingTo === plate
          const activeCount  = entries.filter((e) => e.active).length
          const disabledCount = entries.filter((e) => !e.active).length
          const budget       = budgetMap[normPlate(plate)]

          return (
            <div key={plate} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors select-none"
                onClick={() => toggleExpand(plate)}
              >
                <span className="text-zinc-300 dark:text-zinc-600 shrink-0">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
                <span className="font-mono text-sm font-bold text-zinc-800 dark:text-zinc-200 w-28 shrink-0">{plate}</span>

                {budget?.driverName && (
                  <span
                    className="text-[11px] text-zinc-600 dark:text-zinc-300 truncate max-w-[150px] shrink-0 hidden sm:inline-flex items-center gap-1"
                    title={`พขร. ${budget.driverName}`}
                  >
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>{budget.driverName}
                  </span>
                )}

                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {entries.map((e) => (
                    <span
                      key={e.id}
                      title={`${e.label}${!e.active ? ` — ${e.disabledReason ?? "ปิดใช้งาน"}` : ""}`}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${
                        e.active ? TYPE_META[e.proType]?.color : "bg-zinc-100 text-zinc-400 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-600 dark:border-zinc-700"
                      }`}
                    >
                      {TYPE_META[e.proType]?.icon}
                      {e.active ? "ใช้งาน" : "ระงับ"}
                    </span>
                  ))}
                </div>

                {/* budget usage — same source of truth as vehicle-cost page */}
                {budget && (
                  <div className="hidden md:flex items-center gap-3 text-[10px] shrink-0 tabular-nums">
                    <span className={budget.repairRemaining < 0 ? "text-red-600 font-bold" : "text-zinc-500"}>
                      ซ่อม <b className={budget.repairUsed > 0 ? "text-red-500" : ""}>{fmt(budget.repairUsed)}</b>/{fmt(budget.repairBudget)}
                    </span>
                    <span className={budget.pmRemainingThisYear < 0 ? "text-red-600 font-bold" : "text-zinc-500"}>
                      PM <b className={budget.pmUsedThisYear > 0 ? "text-blue-500" : ""}>{fmt(budget.pmUsedThisYear)}</b>/{fmt(budget.annualPmCap)}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[11px] shrink-0">
                  {activeCount   > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeCount} ใช้งาน</span>}
                  {disabledCount > 0 && <span className="text-red-500 dark:text-red-400 font-semibold">{disabledCount} ปิด</span>}
                </div>

                {budget?.contractCode && (
                  <Link
                    href={`/partner/promotions/${encodeURIComponent(budget.contractCode)}`}
                    onClick={(e) => e.stopPropagation()}
                    title="ดูการใช้สิทธิ์ / บันทึกการใช้โปรโมชั่น"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 dark:border-emerald-900 rounded-lg px-2 py-1 shrink-0"
                  >
                    การใช้สิทธิ์ <ExternalLink className="w-3 h-3" />
                  </Link>
                )}

                <Button
                  size="sm" variant="ghost"
                  className="h-7 px-2 text-[10px] text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddingTo(isAdding ? null : plate)
                    setExpanded((prev) => new Set([...prev, plate]))
                  }}
                >
                  <Plus className="w-3 h-3 mr-0.5" />เพิ่ม
                </Button>
              </div>

              {(isOpen || isAdding) && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-4 pt-3 space-y-2">
                  {entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} onToggle={handleToggle} onDelete={handleDelete} />
                  ))}
                  {entries.length === 0 && (
                    <p className="text-xs text-zinc-400 text-center py-2">ยังไม่มีโปรโมชั่น</p>
                  )}
                  {isAdding && (
                    <AddPromoForm
                      licensePlate={plate}
                      onSave={handleAdd}
                      onCancel={() => setAddingTo(null)}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}

        <PaginationBar {...pg} unit="คัน" />

        {filteredPlates.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-zinc-300 dark:text-zinc-700">
            <Gift className="w-10 h-10" />
            <p className="text-sm text-zinc-400">ยังไม่มีโปรโมชั่น</p>
            <Button
              size="sm" variant="outline" className="text-xs mt-1 gap-1.5"
              onClick={() => setShowModal(true)}
            >
              <Plus className="w-3.5 h-3.5" />เพิ่มรถแรก
            </Button>
          </div>
        )}
      </div>

      {/* Add plate modal */}
      {showModal && (
        <AddPlateModal
          vehicles={vehicles}
          existingPlates={existingPlates}
          onSave={handleAdd}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
