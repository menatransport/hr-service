/* eslint-disable react-hooks/set-state-in-effect, react/no-unescaped-entities -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

/** ส่วนแชร์ของโมดูลภาษี & ประกันภัย — types / helpers / ฟอร์มรายการ / ManageDrawer
 *  ใช้ทั้งหน้า list (/insurance-tax) และหน้าจัดการรายคัน (/insurance-tax/[plate]) */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ShieldCheck, X, RefreshCw, Pencil, Upload, FileText, Trash2, PlusCircle, Layers,
  Clock, ChevronDown, ChevronUp,
} from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput, displayThaiDate } from "@/components/partner/thai-date-input"
import { formatMoney } from "@/lib/partner/utils"

// ────────────────────────── types (ตาม API /api/insurance-tax แบบ item-level) ──────────────────────────
export type Attachment = { name: string; url: string }

export type ItemType = "insurance" | "prb" | "tax" | "inspection" | "personal"
export const ITEM_TYPES: ItemType[] = ["insurance", "prb", "tax", "inspection", "personal"]

export interface Item {
  _id: string
  licensePlate: string
  platePlain?: string
  itemType: ItemType
  effectiveDate?: string        // ISO YYYY-MM-DD
  expiryDate?: string           // ISO YYYY-MM-DD
  amount?: number
  company?: string              // เฉพาะ insurance / prb
  installmentCount?: number
  monthlyInstallment?: number
  collectStart?: string         // "YYYY-MM"
  collectEnd?: string           // "YYYY-MM"
  status?: string
  attachments?: Attachment[]
  notes?: string
  migratedFrom?: string
  createdAt?: string
  updatedAt?: string
}

export type ItemStatus = "active" | "expiring" | "expired" | "none"
export type WorstStatus = ItemStatus

export interface Row {
  licensePlate: string
  platePlain?: string
  truckNumber?: string
  brand?: string
  model?: string
  driverName?: string
  contractCode?: string
  items: Record<ItemType, Item | null>
  itemStatus: Record<ItemType, ItemStatus>
  worstStatus: WorstStatus
}

export interface Counts { total: number; active: number; expiring: number; expired: number; none: number }
export const EMPTY_COUNTS: Counts = { total: 0, active: 0, expiring: 0, expired: 0, none: 0 }

// ────────────────────────── labels / colors ──────────────────────────
export const ITEM_LABEL: Record<ItemType, string> = {
  insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษีทะเบียน", inspection: "ตรวจสภาพ", personal: "ประกันภาคสมัครใจ (บุคคล)",
}
export const ITEM_COL_LABEL: Record<ItemType, string> = {
  insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษี", inspection: "ตรวจสภาพ", personal: "ป.สมัครใจ",
}
export const HAS_COMPANY: Record<ItemType, boolean> = { insurance: true, prb: true, tax: false, inspection: false, personal: true }

export const STATUS_LABEL: Record<string, string> = {
  active: "ใช้งาน", expiring: "ใกล้หมดอายุ", expired: "หมดอายุ", renewed: "ต่ออายุแล้ว", none: "ยังไม่มีข้อมูล",
}
export const STATUS_COLOR: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  expiring: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  expired:  "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  renewed:  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  none:     "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}
export const STATUS_DOT: Record<ItemStatus, string> = {
  active: "bg-emerald-500", expiring: "bg-amber-500", expired: "bg-red-500", none: "bg-zinc-300 dark:bg-zinc-600",
}
export const STATUS_TEXT: Record<ItemStatus, string> = {
  active:   "text-zinc-600 dark:text-zinc-400",
  expiring: "text-amber-600 dark:text-amber-400 font-semibold",
  expired:  "text-red-500 font-semibold",
  none:     "text-zinc-300 dark:text-zinc-600",
}

export const STATUS_TABS: { key: string; label: string }[] = [
  { key: "",         label: "ทั้งหมด" },
  { key: "active",   label: "ใช้งาน" },
  { key: "expiring", label: "ใกล้หมด" },
  { key: "expired",  label: "หมดแล้ว" },
  { key: "none",     label: "ยังไม่มีข้อมูล" },
]

export const ITEM_TABS: { key: "" | ItemType; label: string }[] = [
  { key: "", label: "ทุกรายการ" },
  ...ITEM_TYPES.map((t) => ({ key: t, label: ITEM_LABEL[t] })),
]

