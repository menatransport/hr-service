"use client"

import React, { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { confirm } from "@/components/partner/ui/confirm"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import {
  Wrench, Settings2, Circle, Plus, Trash2, ChevronDown, ChevronRight,
  Search, X, Check, FileText, ShieldCheck, Upload, Download,
  HandCoins, ArrowRightLeft, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { DebtImport, StockImport } from "@/components/partner/excel-import"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"

// ─── Types ───────────────────────────────────────────────────────────────────

type Category    = "repair" | "maintenance" | "tire"
type PageTab     = "summarize" | "cost" | "debt" | "movement" | "merged"
type RepairType  = "repair" | "tire" | "accident" | "อื่นๆ"

interface CostEntry {
  _id:          string
  contractCode: string
  licensePlate: string
  driverName:   string
  truckNumber:  string
  date:         string
  category:     Category
  description:  string
  amount:       number
}

interface VehicleGroup {
  contractCode:     string
  licensePlate:     string
  driverName:       string
  truckNumber:      string
  repairTotal:      number
  maintenanceTotal: number
  tireTotal:        number
  total:            number
  entries:          CostEntry[]
}

interface Contract {
  contractCode: string
  licensePlate: string
  driverName:   string
  truckNumber:  string
}

interface DebtDoc {
  _id:                string
  issueDate:          string
  debtAcceptanceNo:   string
  branch:             string
  department:         string
  employeeCode:       string
  employeeName:       string
  driverStatus:       string
  vehicleType:        string
  driverAffiliation:  string
  repairOrderNo:      string
  accidentOrderNo:    string
  otherItems:         string
  repairType:         RepairType
  fullDamageAmount:   number
  depreciationPeriod: string
  depreciationAmount: number
  liabilityAmount:    number
  installmentCount:   number
  monthlyInstallment: number
  startDate:          string
  endDate:            string
  actualPayDate:      string
  totalPaid:          number
  outstandingBalance: number
  paymentMethod:      string
  description:        string
  status:             string
  paymentNotes:       string
  contractCode:       string
  licensePlate:       string
  truckNumber:        string
  ledgerDebtCode?:    string  // ถ้าถูกแปลงเป็นรายการหนี้ใน driver-ledger แล้ว
  ledgerConvertedAt?: string
}

// ─── Config ──────────────────────────────────────────────────────────────────

const CAT_CONFIG: Record<Category, { label: string; icon: React.ReactNode; color: string; bg: string; dot: string }> = {
  repair:      { label: "ค่าซ่อม",   icon: <Wrench    className="w-3.5 h-3.5" />, color: "text-red-600 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900",    dot: "bg-red-500" },
  maintenance: { label: "บำรุงรักษา", icon: <Settings2 className="w-3.5 h-3.5" />, color: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900", dot: "bg-blue-500" },
  tire:        { label: "ยาง",        icon: <Circle    className="w-3.5 h-3.5" />, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900", dot: "bg-amber-500" },
}

const REPAIR_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  repair:   { label: "ซ่อม",         color: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  tire:     { label: "ยาง",           color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  accident: { label: "อุบัติเหตุ",    color: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300" },
  "อื่นๆ":  { label: "อื่นๆ",         color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
}

const CATEGORIES: Category[] = ["repair", "maintenance", "tire"]
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString("th-TH")

function thaiDate(d: string) {
  if (!d) return "—"
  const [y, m, day] = d.slice(0, 10).split("-")
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${parseInt(y)}/${parseInt(y) + 543}`
}

// ─── Shared Components ───────────────────────────────────────────────────────

function CatBadge({ cat }: { cat: Category }) {
  const c = CAT_CONFIG[cat]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${c.color} ${c.bg}`}>
      {c.icon}{c.label}
    </span>
  )
}

function RepairBadge({ type }: { type: string }) {
  const c = REPAIR_TYPE_CONFIG[type] ?? REPAIR_TYPE_CONFIG["อื่นๆ"]
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${c.color}`}>{c.label}</span>
  )
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-48">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 text-sm"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Add Entry Modal ─────────────────────────────────────────────────────────

function AddModal({ contracts, defaultCode, onClose, onSaved }: {
  contracts:    Contract[]
  defaultCode?: string
  onClose:      () => void
  onSaved:      () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [contractCode, setContractCode] = useState(defaultCode ?? "")
  const [category,     setCategory]     = useState<Category>("repair")
  const [date,         setDate]         = useState(today)
  const [description,  setDescription]  = useState("")
  const [amount,       setAmount]       = useState("")
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState("")

  const selected = contracts.find((c) => c.contractCode === contractCode)

  async function handleSave() {
    if (!contractCode || !date || !description.trim() || !amount) {
      setError("กรุณากรอกข้อมูลให้ครบ"); return
    }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/partner/vehicle-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractCode,
          licensePlate: selected?.licensePlate ?? "",
          driverName:   selected?.driverName   ?? "",
          truckNumber:  selected?.truckNumber  ?? "",
          date, category, description: description.trim(),
          amount: parseFloat(amount.replace(/,/g, "")),
        }),
      })
      if (!res.ok) { setError("เกิดข้อผิดพลาด"); return }
      onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">เพิ่มรายการค่าใช้จ่าย</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">รหัสสัญญา / รถ</label>
          <select
            value={contractCode}
            onChange={(e) => setContractCode(e.target.value)}
            className="w-full h-10 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">— เลือกสัญญา —</option>
            {contracts.map((c) => (
              <option key={c.contractCode} value={c.contractCode}>
                {c.contractCode} · {c.licensePlate} {c.driverName ? `· ${c.driverName}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">ประเภท</label>
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => {
              const c = CAT_CONFIG[cat]
              return (
                <button
                  key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    category === cat
                      ? `${c.color} ${c.bg} border-current`
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-zinc-400"
                  }`}
                >
                  {c.icon}{c.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">วันที่</label>
            <ThaiDateInput value={date} onChange={(iso) => setDate(iso)} className="h-10 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">จำนวนเงิน (บาท)</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-sm" placeholder="0.00" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">รายละเอียด</label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-zinc-300"
            placeholder="อธิบายรายการค่าใช้จ่าย..."
          />
        </div>
        {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-10 gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? "กำลังบันทึก..." : <><Check className="w-3.5 h-3.5" />บันทึก</>}
          </Button>
          <Button variant="outline" className="h-10" onClick={onClose}>ยกเลิก</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Vehicle Cost Tab ─────────────────────────────────────────────────────────

function VehicleRow({ group, isAdmin, onAddEntry, onDeleteEntry }: {
  group:         VehicleGroup
  isAdmin:       boolean
  onAddEntry:    (code: string) => void
  onDeleteEntry: (id: string)   => void
}) {
  const [open,      setOpen]      = useState(false)
  const [activeTab, setActiveTab] = useState<Category | "all">("all")
  const visibleEntries = activeTab === "all" ? group.entries : group.entries.filter((e) => e.category === activeTab)

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{group.licensePlate || group.contractCode}</span>
            {group.truckNumber && <span className="text-xs text-zinc-400 font-mono">{group.truckNumber}</span>}
            <span className="text-xs text-zinc-400">{group.driverName}</span>
          </div>
          <p className="text-[10px] font-mono text-zinc-400 mt-0.5">{group.contractCode}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
          {group.repairTotal > 0      && <div><p className="text-[10px] text-red-400 font-medium">ซ่อม</p><p className="text-xs font-semibold text-red-600 dark:text-red-400">฿{fmt(group.repairTotal)}</p></div>}
          {group.maintenanceTotal > 0 && <div><p className="text-[10px] text-blue-400 font-medium">บำรุง</p><p className="text-xs font-semibold text-blue-600 dark:text-blue-400">฿{fmt(group.maintenanceTotal)}</p></div>}
          {group.tireTotal > 0        && <div><p className="text-[10px] text-amber-400 font-medium">ยาง</p><p className="text-xs font-semibold text-amber-600 dark:text-amber-400">฿{fmt(group.tireTotal)}</p></div>}
          <div className="pl-3 border-l border-zinc-100 dark:border-zinc-700 min-w-[80px]">
            <p className="text-[10px] text-zinc-400 font-medium">รวม</p>
            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100">฿{fmt(group.total)}</p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button" onClick={(e) => { e.stopPropagation(); onAddEntry(group.contractCode) }}
            className="ml-2 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-50 dark:border-zinc-800">
          <div className="flex items-center gap-1 px-4 py-2 bg-zinc-50/50 dark:bg-zinc-800/30">
            {(["all", ...CATEGORIES] as const).map((tab) => {
              const label = tab === "all" ? "ทั้งหมด" : CAT_CONFIG[tab].label
              const count = tab === "all" ? group.entries.length : group.entries.filter((e) => e.category === tab).length
              return (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    activeTab === tab ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-100" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {label} {count > 0 && <span className="opacity-60">({count})</span>}
                </button>
              )
            })}
            <div className="flex-1" />
            {isAdmin && (
              <button type="button" onClick={() => onAddEntry(group.contractCode)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />เพิ่มรายการ
              </button>
            )}
          </div>
          {visibleEntries.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-400">ยังไม่มีรายการ</div>
          ) : (
            <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {visibleEntries.map((entry) => (
                <div key={entry._id} className="flex items-center gap-3 px-4 py-2.5 group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20">
                  <CatBadge cat={entry.category} />
                  <span className="text-xs text-zinc-400 shrink-0 w-24">{thaiDate(entry.date)}</span>
                  <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate">{entry.description}</span>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 shrink-0">฿{fmt(entry.amount)}</span>
                  {isAdmin && (
                    <button type="button" onClick={() => onDeleteEntry(entry._id)}
                      className="w-6 h-6 flex items-center justify-center rounded text-zinc-200 hover:text-red-500 dark:text-zinc-700 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="sm:hidden flex gap-4 px-4 py-2.5 border-t border-zinc-50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
            {group.repairTotal > 0      && <span className="text-xs text-red-500">ซ่อม ฿{fmt(group.repairTotal)}</span>}
            {group.maintenanceTotal > 0 && <span className="text-xs text-blue-500">บำรุง ฿{fmt(group.maintenanceTotal)}</span>}
            {group.tireTotal > 0        && <span className="text-xs text-amber-500">ยาง ฿{fmt(group.tireTotal)}</span>}
            <span className="ml-auto text-xs font-bold text-zinc-700 dark:text-zinc-200">รวม ฿{fmt(group.total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function CostTab({ isAdmin, contracts }: { isAdmin: boolean; contracts: Contract[] }) {
  const [groups,    setGroups]    = useState<VehicleGroup[]>([])
  const [loading,   setLoading]   = useState(true)
  const [q,         setQ]         = useState("")
  const [catFilter, setCatFilter] = useState<Category | "">("")
  const [showModal, setShowModal] = useState(false)
  const [modalCode, setModalCode] = useState<string | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)         params.set("q", q)
    if (catFilter) params.set("category", catFilter)
    const res  = await fetch(`/api/partner/vehicle-cost?${params}`)
    const data = res.ok ? await res.json() : []
    setGroups(data)
    setLoading(false)
  }, [q, catFilter])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!await confirm("ลบรายการนี้ออกถาวร?")) return
    await fetch(`/api/partner/vehicle-cost/${id}`, { method: "DELETE" })
    load()
  }

  // Export Excel — แถวที่กรองอยู่ของแท็บนี้ (respect ค้นหา + ประเภท)
  async function handleExport() {
    const rows = groups.flatMap((g) =>
      g.entries.map((e) => ({
        "รหัสสัญญา":    g.contractCode,
        "ทะเบียน":     g.licensePlate,
        "เบอร์รถ":      g.truckNumber,
        "คนขับ":       g.driverName,
        "วันที่":       thaiDate(e.date),
        "ประเภท":      CAT_CONFIG[e.category]?.label ?? e.category,
        "รายละเอียด":   e.description,
        "จำนวนเงิน":    e.amount,
      })),
    )
    await exportToExcel([{ name: "ค่าซ่อม / บำรุง / ยาง", rows }], `vehicle-cost-cost-${todayStamp()}`)
  }

  const totalRepair      = groups.reduce((s, g) => s + g.repairTotal,      0)
  const totalMaintenance = groups.reduce((s, g) => s + g.maintenanceTotal, 0)
  const totalTire        = groups.reduce((s, g) => s + g.tireTotal,        0)
  const totalAll         = totalRepair + totalMaintenance + totalTire

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "รวมทั้งหมด", value: totalAll,         color: "text-zinc-800 dark:text-zinc-100" },
          { label: "ค่าซ่อม",    value: totalRepair,      color: "text-red-600 dark:text-red-400" },
          { label: "บำรุงรักษา", value: totalMaintenance, color: "text-blue-600 dark:text-blue-400" },
          { label: "ยาง",        value: totalTire,        color: "text-amber-600 dark:text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>฿{fmt(value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาสัญญา ทะเบียน คนขับ..." />
        <div className="flex gap-1.5">
          {([["", "ทั้งหมด"], ["repair", "ค่าซ่อม"], ["maintenance", "บำรุง"], ["tire", "ยาง"]] as [string, string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => setCatFilter(val as Category | "")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                catFilter === val
                  ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          title="ดาวน์โหลดเป็น Excel (.xlsx)"
        >
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
        {isAdmin && (
          <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm gap-1.5" onClick={() => { setModalCode(undefined); setShowModal(true) }}>
            <Plus className="w-3.5 h-3.5" />เพิ่มรายการ
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด...</p></div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-zinc-300 dark:text-zinc-700">
          <Wrench className="w-10 h-10" />
          <p className="text-sm text-zinc-400">ยังไม่มีรายการค่าใช้จ่าย</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="text-xs mt-1" onClick={() => { setModalCode(undefined); setShowModal(true) }}>
              <Plus className="w-3.5 h-3.5 mr-1" />เพิ่มรายการแรก
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <VehicleRow key={g.contractCode} group={g} isAdmin={isAdmin}
              onAddEntry={(code) => { setModalCode(code); setShowModal(true) }}
              onDeleteEntry={handleDelete}
            />
          ))}
        </div>
      )}

      {showModal && (
        <AddModal
          contracts={contracts} defaultCode={modalCode}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

// ─── Debt Acceptance Tab ──────────────────────────────────────────────────────

// รายละเอียดคู่ label/value ในแถวขยาย
function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-zinc-700 dark:text-zinc-200 truncate">{children ?? "—"}</p>
    </div>
  )
}

function DebtRow({ doc, onConvert }: { doc: DebtDoc; onConvert: (doc: DebtDoc) => void }) {
  const [expanded, setExpanded] = useState(false)
  const converted = !!doc.ledgerDebtCode
  const noContract = !doc.contractCode

  return (
    <>
      <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
        {/* วันที่ / เลขที่ใบ (+ ปุ่มขยาย) */}
        <td className="px-3 py-2.5 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
          <div className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-300 shrink-0" />}
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 truncate">{doc.debtAcceptanceNo}</p>
              <p className="text-[10px] text-zinc-400">{thaiDate(doc.issueDate)}</p>
            </div>
          </div>
        </td>

        {/* คนขับ */}
        <td className="px-3 py-2.5">
          <p className="text-zinc-700 dark:text-zinc-200 whitespace-nowrap">{doc.employeeName || "—"}</p>
          {doc.employeeCode && <p className="font-mono text-[10px] text-zinc-400">{doc.employeeCode}</p>}
        </td>

        {/* รถ */}
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className="font-mono text-zinc-700 dark:text-zinc-200">{doc.licensePlate || "—"}</span>
          {doc.truckNumber && <span className="ml-1.5 font-mono text-[10px] text-zinc-400">{doc.truckNumber}</span>}
        </td>

        {/* ประเภท */}
        <td className="px-3 py-2.5 whitespace-nowrap">
          <RepairBadge type={doc.repairType} />
          {doc.otherItems && <span className="ml-1 text-[10px] text-zinc-400">{doc.otherItems}</span>}
        </td>

        {/* ยอดรับผิด / คงค้าง */}
        <td className="px-3 py-2.5 text-right whitespace-nowrap">
          <p className="font-semibold text-zinc-800 dark:text-zinc-100">฿{fmt(doc.liabilityAmount)}</p>
          <p className={`text-[10px] ${(doc.outstandingBalance ?? 0) > 0 ? "text-red-500" : "text-emerald-500"}`}>
            คงค้าง ฿{fmt(doc.outstandingBalance)}
          </p>
        </td>

        {/* ผ่อน */}
        <td className="px-3 py-2.5 text-center whitespace-nowrap">
          {doc.installmentCount ? (
            <>
              <p className="text-zinc-700 dark:text-zinc-200">{doc.installmentCount} งวด</p>
              <p className="text-[10px] text-zinc-400">฿{fmt(doc.monthlyInstallment)}/ด.</p>
            </>
          ) : <span className="text-zinc-300">—</span>}
        </td>

        {/* สถานะ */}
        <td className="px-3 py-2.5 whitespace-nowrap">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            doc.status === "ค้างผ่อนชำระ" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" :
            doc.status === "ชำระครบ"       ? "bg-emerald-100 text-emerald-700" :
            "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}>{doc.status || "—"}</span>
        </td>

        {/* Action: แปลงเป็นรายการหนี้ / ลิงก์ถ้าแปลงแล้ว */}
        <td className="px-3 py-2.5 whitespace-nowrap text-right">
          {converted ? (
            <Link
              href={`/partner/driver-ledger?q=${encodeURIComponent(doc.ledgerDebtCode!)}`}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1 hover:bg-emerald-100"
              title="ดูรายการหนี้ใน driver-ledger"
            >
              <HandCoins className="w-3 h-3" /> {doc.ledgerDebtCode} <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          ) : (
            <Button
              size="sm"
              className="h-7 px-2.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1 disabled:opacity-40"
              disabled={noContract}
              title={noContract ? "ใบนี้ยังไม่ผูกสัญญา — แปลงไม่ได้" : "สร้างเป็นรายการหนี้ใน driver-ledger"}
              onClick={() => onConvert(doc)}
            >
              <ArrowRightLeft className="w-3 h-3" /> สร้างหนี้
            </Button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-zinc-50/70 dark:bg-zinc-800/40">
          <td colSpan={8} className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-3">
              <DetailItem label="สาขา">{doc.branch || "—"}</DetailItem>
              <DetailItem label="แผนกที่บันทึก">{doc.department || "—"}</DetailItem>
              <DetailItem label="สถานะ พจส./พจร.">{doc.driverStatus || "—"}</DetailItem>
              <DetailItem label="ประเภทรถ">{doc.vehicleType || "—"}</DetailItem>
              <DetailItem label="สังกัดคนขับ">{doc.driverAffiliation || "—"}</DetailItem>
              <DetailItem label="รหัสสัญญา">{doc.contractCode || "—"}</DetailItem>
              <DetailItem label="เลขแจ้งซ่อม">{doc.repairOrderNo || "—"}</DetailItem>
              <DetailItem label="เลขอุบัติเหตุ">{doc.accidentOrderNo || "—"}</DetailItem>
              <DetailItem label="ค่าเสียหายเต็ม">฿{fmt(doc.fullDamageAmount)}</DetailItem>
              <DetailItem label="ระยะเวลาเสื่อมราคา">{doc.depreciationPeriod || "—"}</DetailItem>
              <DetailItem label="ค่าเสื่อมราคา">฿{fmt(doc.depreciationAmount)}</DetailItem>
              <DetailItem label="ยอดที่ชำระแล้ว">฿{fmt(doc.totalPaid)}</DetailItem>
              <DetailItem label="วันที่เริ่มชำระ">{thaiDate(doc.startDate)}</DetailItem>
              <DetailItem label="วันที่สิ้นสุด">{thaiDate(doc.endDate)}</DetailItem>
              <DetailItem label="วันที่ชำระจริง">{doc.actualPayDate ? thaiDate(doc.actualPayDate) : "—"}</DetailItem>
              <DetailItem label="วิธีการชำระเงิน">{doc.paymentMethod || "—"}</DetailItem>
              <DetailItem label="หมายเหตุการชำระ">{doc.paymentNotes || "—"}</DetailItem>
            </div>
            {doc.description && (
              <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700">
                <p className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">หมายเหตุ</p>
                <pre className="text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">{doc.description}</pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// ─── ป๊อปอัปยืนยันแปลงใบรับสภาพหนี้ → รายการหนี้ ─────────────────────────────────
function ConvertDebtModal({ doc, onClose, onDone }: {
  doc: DebtDoc
  onClose: () => void
  onDone: (ledgerDebtCode: string) => void
}) {
  const defOutstanding = (doc.outstandingBalance ?? 0) > 0
    ? doc.outstandingBalance
    : Math.max(0, (doc.liabilityAmount ?? 0) - (doc.totalPaid ?? 0))
  const [principal,   setPrincipal]   = useState(String(defOutstanding || ""))
  const [count,       setCount]       = useState(doc.installmentCount ? String(doc.installmentCount) : "")
  const [monthly,     setMonthly]     = useState(doc.monthlyInstallment ? String(doc.monthlyInstallment) : "")
  const [startMonth,  setStartMonth]  = useState((doc.startDate || "").slice(0, 7))
  const [notes,       setNotes]       = useState("")
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState("")
  // งวดละคำนวณอัตโนมัติ = ยอดหนี้ ÷ จำนวนงวด จนกว่าผู้ใช้จะพิมพ์ทับเอง
  const [monthlyTouched, setMonthlyTouched] = useState(!!doc.monthlyInstallment)

  const num = (s: string) => parseFloat(s.replace(/,/g, "")) || 0
  const p = num(principal), c = num(count), m = num(monthly)
  const derivedMonthly = m > 0 ? m : (c > 0 ? Math.round((p / c) * 100) / 100 : 0)

  // auto-fill งวดละ เมื่อ ยอดหนี้/จำนวนงวด เปลี่ยน (ถ้ายังไม่พิมพ์ทับเอง)
  useEffect(() => {
    if (monthlyTouched) return
    if (p > 0 && c > 0) setMonthly(String(Math.round((p / c) * 100) / 100))
    else setMonthly("")
  }, [principal, count, monthlyTouched]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!(p > 0))            { setError("ยอดหนี้ต้องมากกว่า 0"); return }
    if (!(derivedMonthly > 0)) { setError("ระบุงวดละ หรือจำนวนงวด"); return }
    if (startMonth && !/^\d{4}-\d{2}$/.test(startMonth)) { setError("เดือนเริ่มต้องเป็น YYYY-MM"); return }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/partner/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convertFrom: { type: "debt_acceptance", id: doc._id },
          principal: p,
          ...(m > 0 ? { monthlyAmount: m } : {}),
          ...(c > 0 ? { installmentCount: c } : {}),
          ...(startMonth ? { startMonth } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? "แปลงไม่สำเร็จ"); return }
      onDone(j.debtCode ?? "")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">สร้างเป็นรายการหนี้</h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">จากใบ {doc.debtAcceptanceNo}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* สรุปคนขับ/รถ (อ่านอย่างเดียว) */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-3 py-2.5 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-zinc-400">คนขับ</span><span className="text-zinc-700 dark:text-zinc-200 font-medium">{doc.employeeName || "—"}</span></div>
          <div className="flex justify-between"><span className="text-zinc-400">รถ / สัญญา</span><span className="font-mono text-zinc-700 dark:text-zinc-200">{doc.licensePlate || "—"} · {doc.contractCode || "—"}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-500 mb-1">ยอดหนี้ (บาท) *</label>
            <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} className="h-10 text-sm" placeholder="ยอดคงค้าง" />
            <p className="text-[10px] text-zinc-400 mt-1">ค่าเริ่มต้น = ยอดคงค้างของใบ</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">จำนวนงวด</label>
            <Input value={count} onChange={(e) => setCount(e.target.value)} className="h-10 text-sm" placeholder="เช่น 12" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-zinc-500">งวดละ (บาท)</label>
              {monthlyTouched && (
                <button
                  type="button"
                  onClick={() => setMonthlyTouched(false)}
                  className="text-[10px] text-emerald-600 hover:underline"
                  title="คำนวณจาก ยอดหนี้ ÷ จำนวนงวด"
                >
                  คำนวณให้
                </button>
              )}
            </div>
            <Input
              value={monthly}
              onChange={(e) => { setMonthly(e.target.value); setMonthlyTouched(true) }}
              className="h-10 text-sm"
              placeholder="คำนวณอัตโนมัติ"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-500 mb-1">เริ่มหักเดือน</label>
            <Input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} className="h-10 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-500 mb-1">หมายเหตุ</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 text-sm" placeholder="(ถ้ามี)" />
          </div>
        </div>

        {derivedMonthly > 0 && p > 0 && (
          <p className="text-[11px] text-zinc-500 bg-blue-50/60 dark:bg-blue-950/20 rounded-lg px-3 py-2">
            หัก <b>฿{fmt(derivedMonthly)}</b>/เดือน · ~{Math.ceil(p / derivedMonthly)} งวด จนครบ ฿{fmt(p)}
          </p>
        )}
        {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-10 gap-1.5" disabled={saving} onClick={handleSave}>
            {saving ? "กำลังสร้าง..." : <><Check className="w-4 h-4" /> ยืนยันสร้างรายการหนี้</>}
          </Button>
          <Button variant="ghost" className="h-10" onClick={onClose}>ยกเลิก</Button>
        </div>
      </div>
    </div>
  )
}

function DebtTab() {
  const [docs,       setDocs]       = useState<DebtDoc[]>([])
  const [loading,    setLoading]    = useState(true)
  const [q,          setQ]          = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [convertDoc, setConvertDoc] = useState<DebtDoc | null>(null)
  const [toast,      setToast]      = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)          params.set("q", q)
    if (typeFilter) params.set("repairType", typeFilter)
    const res  = await fetch(`/api/partner/debt-acceptances?${params}`)
    const data = res.ok ? await res.json() : []
    setDocs(data)
    setLoading(false)
  }, [q, typeFilter])

  useEffect(() => { load() }, [load])

  const totalLiability   = docs.reduce((s, d) => s + d.liabilityAmount,    0)
  const totalOutstanding = docs.reduce((s, d) => s + d.outstandingBalance,  0)
  const convertedCount   = docs.filter((d) => d.ledgerDebtCode).length

  // Export Excel — แถวที่กรองอยู่ของแท็บนี้ (respect ค้นหา + ประเภท)
  async function handleExport() {
    const rows = docs.map((d) => ({
      "เลขที่ใบ":   d.debtAcceptanceNo,
      "วันที่":     thaiDate(d.issueDate),
      "รหัสพนง.":   d.employeeCode,
      "ชื่อ":       d.employeeName,
      "ทะเบียน":    d.licensePlate,
      "ประเภท":     REPAIR_TYPE_CONFIG[d.repairType]?.label ?? d.repairType,
      "ยอดรับผิด":  d.liabilityAmount,
      "งวด":        d.installmentCount,
      "งวดละ":      d.monthlyInstallment,
      "คงค้าง":     d.outstandingBalance,
    }))
    await exportToExcel([{ name: "ใบรับสภาพหนี้", rows }], `vehicle-cost-debt-${todayStamp()}`)
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">จำนวนใบรับสภาพหนี้</p>
          <p className="text-xl font-bold mt-1 text-zinc-800 dark:text-zinc-100">{docs.length} ใบ</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ยอดรับผิดรวม</p>
          <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">฿{fmt(totalLiability)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ยอดคงค้างรวม</p>
          <p className="text-xl font-bold mt-1 text-amber-600 dark:text-amber-400">฿{fmt(totalOutstanding)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">แปลงเป็นรายการหนี้แล้ว</p>
          <p className="text-xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{convertedCount} ใบ</p>
        </div>
      </div>

      {/* แผงนำเข้า Excel */}
      {showImport && (
        <div className="bg-zinc-50/60 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <DebtImport onImported={load} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาเลขที่ใบ รหัสพนักงาน ชื่อ ทะเบียน..." />
        <div className="flex gap-1.5">
          {([["", "ทั้งหมด"], ["repair", "ซ่อม"], ["tire", "ยาง"], ["accident", "อุบัติเหตุ"]] as [string, string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => setTypeFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                typeFilter === val
                  ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          title="ดาวน์โหลดเป็น Excel (.xlsx)"
        >
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            showImport
              ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
              : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
          }`}
        >
          <Upload className="w-3.5 h-3.5" /> {showImport ? "ปิดแผงนำเข้า" : "นำเข้า Excel"}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด...</p></div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-zinc-300 dark:text-zinc-700">
          <FileText className="w-10 h-10" />
          <p className="text-sm text-zinc-400">ยังไม่มีข้อมูลใบรับสภาพหนี้ — กด นำเข้า Excel เพื่อเพิ่มข้อมูล</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                {([
                  ["เลขที่ใบ / วันที่", "text-left"],
                  ["คนขับ", "text-left"],
                  ["รถ", "text-left"],
                  ["ประเภท", "text-left"],
                  ["ยอดรับผิด / คงค้าง", "text-right"],
                  ["ผ่อน", "text-center"],
                  ["สถานะ", "text-left"],
                  ["จัดการ", "text-right"],
                ] as [string, string][]).map(([h, align]) => (
                  <th key={h} className={`px-3 py-2.5 font-semibold text-zinc-500 whitespace-nowrap ${align}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {docs.map((doc) => (
                <DebtRow key={doc._id} doc={doc} onConvert={setConvertDoc} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ป๊อปอัปยืนยันแปลงเป็นรายการหนี้ */}
      {convertDoc && (
        <ConvertDebtModal
          doc={convertDoc}
          onClose={() => setConvertDoc(null)}
          onDone={(code) => {
            setConvertDoc(null)
            setToast(`สร้างรายการหนี้สำเร็จ${code ? ` (${code})` : ""} — เข้าดูได้ที่หน้า หนี้สิน & เงินสะสม`)
            load()
            setTimeout(() => setToast(""), 5000)
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}
    </div>
  )
}

// ─── Movement Tab (stock movements — การเคลื่อนไหวของสินค้า) ──────────────────

interface StockMovement {
  _id:          string
  date:         string
  pr:           string
  po:           string
  dd:           string
  wd:           string
  mr:           string
  supplier:     string
  apTerm:       string
  purpose:      string
  warehouse:    string
  itemName:     string
  itemCode:     string
  itemGroup:    string
  truckNumber:  string
  driverName:   string
  licensePlate: string
  serialNo:     string
  receiveQty:   number
  issueQty:     number
  unitCost:     number
  amount:       number
  maxStock:     number
  minStock:     number
  notes:        string
  subNotes:     string
  promoType?:   "" | "repair" | "pm"
  pmType?:      "" | "PM1" | "PM2"
}

function MovementRow({ m }: { m: StockMovement }) {
  const [expanded, setExpanded] = useState(false)
  // เลขเอกสารรวมเป็นบรรทัดย่อย (ไม่ตัดข้อมูลทิ้ง — ซ่อนใน title เต็ม)
  const docRefs = ([["PR", m.pr], ["PO", m.po], ["DD", m.dd]] as [string, string][])
    .filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ")
  const wdMr = [m.wd ? `WD ${m.wd}` : "", m.mr ? `MR ${m.mr}` : ""].filter(Boolean).join(" · ")
  return (
    <>
      <tr
        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer align-top"
        onClick={() => setExpanded((e) => !e)}
        title="คลิกเพื่อดูหมายเหตุเต็ม"
      >
        {/* วันที่ / เอกสาร (PR·PO·DD / WD·MR) */}
        <td className="px-2.5 py-2 whitespace-nowrap">
          <div className="text-zinc-600 dark:text-zinc-300">{thaiDate(m.date)}</div>
          {docRefs && <div className="font-mono text-[10px] text-zinc-400 truncate max-w-[150px]" title={docRefs}>{docRefs}</div>}
          {wdMr && <div className="font-mono text-[10px] text-zinc-500 truncate max-w-[150px]" title={wdMr}>{wdMr}</div>}
        </td>

        {/* ซัพพลายเออร์ / AP Term */}
        <td className="px-2.5 py-2">
          <div className="text-zinc-600 dark:text-zinc-300 truncate max-w-[140px]" title={m.supplier || ""}>{m.supplier || "—"}</div>
          {m.apTerm && <div className="text-[10px] text-zinc-400 truncate max-w-[140px]" title={m.apTerm}>AP {m.apTerm}</div>}
        </td>

        {/* จุดประสงค์ / คลัง */}
        <td className="px-2.5 py-2">
          <div className="text-zinc-600 dark:text-zinc-300 truncate max-w-[130px]" title={m.purpose || ""}>{m.purpose || "—"}</div>
          {m.warehouse && <div className="text-[10px] text-zinc-400 truncate max-w-[130px]" title={m.warehouse}>{m.warehouse}</div>}
        </td>

        {/* สินค้า / รหัส · กลุ่ม · SN */}
        <td className="px-2.5 py-2">
          <div className="text-zinc-700 dark:text-zinc-200 truncate max-w-[180px]" title={m.itemName}>{m.itemName}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {m.itemCode && <span className="font-mono text-[10px] text-zinc-400">{m.itemCode}</span>}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {m.itemGroup || "—"}
            </span>
          </div>
          {m.serialNo && <div className="font-mono text-[10px] text-zinc-400 truncate max-w-[180px]" title={m.serialNo}>SN {m.serialNo}</div>}
        </td>

        {/* รถ / คนขับ */}
        <td className="px-2.5 py-2 whitespace-nowrap">
          <div className="font-mono text-zinc-600 dark:text-zinc-300">
            {m.truckNumber || "—"}{m.licensePlate && <span className="text-zinc-400"> · {m.licensePlate}</span>}
          </div>
          {m.driverName && <div className="text-[10px] text-zinc-400 truncate max-w-[130px]" title={m.driverName}>{m.driverName}</div>}
        </td>

        {/* จ่าย / รับ · สต็อก */}
        <td className="px-2.5 py-2 text-right whitespace-nowrap tabular-nums">
          <div className="text-zinc-700 dark:text-zinc-200">{m.issueQty ? fmt(m.issueQty) : "—"}<span className="text-[10px] text-zinc-400"> จ่าย</span></div>
          {m.receiveQty ? <div className="text-[10px] text-zinc-400">รับ {fmt(m.receiveQty)}</div> : null}
          <div className="text-[10px] text-zinc-400">min {fmt(m.minStock)} · max {fmt(m.maxStock)}</div>
        </td>

        {/* ราคาทุน / ยอดเงิน */}
        <td className="px-2.5 py-2 text-right whitespace-nowrap tabular-nums">
          <div className="text-zinc-500">฿{fmt(m.unitCost)}</div>
          <div className="font-semibold text-zinc-800 dark:text-zinc-100">฿{fmt(m.amount)}</div>
        </td>

        {/* หมายเหตุ / หมายเหตุย่อย */}
        <td className="px-2.5 py-2 max-w-[200px]">
          {m.notes ? <div className="text-zinc-600 dark:text-zinc-300 truncate" title={m.notes}>{m.notes}</div> : <span className="text-zinc-300">—</span>}
          {m.subNotes && <div className="text-[10px] text-zinc-400 truncate" title={m.subNotes}>{m.subNotes}</div>}
        </td>
      </tr>
      {expanded && (m.notes || m.subNotes) && (
        <tr className="bg-zinc-50/70 dark:bg-zinc-800/40">
          <td colSpan={8} className="px-4 py-3 space-y-2">
            {m.notes && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">หมายเหตุ — {m.itemName}</p>
                <pre className="text-xs text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap font-sans leading-relaxed">{m.notes}</pre>
              </div>
            )}
            {m.subNotes && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">หมายเหตุย่อย</p>
                <pre className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{m.subNotes}</pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function MovementTab() {
  const [movements,   setMovements]   = useState<StockMovement[]>([])
  const [loading,     setLoading]     = useState(true)
  const [q,           setQ]           = useState("")
  const [groupFilter, setGroupFilter] = useState("")
  const [showImport,  setShowImport]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q)           params.set("q", q)
    if (groupFilter) params.set("group", groupFilter)
    const res  = await fetch(`/api/partner/stock-movements?${params}`)
    const data = res.ok ? await res.json() : []
    setMovements(data)
    setLoading(false)
  }, [q, groupFilter])

  useEffect(() => { load() }, [load])

  const groups = [...new Set(movements.map((m) => m.itemGroup).filter(Boolean))]
  const totalAmount = movements.reduce((s, m) => s + (m.amount ?? 0), 0)
  const totalIssue  = movements.reduce((s, m) => s + (m.issueQty ?? 0), 0)

  // Export Excel — แถวที่กรองอยู่ของแท็บนี้ (respect ค้นหา + กลุ่มสินค้า)
  async function handleExport() {
    const rows = movements.map((m) => ({
      "วันที่":   thaiDate(m.date),
      "WD":       m.wd,
      "MR":       m.mr,
      "สินค้า":   m.itemName,
      "รหัส":     m.itemCode,
      "กลุ่ม":     m.itemGroup,
      "เลขรถ":    m.truckNumber,
      "ทะเบียน":  m.licensePlate,
      "จ่าย":     m.issueQty,
      "ราคาทุน":  m.unitCost,
      "ยอดเงิน":  m.amount,
    }))
    await exportToExcel([{ name: "การเคลื่อนไหวของสินค้า", rows }], `vehicle-cost-movement-${todayStamp()}`)
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">จำนวนรายการ</p>
          <p className="text-xl font-bold mt-1 text-zinc-800 dark:text-zinc-100">{movements.length} รายการ</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">จ่ายรวม (ชิ้น)</p>
          <p className="text-xl font-bold mt-1 text-blue-600 dark:text-blue-400">{fmt(totalIssue)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ยอดเงินรวม</p>
          <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">฿{fmt(totalAmount)}</p>
        </div>
      </div>

      {/* แผงนำเข้า Excel */}
      {showImport && (
        <div className="bg-zinc-50/60 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <StockImport onImported={load} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-start">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาสินค้า รหัส เลขรถ ทะเบียน MR WD..." />
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setGroupFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              groupFilter === ""
                ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
            }`}
          >
            ทั้งหมด
          </button>
          {groups.map((g) => (
            <button key={g} onClick={() => setGroupFilter(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                groupFilter === g
                  ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          title="ดาวน์โหลดเป็น Excel (.xlsx)"
        >
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            showImport
              ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
              : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
          }`}
        >
          <Upload className="w-3.5 h-3.5" /> {showImport ? "ปิดแผงนำเข้า" : "นำเข้า Excel"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด...</p></div>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-zinc-300 dark:text-zinc-700">
          <Wrench className="w-10 h-10" />
          <p className="text-sm text-zinc-400">ยังไม่มีรายการเคลื่อนไหว</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                {([
                  ["วันที่ / เอกสาร", "text-left"],
                  ["ซัพพลายเออร์ / AP", "text-left"],
                  ["จุดประสงค์ / คลัง", "text-left"],
                  ["สินค้า / รหัส · กลุ่ม", "text-left"],
                  ["รถ / คนขับ", "text-left"],
                  ["จ่าย / รับ · สต็อก", "text-right"],
                  ["ราคาทุน / ยอดเงิน", "text-right"],
                  ["หมายเหตุ", "text-left"],
                ] as [string, string][]).map(([h, align]) => (
                  <th key={h} className={`px-2.5 py-2 font-semibold text-zinc-500 whitespace-nowrap ${align}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {movements.map((m) => (
                <MovementRow key={m._id} m={m} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


// ─── Merged Tab (ใบรับสภาพหนี้ + รายละเอียดจาก stock movements ผ่าน MR) ─────────

interface PlatePromo {
  plate:               string
  licensePlate:        string
  contractCode:        string
  repairBudget:        number
  repairUsed:          number
  repairRemaining:     number
  annualPmCap:         number
  pmUsedThisYear:      number
  pmRemainingThisYear: number
  pm1UsedThisYear:     boolean
  pm2UsedThisYear:     boolean
}

function normPlate(p: string): string {
  const m = String(p).match(/\d{2}-\d{4}/)
  return m ? m[0] : String(p).trim()
}

function BudgetBar({ used, budget, color }: { used: number; budget: number; color: string }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  return (
    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function PromoPanel({ promo, repairDeduct = 0, pmDeduct = 0 }: { promo: PlatePromo; repairDeduct?: number; pmDeduct?: number }) {
  const repairAfter = promo.repairRemaining - repairDeduct
  const pmAfter     = promo.pmRemainingThisYear - pmDeduct
  return (
    <div className="grid sm:grid-cols-2 gap-3 px-4 py-3 bg-emerald-50/40 dark:bg-emerald-950/10 border-b border-zinc-50 dark:border-zinc-800">
      {/* Repair budget */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-3.5 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
            <Wrench className="w-3.5 h-3.5" />โปรโมชั่นซ่อม
          </span>
          <span className="text-[10px] text-zinc-400">วงเงิน ฿{fmt(promo.repairBudget)}</span>
        </div>
        <BudgetBar used={promo.repairUsed + repairDeduct} budget={promo.repairBudget} color="bg-red-500" />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-zinc-400">
            ใช้ไป ฿{fmt(promo.repairUsed)}
            {repairDeduct !== 0 && (
              <span className="text-red-500 font-semibold">
                {" "}{repairDeduct > 0 ? "+ ค้างบันทึก" : "− ยกเลิก"} ฿{fmt(Math.abs(repairDeduct))}
              </span>
            )}
          </span>
          <span className={`text-xs font-bold ${repairAfter < 0 ? "text-red-600" : "text-emerald-600"}`}>คงเหลือ ฿{fmt(repairAfter)}</span>
        </div>
      </div>
      {/* PM budget */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-lg px-3.5 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <Settings2 className="w-3.5 h-3.5" />โปรโมชั่น PM (ปีนี้)
          </span>
          <div className="flex items-center gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${promo.pm1UsedThisYear ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>PM1</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${promo.pm2UsedThisYear ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>PM2</span>
            <span className="text-[10px] text-zinc-400 ml-1">วงเงิน ฿{fmt(promo.annualPmCap)}</span>
          </div>
        </div>
        <BudgetBar used={promo.pmUsedThisYear + pmDeduct} budget={promo.annualPmCap} color="bg-blue-500" />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-zinc-400">
            ใช้ไป ฿{fmt(promo.pmUsedThisYear)}
            {pmDeduct !== 0 && (
              <span className="text-blue-500 font-semibold">
                {" "}{pmDeduct > 0 ? "+ ค้างบันทึก" : "− ยกเลิก"} ฿{fmt(Math.abs(pmDeduct))}
              </span>
            )}
          </span>
          <span className={`text-xs font-bold ${pmAfter < 0 ? "text-red-600" : "text-emerald-600"}`}>คงเหลือ ฿{fmt(pmAfter)}</span>
        </div>
      </div>
    </div>
  )
}

// การเลือกต่อรายการ: โปรซ่อม หรือ โปรPM ระบุสิทธิ์ PM1/PM2 (ทำให้ป้ายสิทธิ์ติดจากคลังได้)
type PromoSel = "" | "repair" | "PM1" | "PM2"
const isPm = (s: PromoSel) => s === "PM1" || s === "PM2"
/** ค่าที่บันทึกไว้ของรายการ → PromoSel */
function savedSel(m: StockMovement): PromoSel {
  if (m.promoType === "repair") return "repair"
  if (m.promoType === "pm") return m.pmType === "PM2" ? "PM2" : "PM1"
  return ""
}

function MergedCard({ doc, movements, promo, onBulkChange }: {
  doc:           DebtDoc
  movements:     StockMovement[]
  promo?:        PlatePromo
  onBulkChange:  (updates: { id: string; promoType: "" | "repair" | "pm"; pmType: "" | "PM1" | "PM2" }[]) => Promise<void>
}) {
  const [open,        setOpen]        = useState(false)
  const [draft,       setDraft]       = useState<Record<string, PromoSel>>({})
  const [saving,      setSaving]      = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)

  // Effective selection = unsaved draft override, else saved value
  const eff = (m: StockMovement): PromoSel =>
    draft[m._id] !== undefined ? draft[m._id] : savedSel(m)

  const dirty = movements.some((m) => draft[m._id] !== undefined && draft[m._id] !== savedSel(m))

  const movementTotal = movements.reduce((s, m) => s + (m.amount ?? 0), 0)
  const diff = (doc.liabilityAmount ?? 0) - movementTotal
  const isBalanced = movements.length > 0 && Math.abs(diff) < 0.01

  // Promotion deductions from effective selections
  const repairItems  = movements.filter((m) => eff(m) === "repair")
  const pmItems      = movements.filter((m) => isPm(eff(m)))
  const repairDeduct = repairItems.reduce((s, m) => s + (m.amount ?? 0), 0)
  const pmDeduct     = pmItems.reduce((s, m) => s + (m.amount ?? 0), 0)
  const driverOwes   = movementTotal - repairDeduct - pmDeduct
  // ยอดที่บันทึกไว้แล้ว (ถูกนับรวมใน promo.repairUsed จาก API แล้ว) — ใช้หาส่วนต่างที่ยังไม่บันทึก
  // หมายเหตุ PM: เพดานเป็นรายปี — ส่วนต่างที่ฉายลงแถบ "ปีนี้" นับเฉพาะรายการปีปัจจุบัน
  const thisYear = String(new Date().getFullYear())
  const inThisYear = (m: StockMovement) => (m.date ?? "").startsWith(thisYear)
  const savedRepairTotal = movements.filter((m) => savedSel(m) === "repair").reduce((s, m) => s + (m.amount ?? 0), 0)
  const savedPmTotal     = movements.filter((m) => isPm(savedSel(m))).reduce((s, m) => s + (m.amount ?? 0), 0)
  const repairDelta = repairDeduct - savedRepairTotal
  const pmDelta =
    pmItems.filter(inThisYear).reduce((s, m) => s + (m.amount ?? 0), 0) -
    movements.filter((m) => isPm(savedSel(m)) && inThisYear(m)).reduce((s, m) => s + (m.amount ?? 0), 0)
  // ยอด PM ของปีอื่น (นับในเพดานปีของรายการนั้น ไม่ใช่แถบปีนี้)
  const pmOtherYearTotal = pmItems.filter((m) => !inThisYear(m)).reduce((s, m) => s + (m.amount ?? 0), 0)

  function togglePromo(id: string, value: PromoSel) {
    setDraft((d) => ({ ...d, [id]: value }))
  }

  // Bulk select (draft only): assign every item, in order, until the budget runs out
  // (budget = remaining + what this card already consumed, since we re-decide all items)
  // PM bulk เลือกเป็น PM1 ก่อน — เปลี่ยนรายชิ้นเป็น PM2 ได้ในตาราง
  function bulkAssign(type: "repair" | "PM1") {
    if (!promo) return
    let budget = type === "repair"
      ? promo.repairRemaining + savedRepairTotal
      : promo.pmRemainingThisYear + savedPmTotal
    const next: Record<string, PromoSel> = {}
    for (const m of movements) {
      const amt = m.amount ?? 0
      if (amt <= budget) { budget -= amt; next[m._id] = type }
      else next[m._id] = ""
    }
    setDraft(next)
  }

  function bulkClear() {
    const next: Record<string, PromoSel> = {}
    for (const m of movements) next[m._id] = ""
    setDraft(next)
  }

  async function handleSave() {
    const updates = movements
      .filter((m) => draft[m._id] !== undefined && draft[m._id] !== savedSel(m))
      .map((m) => {
        const sel = draft[m._id]
        return {
          id: m._id,
          promoType: (sel === "repair" ? "repair" : isPm(sel) ? "pm" : "") as "" | "repair" | "pm",
          pmType: (isPm(sel) ? sel : "") as "" | "PM1" | "PM2",
        }
      })
    if (updates.length === 0) return
    setSaving(true)
    try {
      await onBulkChange(updates)
      setDraft({})
    } catch {
      toast.error("บันทึกไม่สำเร็จ กรุณาลองใหม่")
    } finally {
      setSaving(false)
    }
  }

  const anySelected = repairItems.length > 0 || pmItems.length > 0

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      {/* Debt header row */}
      <button
        type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold font-mono text-zinc-800 dark:text-zinc-100">{doc.debtAcceptanceNo}</span>
            <RepairBadge type={doc.repairType} />
            <span className="text-xs text-zinc-500">{doc.employeeName}</span>
            <span className="text-xs font-mono text-zinc-400">{doc.licensePlate}{doc.truckNumber ? ` / ${doc.truckNumber}` : ""}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-zinc-400">{thaiDate(doc.issueDate)}</span>
            {doc.repairOrderNo && (
              <span className="text-[10px] font-mono text-zinc-400">MR: {doc.repairOrderNo}</span>
            )}
            <span className="text-[10px] text-zinc-400">
              {movements.length > 0 ? `${movements.length} รายการเบิก` : "ไม่พบรายการเบิก"}
            </span>
            {promo && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                <ShieldCheck className="w-3 h-3" />
                โปรฯ ซ่อมเหลือ ฿{fmt(promo.repairRemaining - repairDelta)} · PM เหลือ ฿{fmt(promo.pmRemainingThisYear - pmDelta)}
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
          <div>
            <p className="text-[10px] text-zinc-400 font-medium">ยอดเบิกรวม</p>
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              {movements.length > 0 ? `฿${fmt(movementTotal)}` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-400 font-medium">ยอดรับผิด</p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400">฿{fmt(doc.liabilityAmount)}</p>
          </div>
          <div className="pl-3 border-l border-zinc-100 dark:border-zinc-700 min-w-[70px]">
            {movements.length === 0 ? (
              <span className="text-[10px] text-zinc-300 dark:text-zinc-600">ไม่มีข้อมูลเบิก</span>
            ) : isBalanced ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                <Check className="w-3 h-3" />ยอดตรงกัน
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-amber-600">ต่าง ฿{fmt(Math.abs(diff))}</span>
            )}
          </div>
        </div>
      </button>

      {/* Movement details */}
      {open && (
        <div className="border-t border-zinc-50 dark:border-zinc-800">
          {promo && <PromoPanel promo={promo} repairDeduct={repairDelta} pmDeduct={pmDelta} />}
          {promo && pmOtherYearTotal > 0 && (
            <div className="px-4 py-1.5 text-[10px] text-blue-700 bg-blue-50/60 dark:bg-blue-950/20 border-b border-zinc-50 dark:border-zinc-800">
              ℹ รายการ PM ที่เลือกไว้ ฿{fmt(pmOtherYearTotal)} เป็นของปีก่อน — ถูกนับในเพดาน PM ของปีนั้น (ไม่แสดงในแถบ “ปีนี้”) แต่ยังหักจากยอดที่ พจร. ต้องรับผิดตามปกติ
            </div>
          )}
          {promo && movements.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50/50 dark:bg-zinc-800/30 border-b border-zinc-50 dark:border-zinc-800">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">เลือกทั้งหมด:</span>
              <button
                type="button"
                onClick={() => bulkAssign("repair")}
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                ใช้โปรซ่อมทุกรายการ (จนครบวงเงิน)
              </button>
              <button
                type="button"
                onClick={() => bulkAssign("PM1")}
                title="เลือกเป็น PM1 ทั้งหมด — เปลี่ยนรายชิ้นเป็น PM2 ได้ในตาราง"
                className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              >
                ใช้โปรPM ทุกรายการ (จนครบวงเงิน)
              </button>
              {anySelected && (
                <button
                  type="button"
                  onClick={bulkClear}
                  className="px-2.5 py-1 rounded-md text-[10px] font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  ล้างการเลือกทั้งหมด
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {dirty && (
                  <span className="text-[10px] text-amber-600 font-medium">ยังไม่ได้บันทึก</span>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${
                    dirty
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                  }`}
                >
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReceipt(true)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-bold border border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <FileText className="w-3 h-3" />ใบเสร็จ
                </button>
              </div>
            </div>
          )}
          {movements.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-zinc-400">
              ไม่พบรายการเคลื่อนไหวของสินค้าที่อ้างอิง MR {doc.repairOrderNo || "—"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-50 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
                    {([
                      ["วันที่ / WD", "text-left"],
                      ["จุดประสงค์", "text-left"],
                      ["สินค้า / รหัส · กลุ่ม", "text-left"],
                      ["จ่าย", "text-right"],
                      ["ราคาทุน", "text-right"],
                      ["ยอดเงิน", "text-right"],
                      ["โปรโมชั่น", "text-center"],
                    ] as [string, string][]).map(([h, align]) => (
                      <th key={h} className={`px-2.5 py-2 font-semibold text-zinc-500 whitespace-nowrap ${align}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
                  {movements.map((m) => {
                    const sel = eff(m)
                    return (
                      <tr key={m._id} className={`align-top hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 ${
                        sel === "repair" ? "bg-red-50/40 dark:bg-red-950/10" :
                        isPm(sel)        ? "bg-blue-50/40 dark:bg-blue-950/10" : ""
                      }`}>
                        {/* วันที่ / WD */}
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <div className="text-zinc-500">{thaiDate(m.date)}</div>
                          {m.wd && <div className="font-mono text-[10px] text-zinc-400">WD {m.wd}</div>}
                        </td>
                        {/* จุดประสงค์ */}
                        <td className="px-2.5 py-2 text-zinc-500 truncate max-w-[120px]" title={m.purpose || ""}>{m.purpose || "—"}</td>
                        {/* สินค้า / รหัส · กลุ่ม */}
                        <td className="px-2.5 py-2">
                          <div className="text-zinc-700 dark:text-zinc-200 truncate max-w-[200px]" title={m.itemName}>{m.itemName}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {m.itemCode && <span className="font-mono text-[10px] text-zinc-400">{m.itemCode}</span>}
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {m.itemGroup || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-2.5 py-2 text-right text-zinc-600 dark:text-zinc-300 whitespace-nowrap tabular-nums">{fmt(m.issueQty)}</td>
                        <td className="px-2.5 py-2 text-right text-zinc-500 whitespace-nowrap tabular-nums">฿{fmt(m.unitCost)}</td>
                        <td className="px-2.5 py-2 text-right font-semibold text-zinc-800 dark:text-zinc-100 whitespace-nowrap tabular-nums">฿{fmt(m.amount)}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => togglePromo(m._id, sel === "repair" ? "" : "repair")}
                              disabled={!promo}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                sel === "repair"
                                  ? "bg-red-500 text-white border-red-500"
                                  : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-red-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              }`}
                            >
                              โปรซ่อม
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePromo(m._id, sel === "PM1" ? "" : "PM1")}
                              disabled={!promo}
                              title="โปรPM — ใช้สิทธิ์ PM1"
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                sel === "PM1"
                                  ? "bg-blue-500 text-white border-blue-500"
                                  : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              }`}
                            >
                              PM1
                            </button>
                            <button
                              type="button"
                              onClick={() => togglePromo(m._id, sel === "PM2" ? "" : "PM2")}
                              disabled={!promo}
                              title="โปรPM — ใช้สิทธิ์ PM2"
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                sel === "PM2"
                                  ? "bg-purple-500 text-white border-purple-500"
                                  : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-purple-400 hover:text-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                              }`}
                            >
                              PM2
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-100 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/40">
                    <td colSpan={5} className="px-2.5 py-2.5 text-right font-semibold text-zinc-500">รวมยอดเบิก</td>
                    <td className="px-2.5 py-2.5 text-right font-bold text-zinc-800 dark:text-zinc-100 whitespace-nowrap tabular-nums">฿{fmt(movementTotal)}</td>
                    <td />
                  </tr>
                  {repairDeduct > 0 && (
                    <tr className="bg-red-50/50 dark:bg-red-950/10">
                      <td colSpan={5} className="px-2.5 py-2 text-right font-semibold text-red-500">หักโปรโมชั่นซ่อม ({repairItems.length} รายการ)</td>
                      <td className="px-2.5 py-2 text-right font-bold text-red-500 whitespace-nowrap tabular-nums">-฿{fmt(repairDeduct)}</td>
                      <td />
                    </tr>
                  )}
                  {pmDeduct > 0 && (
                    <tr className="bg-blue-50/50 dark:bg-blue-950/10">
                      <td colSpan={5} className="px-2.5 py-2 text-right font-semibold text-blue-500">หักโปรโมชั่น PM ({pmItems.length} รายการ)</td>
                      <td className="px-2.5 py-2 text-right font-bold text-blue-500 whitespace-nowrap tabular-nums">-฿{fmt(pmDeduct)}</td>
                      <td />
                    </tr>
                  )}
                  <tr className="bg-zinc-50/70 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-700">
                    <td colSpan={5} className="px-2.5 py-2.5 text-right font-bold text-zinc-700 dark:text-zinc-200">ยอดสุทธิที่ พจร. ต้องรับผิด</td>
                    <td className={`px-2.5 py-2.5 text-right font-bold whitespace-nowrap tabular-nums ${driverOwes > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600"}`}>
                      ฿{fmt(driverOwes)}
                    </td>
                    <td />
                  </tr>
                  <tr className="bg-zinc-50/70 dark:bg-zinc-800/40">
                    <td colSpan={5} className="px-2.5 py-2 text-right font-semibold text-zinc-500">ยอดรับผิดตามใบรับสภาพหนี้</td>
                    <td className="px-2.5 py-2 text-right font-bold text-red-600 dark:text-red-400 whitespace-nowrap tabular-nums">฿{fmt(doc.liabilityAmount)}</td>
                    <td />
                  </tr>
                  {!isBalanced && (
                    <tr className="bg-amber-50/70 dark:bg-amber-950/20">
                      <td colSpan={5} className="px-2.5 py-2 text-right font-semibold text-amber-600">ส่วนต่าง (เบิก vs ใบรับสภาพหนี้)</td>
                      <td className="px-2.5 py-2 text-right font-bold text-amber-600 whitespace-nowrap tabular-nums">฿{fmt(Math.abs(diff))}</td>
                      <td />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Receipt modal */}
      {showReceipt && (
        <ReceiptModal
          doc={doc}
          items={movements.map((m) => {
            const sel = eff(m)
            return { ...m, promoType: (sel === "repair" ? "repair" : isPm(sel) ? "pm" : "") as "" | "repair" | "pm", pmType: (isPm(sel) ? sel : "") as "" | "PM1" | "PM2" }
          })}
          movementTotal={movementTotal}
          repairDeduct={repairDeduct}
          pmDeduct={pmDeduct}
          driverOwes={driverOwes}
          promo={promo}
          repairAfter={promo ? promo.repairRemaining - repairDelta : 0}
          pmAfter={promo ? promo.pmRemainingThisYear - pmDelta : 0}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  )
}

// ─── Receipt (ใบเสร็จ / ใบสรุปรายการรับสภาพหนี้) ────────────────────────────────

function ReceiptModal({ doc, items, movementTotal, repairDeduct, pmDeduct, driverOwes, promo, repairAfter = 0, pmAfter = 0, onClose }: {
  doc:           DebtDoc
  items:         StockMovement[]
  movementTotal: number
  repairDeduct:  number
  pmDeduct:      number
  driverOwes:    number
  promo?:        PlatePromo
  repairAfter?:  number
  pmAfter?:      number
  onClose:       () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print, #receipt-print * { visibility: visible !important; }
          #receipt-print {
            position: absolute !important;
            left: 0; top: 0; width: 100%;
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm no-print" onClick={onClose} />

      <div id="receipt-print" className="relative bg-white text-zinc-900 rounded-xl shadow-2xl w-full max-w-2xl my-4 p-8 print:p-6">
        {/* Actions (hidden on print) */}
        <div className="no-print absolute top-4 right-4 flex items-center gap-2">
          <Button size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => window.print()}>
            พิมพ์ใบเสร็จ
          </Button>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-zinc-900 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg">M</div>
            <div>
              <p className="text-sm font-bold tracking-widest">MENA PARTNER</p>
              <p className="text-[11px] text-zinc-500">รถร่วม Mixer · บริการขนส่งคอนกรีต</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-bold">ใบสรุปรายการรับสภาพหนี้</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Debt Acceptance Summary</p>
          </div>
        </div>

        {/* Doc info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 py-4 text-xs border-b border-zinc-200">
          <div className="flex justify-between"><span className="text-zinc-500">เลขที่ใบรับสภาพหนี้</span><span className="font-mono font-bold">{doc.debtAcceptanceNo}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">วันที่ออกรายการ</span><span className="font-semibold">{thaiDate(doc.issueDate)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">รหัสพนักงาน</span><span className="font-mono font-semibold">{doc.employeeCode}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">ชื่อ-สกุล (พจร.)</span><span className="font-semibold">{doc.employeeName}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">ทะเบียน / เบอร์รถ</span><span className="font-mono font-semibold">{doc.licensePlate}{doc.truckNumber ? ` / ${doc.truckNumber}` : ""}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">รายการแจ้งซ่อม (MR)</span><span className="font-mono font-semibold">{doc.repairOrderNo || "—"}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">สาขา</span><span className="font-semibold">{doc.branch}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">วันที่พิมพ์</span><span className="font-semibold">{thaiDate(today)}</span></div>
        </div>

        {/* Items */}
        <table className="w-full text-xs mt-4">
          <thead>
            <tr className="border-b border-zinc-300">
              <th className="py-2 text-left font-semibold text-zinc-500 w-8">#</th>
              <th className="py-2 text-left font-semibold text-zinc-500">รายการ</th>
              <th className="py-2 text-right font-semibold text-zinc-500 w-14">จำนวน</th>
              <th className="py-2 text-right font-semibold text-zinc-500 w-20">ราคาทุน</th>
              <th className="py-2 text-right font-semibold text-zinc-500 w-24">ยอดเงิน</th>
              <th className="py-2 text-center font-semibold text-zinc-500 w-20">โปรโมชั่น</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {items.map((m, i) => (
              <tr key={m._id}>
                <td className="py-1.5 text-zinc-400">{i + 1}</td>
                <td className="py-1.5">
                  <span className="text-zinc-800">{m.itemName}</span>
                  <span className="text-zinc-400 font-mono text-[10px] ml-1.5">{m.itemCode}</span>
                </td>
                <td className="py-1.5 text-right text-zinc-600">{fmt(m.issueQty)}</td>
                <td className="py-1.5 text-right text-zinc-600">{fmt(m.unitCost)}</td>
                <td className="py-1.5 text-right font-semibold text-zinc-800">{fmt(m.amount)}</td>
                <td className="py-1.5 text-center">
                  {m.promoType === "repair" && <span className="text-[10px] font-bold text-red-600">โปรซ่อม</span>}
                  {m.promoType === "pm"     && <span className="text-[10px] font-bold text-blue-600">โปรPM</span>}
                  {!m.promoType             && <span className="text-[10px] text-zinc-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div className="mt-4 border-t-2 border-zinc-900 pt-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-500">รวมยอดเบิกทั้งสิ้น ({items.length} รายการ)</span>
            <span className="font-bold">฿{fmt(movementTotal)}</span>
          </div>
          {repairDeduct > 0 && (
            <div className="flex justify-between text-red-600">
              <span>หัก โปรโมชั่นซ่อม</span>
              <span className="font-semibold">-฿{fmt(repairDeduct)}</span>
            </div>
          )}
          {pmDeduct > 0 && (
            <div className="flex justify-between text-blue-600">
              <span>หัก โปรโมชั่น PM</span>
              <span className="font-semibold">-฿{fmt(pmDeduct)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-zinc-200 pt-2 mt-2">
            <span className="font-bold text-sm">ยอดสุทธิที่ พจร. ต้องรับผิด</span>
            <span className="font-bold text-lg">฿{fmt(driverOwes)}</span>
          </div>
          {/* แผนผ่อนอิงยอดสุทธิหลังหักโปรฯ — แผนใน record คำนวณจากยอดเต็มก่อนหัก */}
          {driverOwes <= 0 ? (
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>ไม่มียอดต้องผ่อนชำระ — โปรโมชั่นครอบคลุมเต็มจำนวน</span>
            </div>
          ) : (
            <div className="flex justify-between text-zinc-500">
              <span>
                ผ่อนชำระ {doc.installmentCount} งวด · งวดละ ฿
                {fmt(
                  repairDeduct + pmDeduct > 0 && doc.installmentCount > 0
                    ? Math.round((driverOwes / doc.installmentCount) * 100) / 100
                    : doc.monthlyInstallment
                )}
                {repairDeduct + pmDeduct > 0 && doc.installmentCount > 0 && (
                  <span className="text-[10px] text-zinc-400"> (คำนวณใหม่หลังหักโปรโมชั่น)</span>
                )}
              </span>
              <span>เริ่ม {thaiDate(doc.startDate)} — สิ้นสุด {thaiDate(doc.endDate)}</span>
            </div>
          )}
          {promo && (
            <div className="flex justify-between text-[10px] text-zinc-400 pt-1">
              <span>วงเงินโปรฯ คงเหลือหลังหัก: ซ่อม ฿{fmt(repairAfter)} · PM ฿{fmt(pmAfter)}</span>
            </div>
          )}
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-6 mt-10 text-center text-xs">
          {["ผู้จัดทำ", "พจร. (ผู้รับสภาพหนี้)", "ผู้อนุมัติ"].map((role) => (
            <div key={role}>
              <div className="border-b border-dotted border-zinc-400 h-10" />
              <p className="mt-1.5 text-zinc-600">({role})</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">วันที่ ______ / ______ / ______</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MergedTab({ initialQ = "" }: { initialQ?: string }) {
  const [debts,     setDebts]     = useState<DebtDoc[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [promos,    setPromos]    = useState<PlatePromo[]>([])
  const [loading,   setLoading]   = useState(true)
  const [q,         setQ]         = useState(initialQ)
  const [typeFilter, setTypeFilter] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/partner/debt-acceptances").then((r) => r.ok ? r.json() : []),
      fetch("/api/partner/stock-movements").then((r) => r.ok ? r.json() : []),
      fetch("/api/partner/promotions/by-plate").then((r) => r.ok ? r.json() : []),
    ]).then(([d, m, p]) => {
      setDebts(d)
      setMovements(m)
      setPromos(p)
      setLoading(false)
    })
  }, [])

  // Promo lookup by normalized plate
  const promoMap: Record<string, PlatePromo> = {}
  for (const p of promos) promoMap[p.plate] = p

  // Persist promoType + pmType selections (called from the card's บันทึก button)
  async function bulkUpdatePromo(updates: { id: string; promoType: "" | "repair" | "pm"; pmType: "" | "PM1" | "PM2" }[]) {
    if (updates.length === 0) return
    const res = await fetch("/api/partner/stock-movements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    })
    if (!res.ok) throw new Error("save failed")
    setMovements((prev) => prev.map((m) => {
      const u = updates.find((x) => x.id === m._id)
      return u ? { ...m, promoType: u.promoType, pmType: u.pmType } : m
    }))
    // refresh budgets — saved tags are now counted inside promo.repairUsed by the API
    const fresh = await fetch("/api/partner/promotions/by-plate").then((r) => (r.ok ? r.json() : null))
    if (fresh) setPromos(fresh)
  }

  // Group movements by MR
  const byMr: Record<string, StockMovement[]> = {}
  for (const m of movements) {
    if (!m.mr) continue
    if (!byMr[m.mr]) byMr[m.mr] = []
    byMr[m.mr].push(m)
  }

  const term = q.trim().toLowerCase()
  const filtered = debts.filter((d) => {
    if (typeFilter && d.repairType !== typeFilter) return false
    if (term && ![d.debtAcceptanceNo, d.employeeCode, d.employeeName, d.licensePlate, d.truckNumber, d.repairOrderNo]
      .some((v) => (v ?? "").toLowerCase().includes(term))) return false
    return true
  })

  const withDetail = filtered.filter((d) => (byMr[d.repairOrderNo] ?? []).length > 0).length

  // Export Excel — ใบรับสภาพหนี้ที่กรองอยู่ + สรุปยอดเบิก/หักโปรฯ ที่บันทึกไว้
  async function handleExport() {
    const rows = filtered.map((d) => {
      const ms = byMr[d.repairOrderNo] ?? []
      const movementTotal = ms.reduce((s, m) => s + (m.amount ?? 0), 0)
      const repairDeduct  = ms.filter((m) => savedSel(m) === "repair").reduce((s, m) => s + (m.amount ?? 0), 0)
      const pmDeduct      = ms.filter((m) => isPm(savedSel(m))).reduce((s, m) => s + (m.amount ?? 0), 0)
      return {
        "เลขที่ใบ":     d.debtAcceptanceNo,
        "วันที่":       thaiDate(d.issueDate),
        "ชื่อ":         d.employeeName,
        "ทะเบียน":      d.licensePlate,
        "เบอร์รถ":       d.truckNumber,
        "ประเภท":       REPAIR_TYPE_CONFIG[d.repairType]?.label ?? d.repairType,
        "ยอดรับผิด":    d.liabilityAmount,
        "รายการเบิก":   ms.length,
        "ยอดเบิกรวม":   movementTotal,
        "หักโปรซ่อม":   repairDeduct,
        "หักโปรPM":     pmDeduct,
        "ยอดสุทธิ":     movementTotal - repairDeduct - pmDeduct,
      }
    })
    await exportToExcel([{ name: "ใบรับสภาพหนี้ + รายละเอียด", rows }], `vehicle-cost-merged-${todayStamp()}`)
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ใบรับสภาพหนี้</p>
          <p className="text-xl font-bold mt-1 text-zinc-800 dark:text-zinc-100">{filtered.length} ใบ</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">มีรายละเอียดการเบิก</p>
          <p className="text-xl font-bold mt-1 text-emerald-600">{withDetail} <span className="text-base font-normal text-zinc-400">/ {filtered.length}</span></p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">ยอดรับผิดรวม</p>
          <p className="text-xl font-bold mt-1 text-red-600 dark:text-red-400">
            ฿{fmt(filtered.reduce((s, d) => s + (d.liabilityAmount ?? 0), 0))}
          </p>
        </div>
      </div>

      {/* Search + filter ประเภท */}
      <div className="flex flex-wrap gap-2 items-center">
        <SearchBar value={q} onChange={setQ} placeholder="ค้นหาเลขที่ใบ ชื่อพนักงาน ทะเบียน MR..." />
        <div className="flex gap-1.5">
          {([["", "ทั้งหมด"], ["repair", "ซ่อม"], ["tire", "ยาง"], ["accident", "อุบัติเหตุ"]] as [string, string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => setTypeFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                typeFilter === val
                  ? "bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          title="ดาวน์โหลดเป็น Excel (.xlsx)"
        >
          <Download className="w-3.5 h-3.5" /> Excel
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด...</p></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-zinc-300 dark:text-zinc-700">
          <FileText className="w-10 h-10" />
          <p className="text-sm text-zinc-400">ไม่พบใบรับสภาพหนี้</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <MergedCard
              key={doc._id}
              doc={doc}
              movements={byMr[doc.repairOrderNo] ?? []}
              promo={promoMap[normPlate(doc.licensePlate)]}
              onBulkChange={bulkUpdatePromo}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────


// ─── สรุปค่าซ่อมเข้างวด (payroll) — เคาะเก็บรายบรรทัด + สรุป 7 ช่อง + 8% อัตโนมัติ ───
interface SumRow {
  contractCode: string; driverName: string
  partsAmount: number; tireAmount: number; tirePatchAmount: number; laborAmount: number
  cleaningAmount: number; outsideRepairAmount: number; managementFee: number
  lines: number; charged: number; total: number; existingTotal: number; delta: number; hasExisting: boolean
}
interface SumLine {
  id: string; contractCode: string; mr: string; date: string; itemGroup: string; itemName: string
  amount: number; promoType: string; chargeAmount: number | null; chargeMonth: string | null; effective: number
}
interface SumResp {
  month: string; totals: { contracts: number; charged: number; managementFee: number; total: number; existingTotal: number }
  rows: SumRow[]; unmatched: { mr: string; item: string; amount: number; plate: string }[]
  sourceLines: number; lines: SumLine[]
}

function SummarizeTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [data, setData] = useState<SumResp | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  async function preview() {
    setBusy(true); setErr(""); setEdits({})
    try {
      const r = await fetch("/api/partner/repair-monthly/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, action: "preview" }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? "ดึงข้อมูลไม่สำเร็จ"); setData(null); return }
      setData(d)
    } finally { setBusy(false) }
  }

  async function saveLineEdits(code: string) {
    if (!data) return
    const updates = data.lines
      .filter((l) => l.contractCode === code && edits[l.id] !== undefined)
      .map((l) => ({ id: l.id, chargeAmount: edits[l.id] === "" ? null : Math.round((Number(edits[l.id]) || 0) * 100) / 100 }))
    if (!updates.length) return
    setBusy(true)
    try {
      const r = await fetch("/api/partner/stock-movements", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates }) })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "บันทึกไม่สำเร็จ"); return }
      await preview()
      setOpenCode(code)
    } finally { setBusy(false) }
  }

  async function confirmSummary() {
    if (!data) return
    if (!await confirm(`ยืนยันสรุปค่าซ่อมงวด ${month} เข้าเงินเดือน?\n${data.totals.contracts} คัน · เก็บ พขร. ${fmt(data.totals.charged)} + ดำเนินการ 8% ${fmt(data.totals.managementFee)} = ${fmt(data.totals.total)} บาท`)) return
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/partner/repair-monthly/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, action: "confirm" }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? "บันทึกไม่สำเร็จ"); return }
      toast.success(`บันทึกแล้ว ${d.upserted} คัน — payroll งวด ${month} จะใช้เลขชุดนี้`)
      await preview()
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-900">
        เบิกคลัง → เคาะยอดเก็บ พขร. รายบรรทัด (ไม่เคาะ: ติดโปร = 0, ไม่ติด = เต็มจำนวน) → ระบบรวม 7 ช่อง + ค่าดำเนินการ 8% เข้าเงินเดือนให้เอง · แทนชีต "รวมค่าซ่อม" ในไฟล์ Excel เดิม
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40 text-sm" />
        <Button onClick={preview} disabled={busy} className="h-9 bg-zinc-900 hover:bg-zinc-700 text-white">
          {busy ? "กำลังคำนวณ..." : "คำนวณสรุปงวด"}
        </Button>
        {data && data.rows.length > 0 && (
          <Button onClick={confirmSummary} disabled={busy} className="h-9 bg-blue-600 hover:bg-blue-700 text-white">
            ยืนยันเข้าเงินเดือน ({data.totals.contracts} คัน · {fmt(data.totals.total)} บ.)
          </Button>
        )}
      </div>
      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            {[["บรรทัดเบิก", String(data.sourceLines)], ["คันที่เก็บเงิน", String(data.totals.contracts)],
              ["ยอดเก็บ พขร.", fmt(data.totals.charged)], ["ดำเนินการ 8%", fmt(data.totals.managementFee)],
              ["รวมเข้างวด", fmt(data.totals.total)]].map(([l, v]) => (
              <div key={l} className="bg-white border border-zinc-100 rounded-lg py-2">
                <p className="text-[10px] text-zinc-400">{l}</p><p className="text-sm font-bold">{v}</p>
              </div>
            ))}
          </div>
          {data.unmatched.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              จับคู่สัญญาไม่ได้ {data.unmatched.length} บรรทัด (ไม่ถูกนำเข้างวด): {data.unmatched.slice(0, 5).map((u) => `${u.plate} ${u.item} ${fmt(u.amount)}`).join(" · ")}{data.unmatched.length > 5 ? " …" : ""}
            </div>
          )}
          <div className="bg-white border border-zinc-100 rounded-xl overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead><tr className="text-zinc-400 border-b border-zinc-100 bg-zinc-50">
                {["สัญญา / พขร.", "อะไหล่", "ยาง", "ปะยาง", "ค่าแรง", "ล้าง", "8%", "รวม", "ของเดิม", "Δ", ""].map((h) => (
                  <th key={h} className="text-right first:text-left py-2 px-2 font-medium">{h}</th>))}
              </tr></thead>
              <tbody className="divide-y divide-zinc-50">
                {data.rows.map((row) => (
                  <React.Fragment key={row.contractCode}>
                    <tr className="hover:bg-zinc-50 cursor-pointer" onClick={() => setOpenCode(openCode === row.contractCode ? null : row.contractCode)}>
                      <td className="py-1.5 px-2">{openCode === row.contractCode ? "▾" : "▸"} {row.contractCode} · {row.driverName}</td>
                      <td className="text-right px-2">{fmt(row.partsAmount)}</td>
                      <td className="text-right px-2">{fmt(row.tireAmount)}</td>
                      <td className="text-right px-2">{fmt(row.tirePatchAmount)}</td>
                      <td className="text-right px-2">{fmt(row.laborAmount)}</td>
                      <td className="text-right px-2">{fmt(row.cleaningAmount)}</td>
                      <td className="text-right px-2 text-zinc-400">{fmt(row.managementFee)}</td>
                      <td className="text-right px-2 font-semibold">{fmt(row.total)}</td>
                      <td className="text-right px-2 text-zinc-400">{fmt(row.existingTotal)}</td>
                      <td className={`text-right px-2 ${Math.abs(row.delta) > 0.02 ? "text-red-600" : "text-zinc-300"}`}>{fmt(row.delta)}</td>
                      <td className="px-2 text-zinc-300">{row.lines} บรรทัด</td>
                    </tr>
                    {openCode === row.contractCode && (
                      <tr><td colSpan={11} className="bg-zinc-50 px-4 py-2">
                        <table className="w-full text-[11px]">
                          <tbody>
                            {data.lines.filter((l) => l.contractCode === row.contractCode).map((l) => (
                              <tr key={l.id}>
                                <td className="py-0.5 pr-2 text-zinc-400">{l.date} · {l.mr}</td>
                                <td className="pr-2">{l.itemName} <span className="text-zinc-300">({l.itemGroup})</span>{l.promoType && <span className="ml-1 text-[9px] px-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">โปร</span>}</td>
                                <td className="text-right pr-2 text-zinc-400">{fmt(l.amount)}</td>
                                <td className="text-right w-28">
                                  <input
                                    className="w-24 h-6 text-right text-[11px] border border-zinc-200 rounded px-1"
                                    placeholder={String(l.effective)}
                                    value={edits[l.id] ?? (l.chargeAmount !== null ? String(l.chargeAmount) : "")}
                                    onChange={(e) => setEdits({ ...edits, [l.id]: e.target.value })}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="flex justify-end mt-1.5">
                          <Button size="sm" className="h-7 text-[11px]" onClick={() => saveLineEdits(row.contractCode)} disabled={busy}>
                            บันทึกยอดเก็บที่เคาะ
                          </Button>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

const PAGE_TABS: { id: PageTab; label: string }[] = [
  { id: "summarize", label: "สรุปค่าซ่อมเข้างวด" },
  { id: "debt",     label: "ใบรับสภาพหนี้" },
  { id: "movement", label: "การเคลื่อนไหวของสินค้า" },
  { id: "merged",   label: "ใบรับสภาพหนี้ + รายละเอียด" },
]

export default function VehicleCostPage() {
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")
  const [tab,       setTab]       = useState<PageTab>("summarize")
  const [contracts, setContracts] = useState<Contract[]>([])
  const [initialQ,  setInitialQ]  = useState("")

  // deep-link support: /vehicle-cost?tab=merged&q=<MR> (linked from promotions pages)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const t = sp.get("tab")
    if (t === "summarize" || t === "cost" || t === "debt" || t === "movement" || t === "merged") setTab(t)
    const q = sp.get("q")
    if (q) setInitialQ(q)
  }, [])

  useEffect(() => {
    fetch("/api/partner/contracts?status=active")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Contract[]) => setContracts(
        rows.map((c) => ({
          contractCode: c.contractCode,
          licensePlate: c.licensePlate,
          driverName:   c.driverName,
          truckNumber:  c.truckNumber,
        }))
      ))
  }, [])

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">ค่าใช้จ่ายยานพาหนะ</p>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">Vehicle Cost</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/60 p-1 rounded-xl w-fit">
        {PAGE_TABS.map(({ id, label }) => (
          <button
            key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summarize" && <SummarizeTab />}
      {tab === "cost"     && <CostTab isAdmin={isAdmin} contracts={contracts} />}
      {tab === "debt"     && <DebtTab />}
      {tab === "movement" && <MovementTab />}
      {tab === "merged"   && <MergedTab initialQ={initialQ} />}
    </div>
  )
}
