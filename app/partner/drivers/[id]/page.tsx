/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useRef, useState } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import { useParams, useRouter } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { ArrowLeft, Pencil, Trash2, User, Upload, FileText, ExternalLink, Check, X, Phone, Landmark, AlertTriangle, CheckCircle2, Truck, IdCard, UserMinus, RotateCw } from "lucide-react"
import type { DriverPhotoField } from "@/lib/partner/driver-photo"
import { ActivityHistory } from "@/components/partner/activity-history"
import { DriverExitDialog } from "@/components/partner/driver-exit-dialog"
import { EXIT_TYPE_LABEL } from "@/lib/partner/driver-state"
import Link from "next/link"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { ThaiAddressFields } from "@/components/partner/thai-address-fields"
import { composeThaiAddress } from "@/lib/partner/thai-address"
import type { Contract, Driver } from "@/lib/partner/types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

function formatThaiDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "—"
  return `${d.getDate()} ${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]} ${d.getFullYear()}/${d.getFullYear() + 543}`
}

const AVATAR_BG = [
  "bg-emerald-500","bg-blue-500","bg-violet-500",
  "bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-teal-500",
]
function avatarColor(name: string) {
  const code = (name ?? " ").charCodeAt(0)
  return AVATAR_BG[code % AVATAR_BG.length]
}

const LICENSE_TYPE_LABEL: Record<string, string> = {
  "ท.1": "รถยนต์ส่วนบุคคล",
  "ท.2": "รถยนต์สาธารณะ",
  "ท.3": "รถยนต์ขนส่ง",
  "ท.4": "รถยนต์บรรทุกส่วนบุคคล",
  "ท.5": "รถยนต์สามล้อ",
}

// ─── Edit form state ──────────────────────────────────────────────────────────

interface DriverForm {
  prefix:        string
  firstName:     string
  lastName:      string
  birthDate:     string
  nationalId:    string
  address:       string
  addressDetail: string
  subdistrict:   string
  district:      string
  province:      string
  postalCode:    string
  staffCode:     string
  contractCode:  string
  phone:         string
  bankName:      string
  accountNumber: string
  idCardUrl:     string
  licenseUrl:    string
  houseRegUrl:   string
  bankBookUrl:   string
  tax50BisUrl:   string
  photoUrl:      string
  licenseNumber: string
  licenseType:   string
  licenseExpiry: string
  isTruckOwner:  boolean
  isDriver:      boolean
  startDate:     string
  endDate:       string
  status:        "active" | "inactive"
  workHistory:   WH[]
}

// ประวัติการทำงาน 1 ช่วง (เช่น เคยเป็น พจส. 1 ม.ค. 63 – 31 ธ.ค. 65)
type WH = { role: string; from: string; to: string; note: string }

function toForm(d: Driver): DriverForm {
  return {
    prefix:        d.prefix        ?? "นาย",
    firstName:     d.firstName     ?? "",
    lastName:      d.lastName      ?? "",
    birthDate:     d.birthDate     ?? "",
    nationalId:    d.nationalId    ?? "",
    address:       d.address       ?? "",
    addressDetail: d.addressDetail ?? "",
    subdistrict:   d.subdistrict   ?? "",
    district:      d.district      ?? "",
    province:      d.province      ?? "",
    postalCode:    d.postalCode    ?? "",
    staffCode:     d.staffCode     ?? "",
    contractCode:  d.contractCode  ?? "",
    phone:         d.phone         ?? "",
    bankName:      d.bankName      ?? "",
    accountNumber: d.accountNumber ?? "",
    idCardUrl:     d.idCardUrl     ?? "",
    licenseUrl:    d.licenseUrl    ?? "",
    houseRegUrl:   d.houseRegUrl   ?? "",
    bankBookUrl:   d.bankBookUrl   ?? "",
    tax50BisUrl:   d.tax50BisUrl   ?? "",
    photoUrl:      d.photoUrl      ?? "",
    licenseNumber: d.licenseNumber ?? "",
    licenseType:   d.licenseType   ?? "",
    licenseExpiry: d.licenseExpiry ?? "",
    isTruckOwner:  d.isTruckOwner  ?? false,
    isDriver:      d.isDriver      ?? true,
    startDate:     d.startDate     ?? "",
    endDate:       d.endDate       ?? "",
    status:        d.status        ?? "active",
    workHistory:   (d.workHistory ?? []).map((w) => ({
      role: w.role ?? "", from: w.from ?? "", to: w.to ?? "", note: w.note ?? "",
    })),
  }
}

// ─── Display building blocks ──────────────────────────────────────────────────