// ────────────────────────── helpers ──────────────────────────
export const num = (s: string): number | undefined => {
  if (s.trim() === "") return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
export const fmt = (n?: number | null) => (n || n === 0 ? formatMoney(n) : null)

/** "YYYY-MM-DD" +1 ปี (คงวัน-เดือนเดิม) */
export function plusOneYear(iso?: string): string {
  const m = /^(\d{4})-(\d{2}-\d{2})/.exec(iso || "")
  return m ? `${Number(m[1]) + 1}-${m[2]}` : ""
}
/** "YYYY-MM" +1 ปี */
export function plusOneYearMonth(ym?: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym || "")
  return m ? `${Number(m[1]) + 1}-${m[2]}` : ""
}
/** "YYYY-MM" → "ม.ค. 2569" */
export function displayThaiMonth(ym?: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym || "")
  if (!m) return "—"
  const MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[1])}/${Number(m[1]) + 543}`
}
/** ISO → "15 ก.ค. 69" (พ.ศ. 2 หลัก สำหรับ cell แคบ ๆ) */
export function shortThaiDate(iso?: string): string {
  const full = displayThaiDate(iso ?? "")
  return full.replace(/(\d{4})$/, (y) => String(Number(y) % 100).padStart(2, "0"))
}

export const EXPIRING_DAYS = 60

/** fallback client-side: คำนวณสถานะรายการจาก expiryDate (กรณี API ยังไม่ส่ง itemStatus) */
export function computeItemStatus(item: Item | null, today: string): ItemStatus {
  if (!item) return "none"
  if (!item.expiryDate) return "active"
  const exp = item.expiryDate.slice(0, 10)
  if (exp < today) return "expired"
  const limit = new Date(today + "T00:00:00Z")
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_DAYS)
  if (exp <= limit.toISOString().slice(0, 10)) return "expiring"
  return "active"
}

export const WORST_ORDER: WorstStatus[] = ["expired", "expiring", "active", "none"]
export function worstOf(statuses: ItemStatus[]): WorstStatus {
  for (const s of WORST_ORDER) if (statuses.includes(s)) return s
  return "none"
}

/** ป้องกันช่วง migration: แถวจาก API อาจไม่มี items/itemStatus/worstStatus → เติมให้ครบ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeRow(raw: any, today: string): Row {
  const items = {} as Record<ItemType, Item | null>
  const itemStatus = {} as Record<ItemType, ItemStatus>
  for (const t of ITEM_TYPES) {
    const it = raw?.items?.[t] ?? null
    items[t] = it && typeof it === "object" ? it : null
    const st = raw?.itemStatus?.[t]
    itemStatus[t] = st === "active" || st === "expiring" || st === "expired" || st === "none"
      ? st : computeItemStatus(items[t], today)
  }
  const ws = raw?.worstStatus
  const worstStatus: WorstStatus = ws === "active" || ws === "expiring" || ws === "expired" || ws === "none"
    ? ws : worstOf(ITEM_TYPES.map((t) => itemStatus[t]))
  return {
    licensePlate: raw?.licensePlate ?? "",
    platePlain: raw?.platePlain,
    truckNumber: raw?.truckNumber,
    brand: raw?.brand,
    model: raw?.model,
    driverName: raw?.driverName,
    contractCode: raw?.contractCode,
    items, itemStatus, worstStatus,
  }
}

export function sumAmounts(row: Row): number | null {
  let sum = 0, has = false
  for (const t of ITEM_TYPES) {
    const a = row.items[t]?.amount
    if (typeof a === "number") { sum += a; has = true }
  }
  return has ? sum : null
}
export function sumMonthly(row: Row): number | null {
  let sum = 0, has = false
  for (const t of ITEM_TYPES) {
    const m = row.items[t]?.monthlyInstallment
    if (typeof m === "number") { sum += m; has = true }
  }
  return has ? sum : null
}

// ────────────────────────── form state ต่อ 1 รายการ ──────────────────────────
export interface ItemFormState {
  effectiveDate: string
  expiryDate: string
  company: string
  amount: string
  installmentCount: string
  monthlyInstallment: string
  collectStart: string
  collectEnd: string
  notes: string
  attachments: Attachment[]
  monthlyTouched: boolean
}

export const EMPTY_ITEM_FORM: ItemFormState = {
  effectiveDate: "", expiryDate: "", company: "", amount: "",
  installmentCount: "", monthlyInstallment: "", collectStart: "", collectEnd: "",
  notes: "", attachments: [], monthlyTouched: false,
}

/** เตรียมค่าจากรายการเดิม — โหมดต่ออายุเลื่อนวันที่ +1 ปี (เริ่ม = วันหมดเดิม) */
export function formFromItem(it: Item | null, mode: "renew" | "edit"): ItemFormState {
  if (!it) return { ...EMPTY_ITEM_FORM }
  const s = (v?: number) => (v || v === 0 ? String(v) : "")
  if (mode === "edit") return {
    effectiveDate: it.effectiveDate?.slice(0, 10) ?? "",
    expiryDate:    it.expiryDate?.slice(0, 10) ?? "",
    company:       it.company ?? "",
    amount:        s(it.amount),
    installmentCount: s(it.installmentCount),
    monthlyInstallment: s(it.monthlyInstallment),
    collectStart: it.collectStart ?? "", collectEnd: it.collectEnd ?? "",
    notes: it.notes ?? "", attachments: it.attachments ?? [],
    monthlyTouched: !!it.monthlyInstallment,
  }
  return {
    ...EMPTY_ITEM_FORM,
    effectiveDate: it.expiryDate?.slice(0, 10) ?? "",
    expiryDate:    plusOneYear(it.expiryDate),
    company:       it.company ?? "",
    amount:        s(it.amount),
    installmentCount: s(it.installmentCount),
    collectStart: plusOneYearMonth(it.collectStart), collectEnd: plusOneYearMonth(it.collectEnd),
  }
}

export function suggestMonthly(f: ItemFormState): number | null {
  const a = num(f.amount), c = num(f.installmentCount)
  return a && a > 0 && c && c > 0 ? Math.round((a / c) * 100) / 100 : null
}

/** อัปเดต field พร้อม auto-suggest หัก/เดือน = จำนวนเงิน ÷ งวด (จนกว่าผู้ใช้จะพิมพ์เอง) */
export function applyField(f: ItemFormState, k: keyof ItemFormState, v: ItemFormState[keyof ItemFormState]): ItemFormState {
  const next = { ...f, [k]: v } as ItemFormState
  if (k === "monthlyInstallment") next.monthlyTouched = true
  if ((k === "amount" || k === "installmentCount") && !next.monthlyTouched) {
    const sug = suggestMonthly(next)
    next.monthlyInstallment = sug !== null ? String(sug) : ""
  }
  return next
}

/** payload ของ 1 รายการ (ไม่รวม licensePlate/itemType) */
export function itemPayload(f: ItemFormState) {
  return {
    effectiveDate: f.effectiveDate || undefined,
    expiryDate: f.expiryDate || undefined,
    amount: num(f.amount),
    company: f.company.trim() || undefined,
    installmentCount: num(f.installmentCount),
    monthlyInstallment: num(f.monthlyInstallment),
    collectStart: f.collectStart || undefined,
    collectEnd: f.collectEnd || undefined,
    notes: f.notes.trim() || undefined,
    attachments: f.attachments,
  }
}

export function hasAnyValue(f: ItemFormState): boolean {
  return !!(f.effectiveDate || f.expiryDate || f.company.trim() || f.amount.trim()
    || f.installmentCount.trim() || f.monthlyInstallment.trim() || f.collectStart
    || f.collectEnd || f.notes.trim() || f.attachments.length)
}

async function uploadInsuranceFile(file: File): Promise<Attachment> {
  const fd = new FormData()
  fd.append("file", file)
  fd.append("folder", "insurance")
  const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
  const { url } = await res.json()
  return { name: file.name, url }
}

// ────────────────────────── ชุด field ของ 1 รายการ (ใช้ทั้งฟอร์มเดี่ยว + bulk) ──────────────────────────
export const LABEL_CLS = "block text-[11px] font-semibold text-zinc-500 mb-1"
export const NUMBER_CLS = "h-9 text-right tabular-nums"

export function ItemFieldSet({ itemType, form, onForm }: {
  itemType: ItemType
  form: ItemFormState
  onForm: (updater: (f: ItemFormState) => ItemFormState) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const set = (k: keyof ItemFormState) => (v: string) => onForm((f) => applyField(f, k, v))
  const sug = suggestMonthly(form)
  const count = num(form.installmentCount)

  async function handleUpload(file: File) {
    setUploading(true)
    setUploadError("")
    try {
      const att = await uploadInsuranceFile(file)
      onForm((f) => ({ ...f, attachments: [...f.attachments, att] }))
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* ช่วงคุ้มครอง */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>วันเริ่ม</label>
          <ThaiDateInput value={form.effectiveDate} onChange={set("effectiveDate")} />
        </div>
        <div>
          <label className={LABEL_CLS}>วันหมดอายุ</label>
          <ThaiDateInput value={form.expiryDate} onChange={set("expiryDate")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {HAS_COMPANY[itemType] && (
          <div>
            <label className={LABEL_CLS}>บริษัท</label>
            <Input value={form.company} onChange={(e) => set("company")(e.target.value)} className="h-9" placeholder="เช่น วิริยะประกันภัย" />
          </div>
        )}
        <div className={HAS_COMPANY[itemType] ? "" : "col-span-2"}>
          <label className={LABEL_CLS}>จำนวนเงิน (บาท)</label>
          <Input
            type="number" min={0} step="0.01" inputMode="decimal"
            value={form.amount}
            onChange={(e) => set("amount")(e.target.value)}
            className={NUMBER_CLS}
            placeholder="0"
          />
        </div>
      </div>

      {/* การหักเงิน */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>จำนวนงวด</label>
          <Input
            type="number" min={0} step={1} inputMode="numeric"
            value={form.installmentCount}
            onChange={(e) => set("installmentCount")(e.target.value)}
            className={NUMBER_CLS}
          />
        </div>
        <div>
          <label className={LABEL_CLS}>หัก/เดือน (บาท)</label>
          <Input
            type="number" min={0} step="0.01" inputMode="decimal"
            value={form.monthlyInstallment}
            onChange={(e) => set("monthlyInstallment")(e.target.value)}
            className={NUMBER_CLS}
          />
          {sug !== null && num(form.monthlyInstallment) !== sug && (
            <button
              type="button"
              onClick={() => onForm((f) => ({ ...f, monthlyInstallment: String(sug), monthlyTouched: true }))}
              className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              แนะนำ ฿{formatMoney(sug)} (จำนวนเงิน ÷ {count} งวด)
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>เริ่มหัก (เดือน)</label>
          <Input type="month" value={form.collectStart} onChange={(e) => set("collectStart")(e.target.value)} className="h-9" />
        </div>
        <div>
          <label className={LABEL_CLS}>สิ้นสุดหัก (เดือน)</label>
          <Input type="month" value={form.collectEnd} onChange={(e) => set("collectEnd")(e.target.value)} className="h-9" />
        </div>
      </div>

      {/* หมายเหตุ */}
      <div>
        <label className={LABEL_CLS}>หมายเหตุ</label>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {/* ไฟล์แนบ */}
      <div>
        <label className={LABEL_CLS}>ไฟล์แนบ (กรมธรรม์ / ใบเสร็จ)</label>
        <div className="space-y-1.5">
          {form.attachments.map((a, i) => (
            <div key={`${a.url}-${i}`} className="flex items-center gap-2 text-xs bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-emerald-700 dark:text-emerald-400 hover:underline">
                {a.name || "ไฟล์แนบ"}
              </a>
              <button
                type="button"
                onClick={() => onForm((f) => ({ ...f, attachments: f.attachments.filter((_, j) => j !== i) }))}
                className="text-zinc-300 hover:text-red-500 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <label className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed cursor-pointer transition-colors ${
            uploading
              ? "border-blue-300 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:border-blue-700"
              : "border-zinc-300 dark:border-zinc-600 text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
          }`}>
            {uploading
              ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              : <Upload className="w-3 h-3" />}
            แนบไฟล์ (PDF/รูปภาพ)
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ""
              }}
            />
          </label>
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────── ฟอร์มเดี่ยว: ต่ออายุ / แก้ไข / เพิ่ม 1 รายการ ──────────────────────────
export function ItemFormPanel({ row, itemType, item, mode, onClose, onSaved }: {
  row: Row
  itemType: ItemType
  item: Item | null              // edit = รายการที่แก้ / renew = รายการเดิมไว้ prefill (null = เพิ่มใหม่)
  mode: "renew" | "edit"
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<ItemFormState>(() => formFromItem(item, mode))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    setSaving(true)
    setError("")
    try {
      const body = { licensePlate: row.licensePlate, itemType, ...itemPayload(form) }
      const res = mode === "edit" && item
        ? await fetch(`/api/partner/insurance-tax/${item._id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          })
        : await fetch("/api/partner/insurance-tax", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          })
      if (!res.ok) throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-md h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              {mode === "edit" ? <Pencil className="w-4 h-4 text-blue-500" /> : <RefreshCw className="w-4 h-4 text-emerald-500" />}
              {mode === "edit" ? `แก้ไข ${ITEM_LABEL[itemType]}` : item ? `ต่ออายุ ${ITEM_LABEL[itemType]}` : `เพิ่มข้อมูล ${ITEM_LABEL[itemType]}`}
            </div>
            <div className="text-xs text-zinc-400 font-mono">{row.licensePlate}{row.truckNumber ? ` · ${row.truckNumber}` : ""}</div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {mode === "renew" && item && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
              ระบบดึงข้อมูลจากรายการเดิมและเลื่อนวันที่ให้ +1 ปี — บันทึกแล้วรายการเดิมจะถูกปิดเป็น &quot;ต่ออายุแล้ว&quot; อัตโนมัติ
            </p>
          )}

          <ItemFieldSet itemType={itemType} form={form} onForm={(u) => setForm(u)} />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-2 pt-1 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            >
              {saving ? "กำลังบันทึก..." : mode === "edit" ? "บันทึกการแก้ไข" : "บันทึกรายการใหม่"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────── ฟอร์ม bulk: ต่ออายุทั้งชุด (ทุกรายการในฟอร์มเดียว) ──────────────────────────
export function BulkRenewPanel({ row, onClose, onSaved }: {
  row: Row
  onClose: () => void
  onSaved: () => void
}) {
  const [forms, setForms] = useState<Record<ItemType, ItemFormState>>(() => {
    const out = {} as Record<ItemType, ItemFormState>
    for (const t of ITEM_TYPES) out[t] = formFromItem(row.items[t], "renew")
    return out
  })
  const [include, setInclude] = useState<Record<ItemType, boolean>>(() => {
    const out = {} as Record<ItemType, boolean>
    for (const t of ITEM_TYPES) out[t] = !!row.items[t]
    return out
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const totalAmount = ITEM_TYPES.reduce((s, t) => s + (include[t] ? (num(forms[t].amount) ?? 0) : 0), 0)
  const totalMonthly = ITEM_TYPES.reduce((s, t) => s + (include[t] ? (num(forms[t].monthlyInstallment) ?? 0) : 0), 0)
  const included = ITEM_TYPES.filter((t) => include[t])

  async function handleSubmit() {
    const items = included
      .filter((t) => hasAnyValue(forms[t]))
      .map((t) => ({ itemType: t, ...itemPayload(forms[t]) }))
    if (items.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 รายการและกรอกข้อมูล")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/partner/insurance-tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: true, licensePlate: row.licensePlate, items }),
      })
      if (!res.ok) throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่")
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <Layers className="w-4 h-4 text-emerald-500" /> ต่ออายุทั้งชุด
            </div>
            <div className="text-xs text-zinc-400 font-mono">{row.licensePlate}{row.truckNumber ? ` · ${row.truckNumber}` : ""}</div>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
            ระบบดึงข้อมูลจากรายการปัจจุบันของแต่ละประเภทและเลื่อนวันที่ให้ +1 ปี — บันทึกครั้งเดียวทุกรายการที่เลือก
            รายการเดิมจะถูกปิดเป็น &quot;ต่ออายุแล้ว&quot; อัตโนมัติ
          </p>

          {ITEM_TYPES.map((t) => (
            <div key={t} className={`rounded-xl border p-3 transition-colors ${
              include[t]
                ? "border-emerald-200 dark:border-emerald-900"
                : "border-zinc-200 dark:border-zinc-800 opacity-60"
            }`}>
              <label className="flex items-center gap-2 cursor-pointer select-none mb-1">
                <input
                  type="checkbox"
                  checked={include[t]}
                  onChange={(e) => setInclude((p) => ({ ...p, [t]: e.target.checked }))}
                  className="accent-emerald-600"
                />
                <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{ITEM_LABEL[t]}</span>
                {!row.items[t] && <span className="text-[10px] text-zinc-400">(ยังไม่มีข้อมูลเดิม)</span>}
              </label>
              {include[t] && (
                <div className="mt-2">
                  <ItemFieldSet
                    itemType={t}
                    form={forms[t]}
                    onForm={(u) => setForms((p) => ({ ...p, [t]: u(p[t]) }))}
                  />
                </div>
              )}
            </div>
          ))}

          {/* สรุปรวม */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex items-center justify-between text-sm">
            <span className="text-xs font-semibold text-zinc-500">
              รวม {included.length} รายการ · หัก/เดือนรวม ฿{formatMoney(totalMonthly)}
            </span>
            <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">฿{formatMoney(totalAmount)}</span>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-2 pt-1 pb-6">
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
            >
              {saving ? "กำลังบันทึก..." : `บันทึกต่ออายุ ${included.length} รายการ`}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────── drawer "จัดการ" ต่อทะเบียน: 4 การ์ด + ประวัติ ──────────────────────────
export function ManageDrawer({ row, isAdmin, onClose, onChanged, fullPage = false }: {
  row: Row
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
  /** โหมดหน้าเต็ม (/insurance-tax/[plate]) — ไม่มี overlay/ปุ่มปิด */
  fullPage?: boolean
}) {
  const [history, setHistory] = useState<Item[] | null>(null)
  const [expanded, setExpanded] = useState<Record<ItemType, boolean>>({ insurance: false, prb: false, tax: false, inspection: false, personal: false })
  const [deleting, setDeleting] = useState<string | null>(null)
  const [formPanel, setFormPanel] = useState<{ itemType: ItemType; item: Item | null; mode: "renew" | "edit" } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  // convert รายการ → หนี้ผ่อนใน driver_ledger (ล้างงวดหักฝั่งนี้อัตโนมัติ กันหักซ้ำ)
  const [convertFor, setConvertFor] = useState<{ item: Item; count: string; start: string; paid: string } | null>(null)
  const [converting, setConverting] = useState(false)

  async function submitConvert() {
    if (!convertFor) return
    const count = Number(convertFor.count)
    if (!count || count < 1) { alert("ระบุจำนวนงวด"); return }
    setConverting(true)
    try {
      const res = await fetch("/api/partner/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convertFrom: { type: "insurance_item", itemId: convertFor.item._id },
          installmentCount: count,
          startMonth: convertFor.start,
          alreadyPaid: Number(convertFor.paid) > 0 ? Number(convertFor.paid) : undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error((d as { error?: string }).error ?? "สร้างหนี้ไม่สำเร็จ")
      }
      setConvertFor(null)
      loadHistory(); onChanged()
      alert("ตั้งหนี้ผ่อนเรียบร้อย — ดูได้ที่เมนู หนี้สิน & เงินสะสม")
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setConverting(false)
    }
  }

  const loadHistory = useCallback(() => {
    fetch(`/api/partner/insurance-tax?plate=${encodeURIComponent(row.licensePlate)}`)
      .then((r) => (r.ok ? r.json() : {}))
      // ป้องกันช่วง migration: shape เก่าคืน { cycles } — กรองเฉพาะ record ที่มี itemType
      .then((d: { items?: unknown; cycles?: unknown }) => {
        const arr = Array.isArray(d.items) ? d.items : Array.isArray(d.cycles) ? d.cycles : []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setHistory(arr.filter((it: any) => ITEM_TYPES.includes(it?.itemType)))
      })
      .catch(() => setHistory([]))
  }, [row.licensePlate])

  useEffect(() => { setHistory(null); loadHistory() }, [loadHistory])

  const historyByType = useMemo(() => {
    const out = { insurance: [], prb: [], tax: [], inspection: [], personal: [] } as Record<ItemType, Item[]>
    for (const it of history ?? []) out[it.itemType]?.push(it)
    return out
  }, [history])

  async function handleDelete(it: Item) {
    if (!confirm(`ลบ ${ITEM_LABEL[it.itemType]} รอบ ${displayThaiDate(it.effectiveDate ?? "") || "?"} – ${displayThaiDate(it.expiryDate ?? "") || "?"} ของ ${row.licensePlate}?`)) return
    setDeleting(it._id)
    try {
      const res = await fetch(`/api/partner/insurance-tax/${it._id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("ลบไม่สำเร็จ")
      loadHistory()
      onChanged()
    } catch (e) {
      alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally {
      setDeleting(null)
    }
  }

  const hasAnyItem = ITEM_TYPES.some((t) => !!row.items[t])

  return (
    <div
      className={fullPage ? "" : "fixed inset-0 z-[60] flex justify-end"}
      onClick={fullPage ? undefined : onClose}
    >
      {!fullPage && <div className="absolute inset-0 bg-black/30" />}
      <div
        className={fullPage
          ? "relative w-full bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          : "relative w-full max-w-2xl h-full bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto"}
        onClick={fullPage ? undefined : (e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-800 dark:text-zinc-100">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> จัดการภาษี &amp; ประกันภัย
            </div>
            <div className="text-xs text-zinc-400 truncate">
              <span className="font-mono">{row.licensePlate}</span>
              {row.truckNumber ? ` · ${row.truckNumber}` : ""}
              {row.driverName ? ` · ${row.driverName}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && hasAnyItem && (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/60 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" /> ต่ออายุทั้งชุด
              </button>
            )}
            {!fullPage && (
              <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 4 การ์ดรายการ */}
        <div className="p-4 space-y-3">
          {ITEM_TYPES.map((t) => {
            const it = row.items[t]
            const st = row.itemStatus[t]
            const hist = historyByType[t]
            const isExpanded = expanded[t]
            return (
              <div key={t} className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                {/* card header */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 bg-zinc-50/60 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[st]}`} />
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{ITEM_LABEL[t]}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${STATUS_COLOR[st]}`}>
                      {STATUS_LABEL[st]}
                    </span>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      {it && (
                        <button
                          type="button"
                          title={`แก้ไข ${ITEM_LABEL[t]}`}
                          onClick={() => setFormPanel({ itemType: t, item: it, mode: "edit" })}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500 hover:text-blue-600 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 whitespace-nowrap"
                        >
                          <Pencil className="w-3 h-3" /> แก้ไข
                        </button>
                      )}
                      <button
                        type="button"
                        title={it ? `ต่ออายุ ${ITEM_LABEL[t]}` : `เพิ่มข้อมูล ${ITEM_LABEL[t]}`}
                        onClick={() => setFormPanel({ itemType: t, item: it, mode: "renew" })}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-950/60 whitespace-nowrap"
                      >
                        {it ? <RefreshCw className="w-3 h-3" /> : <PlusCircle className="w-3 h-3" />}
                        {it ? "ต่ออายุ" : "เพิ่มข้อมูล"}
                      </button>
                      {it && !!it.amount && (
                        <button
                          type="button"
                          title="แปลงเป็นหนี้ผ่อน หักเงินเดือนผ่านระบบหนี้สิน (ยกเลิกงวดหักของรายการนี้)"
                          onClick={() => {
                            const ym = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7)
                            setConvertFor({ item: it, count: String(it.installmentCount ?? 12), start: ym, paid: "" })
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-2 py-1 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-950/60 whitespace-nowrap"
                        >
                          <Layers className="w-3 h-3" /> ตั้งหนี้ผ่อน
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* current item detail */}
                <div className="px-3.5 py-3">
                  {!it ? (
                    <p className="text-xs text-zinc-400">ยังไม่มีข้อมูล</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-zinc-500">
                      <p>ช่วงคุ้มครอง: <span className="text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {displayThaiDate(it.effectiveDate ?? "") || "—"} – {displayThaiDate(it.expiryDate ?? "") || "—"}
                      </span></p>
                      <p>จำนวนเงิน: <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        {fmt(it.amount) ? `฿${fmt(it.amount)}` : "—"}
                      </span></p>
                      {HAS_COMPANY[t] && (
                        <p>บริษัท: <span className="text-zinc-700 dark:text-zinc-300">{it.company || "—"}</span></p>
                      )}
                      <p>งวดหัก: <span className="text-zinc-700 dark:text-zinc-300 tabular-nums">
                        {it.monthlyInstallment
                          ? <>฿{formatMoney(it.monthlyInstallment)}/เดือน{it.installmentCount ? ` ×${it.installmentCount}` : ""}</>
                          : "—"}
                      </span></p>
                      {(it.collectStart || it.collectEnd) && (
                        <p className="col-span-2">ช่วงหัก: {displayThaiMonth(it.collectStart)} – {displayThaiMonth(it.collectEnd)}</p>
                      )}
                      {it.notes && <p className="col-span-2 text-zinc-400">หมายเหตุ: {it.notes}</p>}
                      {(it.attachments?.length || it.migratedFrom) ? (
                        <div className="col-span-2 flex items-center gap-1.5 flex-wrap pt-0.5">
                          {it.attachments?.map((a, i) => (
                            <a
                              key={`${a.url}-${i}`}
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/60 max-w-[160px] truncate"
                            >
                              <FileText className="w-2.5 h-2.5 shrink-0" /> {a.name || "ไฟล์แนบ"}
                            </a>
                          ))}
                          {it.migratedFrom && (
                            <span className="inline-flex items-center text-[10px] text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 rounded" title={`ย้ายข้อมูลมาจาก ${it.migratedFrom}`}>
                              migrated: {it.migratedFrom}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* ประวัติ (expandable) */}
                  <button
                    type="button"
                    onClick={() => setExpanded((p) => ({ ...p, [t]: !p[t] }))}
                    className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <Clock className="w-3 h-3" />
                    ประวัติ{history === null ? "" : ` (${hist.length})`}
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {history === null ? (
                        <p className="text-[11px] text-zinc-400">กำลังโหลด...</p>
                      ) : hist.length === 0 ? (
                        <p className="text-[11px] text-zinc-400">ยังไม่มีประวัติ</p>
                      ) : hist.map((h) => {
                        const isCurrent = it?._id === h._id
                        const hs = isCurrent ? st
                          : (h.status === "renewed" ? "renewed" : computeItemStatus(h, new Date().toISOString().slice(0, 10)))
                        return (
                          <div key={h._id} className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                                {displayThaiDate(h.effectiveDate ?? "") || "—"} – {displayThaiDate(h.expiryDate ?? "") || "—"}
                              </span>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${STATUS_COLOR[hs] ?? STATUS_COLOR.none}`}>
                                {STATUS_LABEL[hs] ?? h.status}
                              </span>
                            </div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 space-x-2">
                              {fmt(h.amount) && <span className="tabular-nums">฿{fmt(h.amount)}</span>}
                              {h.monthlyInstallment ? <span className="tabular-nums">หัก ฿{formatMoney(h.monthlyInstallment)}/เดือน{h.installmentCount ? ` ×${h.installmentCount}` : ""}</span> : null}
                              {HAS_COMPANY[t] && h.company && <span>{h.company}</span>}
                            </div>
                            {(h.attachments?.length || h.migratedFrom) ? (
                              <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                {h.attachments?.map((a, i) => (
                                  <a
                                    key={`${a.url}-${i}`}
                                    href={a.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded hover:bg-emerald-100 max-w-[140px] truncate"
                                  >
                                    <FileText className="w-2.5 h-2.5 shrink-0" /> {a.name || "ไฟล์แนบ"}
                                  </a>
                                ))}
                                {h.migratedFrom && (
                                  <span className="inline-flex items-center text-[9px] text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 rounded" title={`ย้ายข้อมูลมาจาก ${h.migratedFrom}`}>
                                    migrated: {h.migratedFrom}
                                  </span>
                                )}
                              </div>
                            ) : null}
                            {isAdmin && (
                              <div className="flex justify-end mt-1">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(h)}
                                  disabled={deleting === h._id}
                                  className="inline-flex items-center gap-1 text-[9px] text-zinc-400 hover:text-red-500 disabled:opacity-40"
                                >
                                  <Trash2 className="w-2.5 h-2.5" /> {deleting === h._id ? "กำลังลบ..." : "ลบ"}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* สรุปรวมของทะเบียน */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 flex items-center justify-between text-sm">
            <span className="text-xs font-semibold text-zinc-500">
              รวมค่าใช้จ่ายทุกรายการ
              {sumMonthly(row) !== null && <> · หัก/เดือนรวม ฿{formatMoney(sumMonthly(row)!)}</>}
            </span>
            <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {sumAmounts(row) !== null ? `฿${formatMoney(sumAmounts(row)!)}` : "—"}
            </span>
          </div>
        </div>

        {/* ฟอร์มเดี่ยว (ซ้อนบน drawer) */}
        {/* convert → driver_ledger */}
      {convertFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={() => setConvertFor(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl shadow-2xl p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
              ตั้งหนี้ผ่อน — {ITEM_LABEL[convertFor.item.itemType]} {formatMoney(convertFor.item.amount ?? 0)} บาท
            </div>
            <p className="text-[11px] text-zinc-400">
              ระบบจะสร้างหนี้ใน "หนี้สิน & เงินสะสม" และยกเลิกงวดหักของรายการนี้ (หักผ่านระบบหนี้ทางเดียว)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">จำนวนงวด (เดือน)</label>
                <Input
                  type="number" min="1"
                  value={convertFor.count}
                  onChange={(e) => setConvertFor((p) => p ? { ...p, count: e.target.value } : p)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">เริ่มหักเดือน</label>
                <input
                  type="month"
                  value={convertFor.start}
                  onChange={(e) => setConvertFor((p) => p ? { ...p, start: e.target.value } : p)}
                  className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">ผ่อนมาแล้ว (บาท) — สำหรับข้อมูลเก่าที่หักไปบางส่วนแล้ว (เว้นว่าง = ยังไม่เคยหัก)</label>
              <Input
                type="number" min="0" step="any"
                value={convertFor.paid}
                placeholder="0"
                onChange={(e) => setConvertFor((p) => p ? { ...p, paid: e.target.value } : p)}
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              หัก/เดือน ≈ {formatMoney(Math.round(((convertFor.item.amount ?? 0) / Math.max(1, Number(convertFor.count) || 1)) * 100) / 100)} บาท
              {Number(convertFor.paid) > 0 && (
                <> · คงเหลือ {formatMoney(Math.max(0, (convertFor.item.amount ?? 0) - Number(convertFor.paid)))} บาท
                (เริ่มต่อที่งวดที่ {Math.round(Number(convertFor.paid) / Math.max(0.01, (convertFor.item.amount ?? 0) / Math.max(1, Number(convertFor.count) || 1))) + 1})</>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button" disabled={converting} onClick={submitConvert}
                className="flex-1 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {converting ? "กำลังสร้าง..." : "สร้างหนี้ผ่อน"}
              </button>
              <button type="button" onClick={() => setConvertFor(null)} className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {formPanel && (
          <ItemFormPanel
            row={row}
            itemType={formPanel.itemType}
            item={formPanel.item}
            mode={formPanel.mode}
            onClose={() => setFormPanel(null)}
            onSaved={() => { setFormPanel(null); loadHistory(); onChanged() }}
          />
        )}

        {/* ฟอร์ม bulk (ซ้อนบน drawer) */}
        {bulkOpen && (
          <BulkRenewPanel
            row={row}
            onClose={() => setBulkOpen(false)}
            onSaved={() => { setBulkOpen(false); loadHistory(); onChanged() }}
          />
        )}
      </div>
    </div>
  )
}

// ────────────────────────── หน้า list หลัก ──────────────────────────