function Card({ title, action, children, className = "" }: {
  title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{title}</span>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, value, mono = false, className = "" }: {
  label: string; value?: React.ReactNode; mono?: boolean; className?: string
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm text-zinc-800 dark:text-zinc-200 ${mono ? "font-mono tracking-wide" : ""}`}>
        {value || <span className="text-zinc-300 dark:text-zinc-600">—</span>}
      </div>
    </div>
  )
}

function EditField({ label, hint, className = "", children }: {
  label: string; hint?: string; className?: string; children: React.ReactNode
}) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1">{label}</div>
      {children}
      {hint && <p className="text-[10px] text-zinc-400 mt-1">{hint}</p>}
    </div>
  )
}

function DocThumb({ url, label, editing = false, busy = false, rotating = false, onUpload, onRemove, onRotate }: {
  url?: string
  label: string
  editing?: boolean
  busy?: boolean
  rotating?: boolean
  onUpload?: (file: File) => void
  onRemove?: () => void
  /** หมุนรูป 90° ตามเข็มแล้วเซฟถาวร — ไม่ส่งมา = ไม่มีปุ่ม (PDF / รูปที่ยังไม่ได้บันทึก) */
  onRotate?: () => void
}) {
  if (!url) {
    if (editing) return (
      <label className={`rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 min-h-[7.5rem] cursor-pointer transition-colors
        ${busy
          ? "border-blue-300 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-700"
          : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
        }`}>
        {busy ? (
          <>
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] font-medium text-blue-600">กำลังอัปโหลด...</span>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5" />
            <span className="text-[11px] font-medium">แนบ{label}</span>
            <span className="text-[10px] text-zinc-300 dark:text-zinc-600">PDF / รูปภาพ</span>
          </>
        )}
        <input
          type="file" accept="image/*,.pdf" className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload?.(f); e.target.value = "" }}
        />
      </label>
    )
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center gap-1 text-zinc-300 dark:text-zinc-700 min-h-[7.5rem]">
        <FileText className="w-6 h-6" />
        <span className="text-[11px] font-medium">{label}</span>
        <span className="text-[10px]">ยังไม่ได้แนบ</span>
      </div>
    )
  }
  const isPdf = /\.pdf($|\?)/i.test(url)
  return (
    <div className="group relative rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden hover:border-emerald-400 hover:shadow-sm transition-all">
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <div className="h-24 bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden">
          {isPdf ? (
            <div className="flex flex-col items-center gap-1 text-red-400">
              <FileText className="w-8 h-8" />
              <span className="text-[10px] font-bold">PDF</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          )}
        </div>
        <div className="px-3 py-2 flex items-center justify-between bg-white dark:bg-zinc-900">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
          <ExternalLink className="w-3 h-3 text-zinc-300 group-hover:text-emerald-500" />
        </div>
      </a>
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          title={`ลบไฟล์${label}`}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:border-red-300 shadow-sm"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {!isPdf && onRotate && (
        <button
          type="button"
          onClick={onRotate}
          disabled={rotating}
          title={`หมุน${label} 90° (บันทึกทันที)`}
          className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 shadow-sm disabled:opacity-60"
        >
          {rotating
            ? <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            : <RotateCw className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DriverDetailPage() {
  const { id }     = useParams<{ id: string }>()
  const router     = useRouter()
  const { data: session } = usePartnerSession()
  const isAdmin    = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  const [driver, setDriver]     = useState<Driver | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [editing, setEditing]   = useState(false)
  const [showExit, setShowExit] = useState(false)
  const [form, setForm]         = useState<DriverForm | null>(null)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState("")
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [rotatingDoc, setRotatingDoc] = useState<string | null>(null)
  // error ของฟอร์มโชว์เฉพาะในแถบบันทึก (โหมดแก้ไข) — การหมุนรูปทำได้ในโหมดดูด้วย จึงต้องมีที่แจ้งของตัวเอง
  const [rotateError, setRotateError] = useState("")

  useEffect(() => {
    fetch(`/api/partner/drivers/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then(setDriver)
  }, [id])

  const reload = () =>
    fetch(`/api/partner/drivers/${id}`).then((r) => (r.ok ? r.json() : null)).then(setDriver)

  // สัญญาที่ผูกกับพนักงานคนนี้ (ผ่าน contractCode ที่ sync มาจากสัญญา)
  const contractCode = driver?.contractCode
  useEffect(() => {
    if (!contractCode) { setContract(null); return }
    fetch(`/api/partner/contracts?q=${encodeURIComponent(contractCode)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((list: Contract[]) =>
        setContract(list.find((c) => c.contractCode === contractCode) ?? list[0] ?? null))
  }, [contractCode])

  function startEdit() {
    if (!driver) return
    setForm(toForm(driver))
    setError("")
    setEditing(true)
  }

  // มาจากปุ่ม "แก้ไข" ในหน้ารายชื่อ (?edit=1) → เข้าโหมดแก้ไขให้เลย ไม่ต้องกดซ้ำ
  const autoEdited = useRef(false)
  useEffect(() => {
    if (autoEdited.current || !driver || !isAdmin) return
    if (new URLSearchParams(window.location.search).get("edit") !== "1") return
    autoEdited.current = true
    startEdit()
    window.history.replaceState(null, "", `/partner/drivers/${id}`)   // ล้าง query กัน refresh แล้วเข้าโหมดแก้ไขซ้ำ
  }, [driver, isAdmin, id])   // eslint-disable-line react-hooks/exhaustive-deps

  function cancelEdit() {
    setEditing(false)
    setForm(null)
    setError("")
  }

  function set<K extends keyof DriverForm>(k: K, v: DriverForm[K]) {
    setForm((p) => p ? { ...p, [k]: v } : p)
  }

  // หมุนรูป 90° ตามเข็ม — เซิร์ฟเวอร์เขียนไฟล์ใหม่ + อัปเดตฐานทันที (ไม่ผูกกับปุ่มบันทึกของฟอร์ม)
  async function rotatePhoto(field: DriverPhotoField) {
    setRotatingDoc(field); setRotateError("")
    try {
      const res = await fetch(`/api/partner/drivers/${id}/rotate-photo`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, deg: 90 }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error ?? "หมุนรูปไม่สำเร็จ")
      setDriver((prev) => prev ? { ...prev, [field]: d.url } : prev)
      setForm((prev) => prev ? { ...prev, [field]: d.url } : prev)
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : "หมุนรูปไม่สำเร็จ")
    } finally {
      setRotatingDoc(null)
    }
  }

  async function uploadDoc(field: "idCardUrl" | "licenseUrl" | "houseRegUrl" | "bankBookUrl" | "tax50BisUrl" | "photoUrl", file: File) {
    setUploadingDoc(field); setError("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "drivers")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
      const { url } = await res.json()
      set(field, url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไฟล์ไม่สำเร็จ")
    } finally {
      setUploadingDoc(null)
    }
  }

  async function handleSave() {
    if (!form) return
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("กรุณากรอกชื่อและนามสกุล"); return
    }
    setSaving(true); setError("")
    try {
      // ประกอบที่อยู่เต็มจาก field ย่อย (ถ้ายังไม่กรอกใหม่ ให้คงที่อยู่เดิมไว้)
      const composed = composeThaiAddress(form)
      const payload = { ...form, address: composed || form.address }
      const res = await fetch(`/api/partner/drivers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { setError("เกิดข้อผิดพลาดในการบันทึก"); return }
      setDriver(await res.json())
      setEditing(false)
      setForm(null)
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!driver) return
    const fullName = `${driver.prefix ?? ""} ${driver.firstName} ${driver.lastName}`.trim()
    if (!await confirm(`ลบข้อมูล "${fullName}" ออกถาวร?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/partner/drivers/${id}`, { method: "DELETE" })
      router.push("/partner/drivers")
    } finally { setDeleting(false) }
  }

  if (!driver) return (
    <div className="flex items-center justify-center h-48">
      <p className="text-xs text-zinc-400 animate-pulse">กำลังโหลด...</p>
    </div>
  )

  // ── view model: ระหว่างแก้ไขให้ทุกส่วน (ชื่อ, checklist, badge) อัปเดตสดจากฟอร์ม ──
  const v = editing && form ? form : {
    prefix: driver.prefix ?? "นาย",
    firstName: driver.firstName ?? "", lastName: driver.lastName ?? "",
    birthDate: driver.birthDate ?? "", nationalId: driver.nationalId ?? "",
    address: driver.address ?? "", phone: driver.phone ?? "",
    bankName: driver.bankName ?? "", accountNumber: driver.accountNumber ?? "",
    licenseExpiry: driver.licenseExpiry ?? "", status: driver.status ?? "active",
    isDriver: driver.isDriver ?? false, isTruckOwner: driver.isTruckOwner ?? false,
    photoUrl: driver.photoUrl ?? "",
  }

  const fullName = `${v.prefix ?? ""} ${v.firstName} ${v.lastName}`.trim()
  const age      = calcAge(v.birthDate)
  const initial  = (v.firstName || "?")[0]?.toUpperCase() ?? "?"

  // ── ใบขับขี่: หมดอายุ / ใกล้หมดใน 60 วัน ──
  const today = new Date().toISOString().slice(0, 10)
  const d60 = new Date(); d60.setDate(d60.getDate() + 60)
  const in60 = d60.toISOString().slice(0, 10)
  const licExpired  = !!v.licenseExpiry && v.licenseExpiry < today
  const licExpiring = !licExpired && !!v.licenseExpiry && v.licenseExpiry <= in60

  // ── ข้อมูลที่เอกสารสัญญาเช่าซื้อดึงจากพนักงาน — เช็คความพร้อม (สดระหว่างแก้ไข) ──
  const contractReq = [
    { label: "วันเกิด",          ok: !!v.birthDate },
    { label: "เลขบัตรประชาชน",   ok: v.nationalId.length === 13 },
    { label: "ที่อยู่",           ok: !!v.address.trim() },
    { label: "ธนาคาร + เลขบัญชี", ok: !!(v.bankName && v.accountNumber) },
  ]
  const reqMissing = contractReq.filter((r) => !r.ok)

  const hasLicenseInfo = driver.licenseNumber || driver.licenseType || driver.licenseExpiry

  const inputCls = "h-9 text-sm"

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">

      {/* Back + ประวัติการแก้ไข (เลขบัญชี/บัตร ปชช อ่อนไหว) */}
      <div className="flex items-center justify-between gap-2">
        <Link href="/partner/drivers" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />กลับรายการพนักงาน
        </Link>
        <ActivityHistory
          entity="driver"
          entityId={id}
          fieldLabels={{ accountNumber: "เลขที่บัญชี", bankName: "ธนาคาร", nationalId: "เลขบัตร ปชช.", firstName: "ชื่อ", lastName: "นามสกุล", status: "สถานะ" }}
          actionLabels={{ edit: "แก้ไขข้อมูล" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-4 items-start">

        {/* ══ ซ้าย: โปรไฟล์ + ลิงก์ที่เกี่ยวข้อง ══ */}
        <div className="space-y-4">

          {/* Profile card */}
          <Card>
            <div className="flex flex-col items-center text-center">
              {(() => {
                const photo = editing && form ? form.photoUrl : v.photoUrl
                const busy = uploadingDoc === "photoUrl"
                const avatar = photo ? (
                  <img src={photo} alt={fullName} className="w-20 h-20 rounded-full object-cover border border-zinc-200 dark:border-zinc-700" />
                ) : (
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold ${avatarColor(v.firstName)}`}>
                    {initial}
                  </div>
                )
                if (!editing) return photo ? (
                  <div className="relative">
                    {avatar}
                    <button
                      type="button"
                      onClick={() => rotatePhoto("photoUrl")}
                      disabled={rotatingDoc === "photoUrl"}
                      title="หมุนรูปโปรไฟล์ 90° (บันทึกทันที)"
                      className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-600 hover:border-emerald-300 shadow-sm disabled:opacity-60"
                    >
                      {rotatingDoc === "photoUrl"
                        ? <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        : <RotateCw className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ) : avatar
                return (
                  <label className="relative cursor-pointer group" title="อัปโหลด/เปลี่ยนรูปโปรไฟล์">
                    {avatar}
                    <span className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-semibold">
                      {busy ? <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (photo ? "เปลี่ยนรูป" : "＋ รูป")}
                    </span>
                    <input type="file" accept="image/*" className="hidden" disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc("photoUrl", f); e.target.value = "" }} />
                  </label>
                )
              })()}
              <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-3">{fullName || "—"}</h1>
              {driver.staffCode && <p className="text-xs text-zinc-400 font-mono mt-0.5">{editing && form ? form.staffCode : driver.staffCode}</p>}

              {editing && form ? (
                /* ── edit: สถานะ + บทบาท แก้ตรงนี้ ── */
                <div className="mt-3 w-full space-y-3">
                  <div className="flex gap-1.5 justify-center">
                    {([{ val: "active", l: "ใช้งาน" }, { val: "inactive", l: "ไม่ใช้งาน" }] as const).map(({ val, l }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => set("status", val)}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                          form.status === val
                            ? val === "active" ? "bg-emerald-600 text-white border-transparent" : "bg-zinc-600 text-white border-transparent"
                            : "bg-white dark:bg-zinc-900 text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-4 justify-center">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={form.isDriver} onChange={(e) => set("isDriver", e.target.checked)} className="w-3.5 h-3.5 rounded accent-emerald-600" />
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">พนักงานขับรถ</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={form.isTruckOwner} onChange={(e) => set("isTruckOwner", e.target.checked)} className="w-3.5 h-3.5 rounded accent-emerald-600" />
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">เจ้าของรถ</span>
                    </label>
                  </div>
                </div>
              ) : (
                /* ── view: badges ── */
                <>
                  <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      v.status === "active"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : driver.exitType
                          ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.status === "active" ? "bg-emerald-500" : driver.exitType ? "bg-rose-500" : "bg-zinc-400"}`} />
                      {v.status === "active" ? "ใช้งาน" : driver.exitType ? "พ้นสภาพ" : "ไม่ใช้งาน"}
                    </span>
                    {v.isDriver     && <span className="text-[11px] bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">พนักงานขับรถ</span>}
                    {v.isTruckOwner && <span className="text-[11px] bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">เจ้าของรถ</span>}
                  </div>
                  {driver.exitType && (
                    <p className="text-[11px] text-rose-600 dark:text-rose-300 mt-2 leading-snug">
                      {EXIT_TYPE_LABEL[driver.exitType]}{driver.endDate ? ` · ${driver.endDate.split("-").reverse().join("/")}` : ""}
                      {driver.exitReason ? <><br /><span className="text-zinc-400">{driver.exitReason}</span></> : null}
                    </p>
                  )}
                  {age !== null && <p className="text-xs text-zinc-400 mt-2">อายุ {age} ปี</p>}
                </>
              )}

              {isAdmin && !editing && (
                <div className="flex items-center gap-2 mt-4 w-full">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 flex-1" onClick={startEdit}>
                    <Pencil className="w-3 h-3" />แก้ไขข้อมูล
                  </Button>
                  {driver.status === "active" && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-rose-600 border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => setShowExit(true)} title="บันทึกพ้นสภาพ — ปิด/ยกเลิกสัญญา + จัดการรถให้ครบชุด">
                      <UserMinus className="w-3 h-3" />พ้นสภาพ
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    className="h-8 px-2.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    onClick={handleDelete} disabled={deleting}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {showExit && (
                <DriverExitDialog driver={driver} onClose={() => setShowExit(false)} onDone={() => { setShowExit(false); reload() }} />
              )}
            </div>

            {/* Quick contact — อัปเดตสดระหว่างแก้ไข */}
            <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2.5">
              <div className="flex items-center gap-2.5 text-sm">
                <Phone className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 shrink-0" />
                {v.phone
                  ? <a href={`tel:${v.phone}`} className="text-zinc-700 dark:text-zinc-200 hover:text-emerald-600 font-medium">{v.phone}</a>
                  : <span className="text-zinc-300 dark:text-zinc-600">ไม่มีเบอร์โทร</span>}
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <Landmark className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 shrink-0" />
                {v.bankName || v.accountNumber
                  ? <span className="text-zinc-700 dark:text-zinc-200">
                      {v.bankName}
                      {v.accountNumber && <span className="font-mono text-xs text-zinc-400 ml-1.5">{v.accountNumber}</span>}
                    </span>
                  : <span className="text-zinc-300 dark:text-zinc-600">ไม่มีข้อมูลบัญชี</span>}
              </div>
            </div>
          </Card>

          {/* สัญญา / รถ ที่ผูกอยู่ */}
          {(contract || driver.contractCode || driver.licensePlate) && (
            <Card title="สัญญา / รถ">
              <div className="space-y-3">
                {(contract || driver.contractCode) && (
                  contract?._id ? (
                    <Link
                      href={`/partner/contracts/${contract._id}`}
                      className="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors group"
                    >
                      <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 font-mono">{contract.contractCode}</div>
                        <div className="text-[11px] text-zinc-400 truncate">{contract.buyerName}</div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      <FileText className="w-4 h-4 text-zinc-300 shrink-0" />
                      <span className="text-sm font-mono text-zinc-500">{driver.contractCode}</span>
                    </div>
                  )
                )}
                {(driver.licensePlate || driver.truckNumber) && (
                  <div className="flex items-center gap-3 px-3.5 py-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <Truck className="w-4 h-4 text-zinc-400 shrink-0" />
                    <div>
                      {driver.licensePlate && <span className="text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-200">{driver.licensePlate}</span>}
                      {driver.truckNumber && <span className="text-xs text-zinc-400 ml-2">{driver.truckNumber}</span>}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ความพร้อมข้อมูลสำหรับเอกสารสัญญา — อัปเดตสดระหว่างแก้ไข */}
          <Card title="ข้อมูลสำหรับทำสัญญา">
            <div className="space-y-2">
              {contractReq.map(({ label, ok }) => (
                <div key={label} className="flex items-center gap-2 text-sm">
                  {ok
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <span className={ok ? "text-zinc-600 dark:text-zinc-300" : "text-amber-600 dark:text-amber-400 font-medium"}>{label}</span>
                </div>
              ))}
            </div>
            {reqMissing.length > 0 ? (
              <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mt-3">
                ขาด {reqMissing.length} รายการ — เอกสารสัญญาจะมีช่องว่างให้เติมมือ
                {isAdmin && !editing && (
                  <button onClick={startEdit} className="underline font-semibold ml-1 hover:text-amber-700">กรอกเลย →</button>
                )}
              </p>
            ) : (
              <p className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2 mt-3">
                ✓ ครบถ้วน พร้อมใช้ออกเอกสารสัญญา
              </p>
            )}
          </Card>
        </div>

        {/* ══ ขวา: รายละเอียด (แก้ไข in-place) ══ */}
        <div className="space-y-4">

          <Card title="ข้อมูลส่วนตัว">
            {editing && form ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <EditField label="คำนำหน้า">
                  <select
                    value={form.prefix}
                    onChange={(e) => set("prefix", e.target.value)}
                    className={inputCls}
                  >
                    {["นาย", "นาง", "นางสาว"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </EditField>
                <EditField label="ชื่อ *">
                  <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} placeholder="ชื่อ" />
                </EditField>
                <EditField label="นามสกุล *">
                  <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} placeholder="นามสกุล" />
                </EditField>
                <EditField label="วันเกิด" hint={form.birthDate ? `อายุ ${calcAge(form.birthDate)} ปี` : undefined}>
                  <ThaiDateInput value={form.birthDate} onChange={(iso) => set("birthDate", iso)} />
                </EditField>
                <EditField label="เลขบัตรประชาชน" hint={`${form.nationalId.length}/13 หลัก`}>
                  <Input
                    value={form.nationalId}
                    onChange={(e) => set("nationalId", e.target.value.replace(/\D/g, "").slice(0, 13))}
                    className={`${inputCls} font-mono tracking-widest`}
                    placeholder="0000000000000"
                    maxLength={13}
                  />
                </EditField>
                <EditField label="เบอร์โทรศัพท์">
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} type="tel" placeholder="081-234-5678" />
                </EditField>
                <div className="col-span-2 space-y-2">
                  <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">ที่อยู่</div>
                  <ThaiAddressFields
                    value={form}
                    onChange={(patch) => setForm((p) => p ? { ...p, ...patch } : p)}
                  />
                  {form.address && !composeThaiAddress(form) && (
                    <p className="text-[11px] text-zinc-400">ที่อยู่เดิม: {form.address}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="ชื่อ – นามสกุล" value={fullName} />
                <Field
                  label="วันเกิด"
                  value={driver.birthDate ? `${formatThaiDate(driver.birthDate)}${age !== null ? ` (${age} ปี)` : ""}` : undefined}
                />
                <Field
                  label="เลขบัตรประชาชน" mono
                  value={driver.nationalId?.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, "$1-$2-$3-$4-$5")}
                />
                <Field label="เบอร์โทรศัพท์" value={driver.phone} />
                <Field
                  label="ที่อยู่" className="col-span-2"
                  value={driver.address ? <span className="whitespace-pre-wrap leading-relaxed">{driver.address}</span> : undefined}
                />
              </div>
            )}
          </Card>

          <Card title="ข้อมูลการทำงาน">
            {editing && form ? (
              <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <EditField label="รหัสพนักงาน">
                  <Input value={form.staffCode} onChange={(e) => set("staffCode", e.target.value)} className={inputCls} placeholder="EMP-001" />
                  {/* พนักงานขับรถที่ไม่ใช่เจ้าของรถ → รหัสอิงสัญญาที่ไปวิ่งงานให้ (เช่น MTM145-01) */}
                  {form.isDriver && !form.isTruckOwner && form.contractCode.trim() !== "" && (
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-semibold text-emerald-600 hover:underline"
                      onClick={async () => {
                        const r = await fetch(`/api/partner/drivers/next-code?contractCode=${encodeURIComponent(form.contractCode.trim())}`)
                        const d = r.ok ? await r.json() : null
                        if (d?.code) set("staffCode", d.code)
                      }}
                    >
                      ใช้รหัสจากสัญญา ({form.contractCode.trim()}-01…)
                    </button>
                  )}
                </EditField>
                <EditField label="รหัสสัญญา" hint="ซ้ำกับพนักงานคนอื่นได้">
                  <Input value={form.contractCode} onChange={(e) => set("contractCode", e.target.value)} className={`${inputCls} font-mono`} placeholder="MTM145" />
                </EditField>
                <EditField label="เริ่มงานวันที่">
                  <ThaiDateInput value={form.startDate} onChange={(iso) => set("startDate", iso)} />
                </EditField>
                <EditField label="สิ้นสุดวันที่">
                  <ThaiDateInput value={form.endDate} onChange={(iso) => set("endDate", iso)} />
                </EditField>
                <EditField label="ธนาคาร">
                  <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className={inputCls} placeholder="กสิกรไทย / กรุงไทย..." />
                </EditField>
                <EditField label="เลขที่บัญชี">
                  <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} className={`${inputCls} font-mono`} />
                </EditField>
              </div>

              {/* ── ประวัติการทำงาน (เช่น เคยเป็น พจส. จากวันไหนถึงวันไหน) ── */}
              <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                    ประวัติการทำงาน (เคยเป็น พจส. / พจร.)
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((p) => p ? { ...p, workHistory: [...p.workHistory, { role: "พจส.", from: "", to: "", note: "" }] } : p)}
                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    + เพิ่มช่วง
                  </button>
                </div>
                <datalist id="wh-roles">
                  <option value="พจส." />
                  <option value="พจร." />
                </datalist>
                {form.workHistory.length === 0 && (
                  <p className="text-xs text-zinc-400">ยังไม่มีประวัติ — กด “+ เพิ่มช่วง” เช่น เคยเป็น พจส. 1 ม.ค. 63 – 31 ธ.ค. 65</p>
                )}
                <div className="space-y-2">
                  {form.workHistory.map((w, i) => (
                    <div key={i} className="grid grid-cols-2 lg:grid-cols-[110px_1fr_1fr_1.2fr_auto] gap-2 items-center">
                      <Input
                        list="wh-roles"
                        value={w.role}
                        onChange={(e) => setForm((p) => p ? { ...p, workHistory: p.workHistory.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x) } : p)}
                        className={inputCls}
                        placeholder="พจส."
                        title="ตำแหน่ง เช่น พจส. / พจร."
                      />
                      <ThaiDateInput value={w.from} onChange={(iso) => setForm((p) => p ? { ...p, workHistory: p.workHistory.map((x, idx) => idx === i ? { ...x, from: iso } : x) } : p)} placeholder="ตั้งแต่วันที่" />
                      <ThaiDateInput value={w.to} onChange={(iso) => setForm((p) => p ? { ...p, workHistory: p.workHistory.map((x, idx) => idx === i ? { ...x, to: iso } : x) } : p)} placeholder="ถึงวันที่ (ว่าง = ปัจจุบัน)" />
                      <Input
                        value={w.note}
                        onChange={(e) => setForm((p) => p ? { ...p, workHistory: p.workHistory.map((x, idx) => idx === i ? { ...x, note: e.target.value } : x) } : p)}
                        className={inputCls}
                        placeholder="หมายเหตุ (ถ้ามี)"
                      />
                      <button
                        type="button"
                        onClick={() => setForm((p) => p ? { ...p, workHistory: p.workHistory.filter((_, idx) => idx !== i) } : p)}
                        className="text-zinc-300 hover:text-red-500 px-1"
                        title="ลบช่วงนี้"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5">เว้น “ถึงวันที่” ว่างไว้ = ยังเป็นอยู่ปัจจุบัน</p>
              </div>
              </>
            ) : (
              <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="รหัสพนักงาน" value={driver.staffCode} mono />
                <Field label="รหัสสัญญา" value={driver.contractCode} mono />
                <Field label="เริ่มงานวันที่" value={driver.startDate ? formatThaiDate(driver.startDate) : undefined} />
                <Field label="สิ้นสุดวันที่" value={driver.endDate ? formatThaiDate(driver.endDate) : undefined} />
                <Field label="ธนาคาร" value={driver.bankName} />
                <Field label="เลขที่บัญชี" value={driver.accountNumber} mono />
                <Field
                  label="บทบาท"
                  value={[driver.isDriver && "พนักงานขับรถ", driver.isTruckOwner && "เจ้าของรถ"].filter(Boolean).join(" · ") || undefined}
                />
              </div>

              {(driver.workHistory?.length ?? 0) > 0 && (
                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-2">
                    ประวัติการทำงาน
                  </p>
                  <div className="space-y-1.5">
                    {driver.workHistory!.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 shrink-0">
                          {w.role}
                        </span>
                        <span className="text-zinc-600 dark:text-zinc-300 tabular-nums">
                          {w.from ? formatThaiDate(w.from) : "ไม่ระบุ"} – {w.to ? formatThaiDate(w.to) : "ปัจจุบัน"}
                        </span>
                        {w.note && <span className="text-xs text-zinc-400 truncate" title={w.note}>· {w.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </>
            )}
          </Card>

          <Card
            title="ใบขับขี่"
            action={
              licExpired ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> หมดอายุแล้ว
                </span>
              ) : licExpiring ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> ใกล้หมดอายุ
                </span>
              ) : undefined
            }
          >
            {editing && form ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <EditField label="เลขบัตรใบขับขี่">
                  <Input value={form.licenseNumber} onChange={(e) => set("licenseNumber", e.target.value)} className={`${inputCls} font-mono`} placeholder="12345678" />
                </EditField>
                <EditField label="ประเภท">
                  <select
                    value={form.licenseType}
                    onChange={(e) => set("licenseType", e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">— เลือกประเภท —</option>
                    {Object.entries(LICENSE_TYPE_LABEL).map(([val, l]) => (
                      <option key={val} value={val}>{val} {l}</option>
                    ))}
                  </select>
                </EditField>
                <EditField label="วันหมดอายุ">
                  <ThaiDateInput value={form.licenseExpiry} onChange={(iso) => set("licenseExpiry", iso)} />
                </EditField>
              </div>
            ) : hasLicenseInfo ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="เลขบัตรใบขับขี่" value={driver.licenseNumber} mono />
                <Field
                  label="ประเภท"
                  value={driver.licenseType
                    ? <>{driver.licenseType}{LICENSE_TYPE_LABEL[driver.licenseType] && <span className="text-xs text-zinc-400 ml-1.5">{LICENSE_TYPE_LABEL[driver.licenseType]}</span>}</>
                    : undefined}
                />
                <Field
                  label="วันหมดอายุ"
                  value={driver.licenseExpiry
                    ? <span className={licExpired ? "text-red-600 font-semibold" : licExpiring ? "text-amber-600 font-semibold" : ""}>
                        {formatThaiDate(driver.licenseExpiry)}
                      </span>
                    : undefined}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-zinc-300 dark:text-zinc-600">
                <IdCard className="w-4 h-4" /> ยังไม่มีข้อมูลใบขับขี่
                {isAdmin && (
                  <button onClick={startEdit} className="text-emerald-600 hover:underline text-xs font-medium">+ เพิ่มข้อมูล</button>
                )}
              </div>
            )}
          </Card>

          <Card
            title="เอกสารแนบ"
            action={
              <span className="text-[10px] text-zinc-400">
                {[
                  editing && form ? form.idCardUrl   : driver.idCardUrl,
                  editing && form ? form.licenseUrl  : driver.licenseUrl,
                  editing && form ? form.houseRegUrl : driver.houseRegUrl,
                  editing && form ? form.bankBookUrl : driver.bankBookUrl,
                ].filter(Boolean).length}/4 ไฟล์
              </span>
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { field: "idCardUrl",   label: "บัตรประชาชน" },
                { field: "licenseUrl",  label: "ใบขับขี่" },
                { field: "houseRegUrl", label: "ทะเบียนบ้าน" },
                { field: "bankBookUrl", label: "หน้าบุ๊คแบงค์" },
              ] as { field: "idCardUrl" | "licenseUrl" | "houseRegUrl" | "bankBookUrl"; label: string }[]).map(({ field, label }) => (
                <DocThumb
                  key={field}
                  url={editing && form ? form[field] : driver[field]}
                  label={label}
                  editing={editing}
                  busy={uploadingDoc === field}
                  rotating={rotatingDoc === field}
                  onUpload={(f) => uploadDoc(field, f)}
                  onRemove={() => set(field, "")}
                  onRotate={driver[field] && (!editing || form?.[field] === driver[field])
                    ? () => rotatePhoto(field)
                    : undefined}
                />
              ))}
            </div>
          </Card>

          <Tax50Card driver={driver} isAdmin={isAdmin} onSaved={reload} />
        </div>
      </div>

      {/* หมุนรูปไม่สำเร็จ — ต้องเห็นได้ทั้งโหมดดูและโหมดแก้ไข (แถบบันทึกโชว์เฉพาะตอนแก้ไข) */}
      {rotateError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs text-red-600 shadow-lg dark:border-red-900/50 dark:bg-zinc-900">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{rotateError}</span>
          <button type="button" onClick={() => setRotateError("")} title="ปิด"
            className="ml-1 text-red-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Sticky save bar (edit mode) ── */}
      {editing && form && (
        <div className="sticky bottom-4 z-20">
          <div className="max-w-3xl mx-auto flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-lg rounded-xl px-4 py-3">
            <Pencil className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-xs text-zinc-500 flex-1 truncate">
              {error
                ? <span className="text-red-500 font-medium">{error}</span>
                : "กำลังแก้ไขข้อมูล — การเปลี่ยนแปลงยังไม่ถูกบันทึก"}
            </span>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={cancelEdit} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : <><Check className="w-3.5 h-3.5" />บันทึก</>}
            </Button>
          </div>
        </div>
      )}

      {!editing && !driver.firstName && (
        <div className="flex flex-col items-center gap-2 py-8 text-zinc-300 dark:text-zinc-700">
          <User className="w-10 h-10" />
          <p className="text-sm">ยังไม่มีข้อมูล</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="text-xs mt-1" onClick={startEdit}>กรอกข้อมูล</Button>
          )}
        </div>
      )}
    </div>
  )
}


// ── 50 ทวิ แยกรายเดือน — บันทึกทันที (ไม่ผูกโหมดแก้ไขทั้งหน้า) ──
function Tax50Card({ driver, isAdmin, onSaved }: { driver: Driver; isAdmin: boolean; onSaved: () => void }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const items = [...(driver.tax50BisMonthly ?? [])].sort((a, b) => (a.month < b.month ? 1 : -1))

  async function save(list: { month: string; url: string }[]) {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/partner/drivers/${driver._id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tax50BisMonthly: list }),
      })
      if (!r.ok) throw new Error("บันทึกไม่สำเร็จ")
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ")
    } finally { setBusy(false) }
  }

  async function upload(file: File) {
    if (!/^\d{4}-\d{2}$/.test(month)) { setErr("เลือกเดือนก่อน"); return }
    setBusy(true); setErr("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "drivers/tax50bis")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
      const { url } = await res.json()
      await save([...items.filter((x) => x.month !== month), { month, url }])
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไฟล์ไม่สำเร็จ")
      setBusy(false)
    }
  }

  const thMonth = (m: string) => {
    const [y, mm] = m.split("-").map(Number)
    const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    return `${names[mm - 1]} ${y}/${y + 543}`
  }

  return (
    <Card
      title="50 ทวิ (แยกรายเดือน)"
      action={<span className="text-[10px] text-zinc-400">{items.length} เดือน</span>}
    >
      {isAdmin && (
        <div className="flex items-center gap-2 mb-3">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="h-8 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 bg-transparent" />
          <label className={`text-xs px-3 py-1.5 rounded-lg cursor-pointer ${busy ? "bg-zinc-100 text-zinc-400" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`}>
            {busy ? "กำลังอัปโหลด..." : "+ แนบไฟล์เดือนนี้"}
            <input type="file" accept="image/*,.pdf" className="hidden" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
          </label>
          {err && <span className="text-[11px] text-red-500">{err}</span>}
        </div>
      )}
      {items.length === 0 && !driver.tax50BisUrl && (
        <p className="text-xs text-zinc-300 text-center py-3">ยังไม่มีไฟล์ 50 ทวิ</p>
      )}
      <div className="space-y-1.5">
        {items.map((x) => (
          <div key={x.month} className="flex items-center gap-2 text-xs border border-zinc-100 dark:border-zinc-800 rounded-lg px-3 py-1.5">
            <span className="font-medium w-20">{thMonth(x.month)}</span>
            <a href={x.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate flex-1">เปิดไฟล์</a>
            {isAdmin && (
              <button disabled={busy} onClick={async () => { if (await confirm(`ลบไฟล์ 50 ทวิ ${thMonth(x.month)}?`)) save(items.filter((y) => y.month !== x.month)) }}
                className="text-zinc-300 hover:text-red-500">ลบ</button>
            )}
          </div>
        ))}
        {driver.tax50BisUrl && (
          <div className="flex items-center gap-2 text-xs border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5">
            <span className="text-zinc-400 w-20">ไฟล์เดิม</span>
            <a href={driver.tax50BisUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate flex-1">เปิดไฟล์ (ไม่ระบุเดือน)</a>
          </div>
        )}
      </div>
    </Card>
  )
}
