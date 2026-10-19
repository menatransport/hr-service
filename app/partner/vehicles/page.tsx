"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { Search, Plus, X, Check, Car, ChevronRight, Upload, FileText, ExternalLink, Hash, Wrench, Download } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { Button } from "@/components/partner/ui/button"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"
import { ActivityHistory } from "@/components/partner/activity-history"
import type { Vehicle } from "@/lib/partner/types"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatThaiDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "—"
  // วันจดทะเบียน/วันที่ในหน้ารถ = เอกสารราชการ → แสดง พ.ศ. ล้วน (คำสั่ง 2026-08-06)
  return `${d.getDate()} ${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]} ${d.getFullYear() + 543}`
}

// ─── Form fields config ───────────────────────────────────────────────────────

const FORM_FIELDS: { key: keyof Vehicle; label: string; type?: string; placeholder?: string; section: string }[] = [
  // Section: ข้อมูลทั่วไป
  { key: "vehicleType",    label: "ประเภทรถ",                  placeholder: "รถบรรทุก / รถผสมปูน", section: "ข้อมูลทั่วไป" },
  { key: "characteristic", label: "ลักษณะ",                    placeholder: "10 ล้อ / 6 ล้อ",       section: "ข้อมูลทั่วไป" },
  { key: "brand",          label: "ยี่ห้อ",                    placeholder: "ISUZU / HINO",           section: "ข้อมูลทั่วไป" },
  { key: "model",          label: "รุ่น",                      placeholder: "FVM34W",                 section: "ข้อมูลทั่วไป" },
  { key: "color",          label: "สีรถ",                      placeholder: "ขาว / เทา",             section: "ข้อมูลทั่วไป" },
  // Section: ทะเบียน
  { key: "licensePlate",     label: "ทะเบียนรถ",               placeholder: "สบ.71-1956",            section: "ทะเบียน" },
  { key: "truckNumber",      label: "เบอร์รถ",                 placeholder: "ME009",                  section: "ทะเบียน" },
  { key: "registrationDate", label: "วันจดทะเบียน",            type: "date",                          section: "ทะเบียน" },
  // Section: ตัวถัง / เครื่องยนต์
  { key: "chassisNumber", label: "เลขตัวถัง",                  placeholder: "NKRHF…",                section: "ตัวถัง / เครื่องยนต์" },
  { key: "engineNumber",  label: "เลขเครื่อง",                 placeholder: "6HK1…",                 section: "ตัวถัง / เครื่องยนต์" },
  { key: "engineSize",    label: "ขนาดกำลังเครื่องยนต์",      placeholder: "7790 cc / 240 hp",      section: "ตัวถัง / เครื่องยนต์" },
]

/** ข้อมูลครบ = กรอกครบทุกช่องใน FORM_FIELDS (คำนวณอัตโนมัติ — เลิกติ๊กมือ 2026-08-06) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVehicleComplete(v: any): boolean {
  return FORM_FIELDS.every((f) => String(v?.[f.key] ?? "").trim() !== "")
}

const EMPTY_FORM: Omit<Vehicle, "_id" | "createdAt" | "updatedAt"> = {
  truckType: "mixer",
  vehicleType: "", characteristic: "", brand: "", model: "",
  registrationDate: "", color: "", licensePlate: "", truckNumber: "",
  chassisNumber: "", engineNumber: "", engineSize: "", status: "active",
  registrationDocUrl: "",
  photoUrl: "",
  photos: { front: "", back: "", left: "", right: "", cabin: "" },
  dataComplete: false, dataExpectedDate: "",
}

const V_PHOTO_SLOTS: { key: string; label: string }[] = [
  { key: "front", label: "หน้า" }, { key: "back", label: "หลัง" }, { key: "left", label: "ซ้าย" }, { key: "right", label: "ขวา" }, { key: "cabin", label: "ห้องผู้โดยสาร" },
]

// ─── Slide panel ─────────────────────────────────────────────────────────────

interface SlidePanelProps {
  vehicle: Vehicle | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

// module scope: นิยามนอก component เพื่อไม่ให้ได้ identity ใหม่ทุก render
// (เดิมอยู่ใน SlidePanel → พิมพ์ 1 ตัว = remount ทั้ง section = cursor หลุด)
function SectionCard({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode
}) {
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
          <Icon className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function SlidePanel({ vehicle, onClose, onSaved, onDeleted }: SlidePanelProps) {
  const isEdit = !!vehicle
  const draftKey = `vehicle-draft-${vehicle?._id ?? "new"}`
  const [form, setForm]       = useState({ ...EMPTY_FORM })
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState("")
  const [uploading,   setUploading]   = useState(false)

  useEffect(() => {
    if (vehicle) {
      setForm({
        truckType:           vehicle.truckType === "trailer" ? "trailer" : "mixer",
        vehicleType:         vehicle.vehicleType         ?? "",
        characteristic:      vehicle.characteristic      ?? "",
        brand:               vehicle.brand               ?? "",
        model:               vehicle.model               ?? "",
        registrationDate:    vehicle.registrationDate    ?? "",
        color:               vehicle.color               ?? "",
        licensePlate:        vehicle.licensePlate        ?? "",
        truckNumber:         vehicle.truckNumber         ?? "",
        chassisNumber:       vehicle.chassisNumber       ?? "",
        engineNumber:        vehicle.engineNumber        ?? "",
        engineSize:          vehicle.engineSize          ?? "",
        status:              vehicle.status              ?? "active",
        registrationDocUrl:  vehicle.registrationDocUrl  ?? "",
        photoUrl:            vehicle.photoUrl            ?? "",
        photos:              { front: vehicle.photos?.front ?? vehicle.photoUrl ?? "", back: vehicle.photos?.back ?? "", left: vehicle.photos?.left ?? "", right: vehicle.photos?.right ?? "", cabin: vehicle.photos?.cabin ?? "" },
        dataComplete:        vehicle.dataComplete === true,
        dataExpectedDate:    vehicle.dataExpectedDate    ?? "",
      })
    } else {
      setForm({ ...EMPTY_FORM })
    }
    // ร่างที่ค้างจากรอบก่อน (เช่นกด F5 กลางคัน) — กู้ทับค่าจาก DB
    try {
      const draft = sessionStorage.getItem(draftKey)
      if (draft) setForm((base) => ({ ...base, ...JSON.parse(draft) }))
    } catch { /* ร่างเสีย — ใช้ค่าจาก DB */ }
    setError("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle])

  // เก็บร่างทุกครั้งที่แก้ (ลบเมื่อบันทึกสำเร็จ/กดยกเลิกเอง)
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, JSON.stringify(form)) } catch { /* เต็ม/ปิดกั้น */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  const discardDraftAndClose = () => {
    try { sessionStorage.removeItem(draftKey) } catch { /* noop */ }
    onClose()
  }

  const [uploadingSlot, setUploadingSlot] = useState("")
  async function uploadPhoto(slot: string, file: File) {
    setUploadingSlot(slot); setError("")
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "vehicles/photos")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error("อัปโหลดรูปไม่สำเร็จ")
      const { url } = await res.json()
      setForm((f) => ({ ...f, photos: { ...f.photos, [slot]: url } }))
    } catch (e) { setError(e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ") }
    finally { setUploadingSlot("") }
  }
  const removePhoto = (slot: string) => setForm((f) => ({ ...f, photos: { ...f.photos, [slot]: "" } }))
  async function uploadDoc(file: File) {
    setUploading(true); setError("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "vehicles")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Upload failed")
      const { url } = await res.json()
      set("registrationDocUrl" as keyof typeof EMPTY_FORM, url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function set(key: keyof typeof EMPTY_FORM, val: string) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  async function handleSave() {
    setSaving(true); setError("")
    try {
      const url    = isEdit ? `/api/partner/vehicles/${vehicle!._id}` : "/api/partner/vehicles"
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dataComplete: isVehicleComplete(form) }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? "เกิดข้อผิดพลาด"); return
      }
      try { sessionStorage.removeItem(draftKey) } catch { /* noop */ }
      onSaved(); onClose()
    } finally { setSaving(false) }
  }



  // ปิดด้วยปุ่ม Esc
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") discardDraftAndClose() }
    window.addEventListener("keydown", onEsc)
    return () => window.removeEventListener("keydown", onEsc)
  }, [onClose])

  // ความครบถ้วน — นับช่องที่กรอกแล้วจากทั้งหมด
  const total  = FORM_FIELDS.length
  const filled = FORM_FIELDS.filter((f) => String(form[f.key as keyof typeof form] ?? "").trim()).length
  const pct    = Math.round((filled / total) * 100)
  const complete = filled === total

  const field = (f: (typeof FORM_FIELDS)[number]) => {
    const empty = !String(form[f.key as keyof typeof form] ?? "").trim()
    return (
      <div key={f.key}>
        <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1.5">
          {f.label}
          {empty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="ยังไม่กรอก" />}
        </label>
        {f.type === "date" ? (
          <ThaiDateInput
            beOnly
            value={String(form[f.key as keyof typeof form] ?? "")}
            onChange={(iso) => set(f.key as keyof typeof EMPTY_FORM, iso)}
            className={empty ? "border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/10" : ""}
          />
        ) : (
          <Input
            type={f.type ?? "text"}
            placeholder={f.placeholder}
            value={String(form[f.key as keyof typeof form] ?? "")}
            onChange={(e) => set(f.key as keyof typeof EMPTY_FORM, e.target.value)}
            className={`h-10 text-sm ${empty ? "border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/10 focus-visible:ring-amber-400" : ""}`}
          />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-50 dark:bg-zinc-950 flex flex-col">

        {/* ── header bar ── */}
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur">
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
            {isEdit ? "แก้ไขข้อมูลรถ" : "เพิ่มรถใหม่"}
          </p>
          <button
            onClick={discardDraftAndClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-4">

          {/* ── hero: identity + status + completeness ── */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* license-plate motif */}
                <div className="shrink-0 rounded-md border-2 border-zinc-800 bg-white px-3 py-1.5 text-center shadow-sm">
                  <div className="text-[7px] font-semibold text-zinc-400 leading-none mb-1 tracking-[0.15em]">ทะเบียนรถ</div>
                  <div className="text-lg font-bold text-zinc-900 tracking-wider leading-none whitespace-nowrap">
                    {form.licensePlate || "— — —"}
                  </div>
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 truncate">
                    {form.truckNumber || (isEdit ? "รถไม่มีเบอร์" : "รถใหม่")}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">
                    {[form.brand, form.vehicleType, form.characteristic].filter(Boolean).join(" · ") || "ยังไม่มีรายละเอียดรถ"}
                  </p>
                </div>
                {isEdit && vehicle?._id && (
                  <div className="shrink-0">
                    <ActivityHistory
                      entity="vehicle"
                      entityId={vehicle._id}
                      fieldLabels={{ truckType: "ประเภท (Mixer/Trailer)", status: "สถานะ", licensePlate: "ทะเบียน", brand: "ยี่ห้อ", model: "รุ่น", dataComplete: "ข้อมูลครบถ้วน", dataExpectedDate: "วันที่คาดจะเสร็จ" }}
                      actionLabels={{ edit: "แก้ไข" }}
                    />
                  </div>
                )}
              </div>
              {/* status toggle */}
              <div className="shrink-0 flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                {[
                  { value: "active",   label: "ใช้งาน" },
                  { value: "inactive", label: "ไม่ใช้งาน" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("status", opt.value)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      form.status === opt.value
                        ? opt.value === "active"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-zinc-500 text-white shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* completeness meter */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-zinc-500">กรอกข้อมูลแล้ว {filled}/{total} ช่อง</span>
                <span className={complete ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                  {complete ? "✓ ครบถ้วน" : `ยังขาด ${total - filled} ช่อง`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${complete ? "bg-emerald-500" : "bg-amber-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* วันที่คาดจะเสร็จ — โชว์เฉพาะตอนข้อมูลยังไม่ครบ (สถานะครบ/ไม่ครบดูที่แถบหัวฟอร์ม) */}
            {!complete && (
              <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                <label className="text-xs text-zinc-500 whitespace-nowrap">วันที่คาดจะเสร็จ</label>
                <div className="w-48">
                  <ThaiDateInput
                    beOnly
                    value={form.dataExpectedDate ?? ""}
                    onChange={(iso) => set("dataExpectedDate", iso)}
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl border border-red-100 dark:border-red-900/40">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <SectionCard icon={Car} title="ข้อมูลทั่วไป">
            {/* ประเภทหลัก Mixer / Trailer — ย้ายเข้าหมวดข้อมูลทั่วไป (คำสั่ง 2026-08-06) */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium text-zinc-500">ประเภทรถ:</span>
              {([["mixer", "Mixer (โม่ปูน)"], ["trailer", "Trailer (เทรลเลอร์)"]] as [("mixer" | "trailer"), string][]).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, truckType: val }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    (form.truckType ?? "mixer") === val
                      ? val === "trailer"
                        ? "bg-amber-500 text-white border-transparent"
                        : "bg-sky-600 text-white border-transparent"
                      : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {FORM_FIELDS.filter((f) => f.section === "ข้อมูลทั่วไป").map(field)}
            </div>
          </SectionCard>

          <SectionCard icon={Hash} title="ทะเบียน">
            <div className="grid grid-cols-2 gap-4">
              {FORM_FIELDS.filter((f) => f.section === "ทะเบียน").map(field)}
            </div>
          </SectionCard>

          <SectionCard icon={Wrench} title="ตัวถัง / เครื่องยนต์">
            <div className="grid grid-cols-2 gap-4">
              {FORM_FIELDS.filter((f) => f.section === "ตัวถัง / เครื่องยนต์").map(field)}
            </div>
          </SectionCard>

          <SectionCard icon={Car} title="รูปรถ">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {V_PHOTO_SLOTS.map((s) => {
                const url = ((form.photos as Record<string, string> | undefined)?.[s.key]) ?? ""
                return (
                  <div key={s.key} className="text-center">
                    {url ? (
                      <div className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={s.label} className="w-full h-16 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700" />
                        <button type="button" onClick={() => removePhoto(s.key)} aria-label={`ลบรูป${s.label}`}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <label className={`w-full h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${uploadingSlot === s.key ? "border-blue-300 bg-blue-50/40" : "border-zinc-200 dark:border-zinc-700 hover:border-emerald-400"}`}>
                        {uploadingSlot === s.key ? <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4 text-zinc-400" />}
                        <input type="file" accept="image/*" className="hidden" disabled={!!uploadingSlot} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(s.key, f); e.target.value = "" }} />
                      </label>
                    )}
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 truncate">{s.label}</div>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-zinc-400 mt-2">รูปมุม &quot;หน้า&quot; จะ sync ไปใบเสนอราคาตอนสร้างดีล</p>
          </SectionCard>

          <SectionCard icon={FileText} title="เอกสารแนบ">
            {form.registrationDocUrl ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                <FileText className="w-5 h-5 text-zinc-400 shrink-0" />
                <a
                  href={form.registrationDocUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 text-sm text-emerald-600 hover:underline flex items-center gap-1.5"
                >
                  สำเนาทะเบียนรถ <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => set("registrationDocUrl" as keyof typeof EMPTY_FORM, "")}
                  className="text-zinc-300 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className={`flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors
                ${uploading
                  ? "border-blue-300 bg-blue-50/40 dark:bg-blue-950/10 dark:border-blue-700"
                  : "border-zinc-200 dark:border-zinc-700 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/10"
                }`}>
                {uploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span className="text-sm text-blue-600 font-medium">กำลังอัปโหลด...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-zinc-400 shrink-0" />
                    <div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300 font-medium">แนบสำเนาทะเบียนรถ</p>
                      <p className="text-xs text-zinc-400 mt-0.5">PDF หรือรูปภาพ • สูงสุด 20 MB</p>
                    </div>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = "" }}
                />
              </label>
            )}
          </SectionCard>
          </div>

          </div>
        </div>

        {/* ── sticky footer ── */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur">
          {/* ปุ่มลบรถถอดออกตามคำสั่ง 2026-08-06 — ป้องกันลบข้อมูลโยงสัญญา/เงินเดือน (ลบได้เฉพาะระดับ DB) */}
          <span />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={discardDraftAndClose} className="h-9 text-sm text-zinc-500">ยกเลิก</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "กำลังบันทึก..." : <><Check className="w-3.5 h-3.5" />{isEdit ? "บันทึกการแก้ไข" : "เพิ่มรถ"}</>}
            </Button>
          </div>
        </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

// คอลัมน์แบบกระชับ — รวมฟิลด์ที่เกี่ยวข้องเป็นเซลล์ 2 บรรทัด ให้พอดีจอโน้ตบุ๊ก (ไม่ตัดข้อมูลทิ้ง)
const TABLE_COLS = [
  { key: "id",        label: "เบอร์รถ / ทะเบียน",  w: "w-36" },
  { key: "truckType", label: "ประเภท",             w: "w-20" },
  { key: "brand",     label: "ยี่ห้อ / รุ่น",       w: "w-48" },
  { key: "spec",      label: "ตัวถัง / เครื่อง",    w: "w-44" },
  { key: "reg",       label: "จดทะเบียน",          w: "w-24" },
  { key: "status",    label: "สถานะ",              w: "w-24" },
  { key: "data",      label: "ข้อมูล",             w: "w-28" },
]

type StatusFilter = "" | "working" | "ready" | "preparing" | "inactive"

/** ป้ายสถานะฝูงรถ (fleetState จาก API) + ป้ายย่อย saleStatus */
const FLEET_META: Record<string, { label: string; cls: string; dot: string }> = {
  working:   { label: "วิ่งงานอยู่",          cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400", dot: "bg-emerald-500" },
  ready:     { label: "พร้อมขาย",             cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",         dot: "bg-amber-500" },
  preparing: { label: "ระหว่างดำเนินการ",     cls: "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",                 dot: "bg-sky-500" },
  inactive:  { label: "ไม่ใช้งาน",            cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",               dot: "bg-zinc-400" },
}
const SALE_SUB: Record<string, string> = {
  ready: "", repair15: "รอซ่อม 15 วัน", repair30: "รอซ่อม 30 วัน", review: "ยังไม่ได้เริ่มดำเนินการ",
}

export default function VehiclesPage() {
  const [items, setItems]               = useState<Vehicle[]>([])
  const [q, setQ]                       = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("")
  const [typeFilter, setTypeFilter]     = useState<"" | "mixer" | "trailer">("")
  const [dataFilter, setDataFilter]     = useState<"" | "complete" | "incomplete">("")
  const [loading, setLoading]           = useState(true)
  const [panel, setPanel]               = useState<Vehicle | null | "new">(null)
  // เปิด/ปิดพร้อมจำใน URL — กด F5 ระหว่างแก้ไขแล้วไม่เด้งออกจากฟอร์ม
  const openPanel = (v: Vehicle | "new") => {
    setPanel(v)
    const u = new URL(window.location.href)
    u.searchParams.set("edit", v === "new" ? "new" : (v._id ?? ""))
    window.history.replaceState(null, "", u.toString())
  }
  const closePanel = () => {
    setPanel(null)
    const u = new URL(window.location.href)
    u.searchParams.delete("edit")
    window.history.replaceState(null, "", u.toString())
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // โหลดเต็มชุดเสมอ — ตัวเลขบนป้ายฟิลเตอร์ต้องนิ่ง ไม่เปลี่ยนตามฟิลเตอร์ (กรองฝั่ง client แทน)
      const res = await fetch(`/api/partner/vehicles?${params}`)
      if (res.ok) setItems(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // deep-link:
  //  • /vehicles?edit=<id>      → เปิด panel แก้ไขรถคันนั้น (จากหน้าสัญญา)
  //  • /vehicles?plate=<ทะเบียน> → กรองตามทะเบียน + เปิด panel ถ้าเจอคันเดียว (จากหน้า Price List)
  const deepLinked = useRef(false)
  const [deepLinkMiss, setDeepLinkMiss] = useState("")
  useEffect(() => {
    if (deepLinked.current || items.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const editId = params.get("edit")
    const plate  = params.get("plate")?.trim()

    if (editId) {
      if (editId === "new") { deepLinked.current = true; setPanel("new"); return }
      const v = items.find((x) => x._id === editId)
      if (v) { deepLinked.current = true; setPanel(v); setQ(v.licensePlate ?? "") }
      return
    }

    if (plate) {
      deepLinked.current = true
      setQ(plate)
      const matches = items.filter((x) => (x.licensePlate ?? "").trim().toLowerCase() === plate.toLowerCase())
      if (matches.length === 1) setPanel(matches[0])
      else if (matches.length === 0) setDeepLinkMiss(plate)
    }
  }, [items])

  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState("")

  async function syncFromAtms() {
    setSyncing(true); setSyncResult("")
    try {
      const res = await fetch("/api/partner/vehicles/sync-atms", { method: "POST" })
      if (!res.ok) { setSyncResult("ดึงข้อมูลไม่สำเร็จ"); return }
      const r = await res.json()
      setSyncResult(
        `✓ ดึงข้อมูลจาก ATMS สำเร็จ — ตรงกัน ${r.matched}/${r.total} คัน · อัปเดต ${r.updated} คัน · เติม ${r.fieldsFilled} ช่อง` +
        (r.unmatched?.length ? ` · ไม่พบใน ATMS: ${r.unmatched.length} คัน` : "")
      )
      await load()
    } finally { setSyncing(false) }
  }

  // truckType: default "mixer" ถ้ายังไม่ได้ระบุ (fleet เป็น Mixer)
  const vType = (v: Vehicle) => (v.truckType === "trailer" ? "trailer" : "mixer")

  const filtered = useMemo(() => {
    const lq = q.toLowerCase()
    return items.filter((v) => {
      if (statusFilter && (v.fleetState ?? (v.status === "inactive" ? "inactive" : "preparing")) !== statusFilter) return false
      if (typeFilter && vType(v) !== typeFilter) return false
      if (dataFilter === "complete"   && !isVehicleComplete(v)) return false
      if (dataFilter === "incomplete" && isVehicleComplete(v)) return false
      if (!q) return true
      return [v.truckNumber, v.licensePlate, v.brand, v.model, v.vehicleType,
        v.chassisNumber, v.engineNumber, v.characteristic]
        .some((f) => (f ?? "").toLowerCase().includes(lq))
    })
  }, [items, q, statusFilter, typeFilter, dataFilter])

  // ── pagination: สูงสุด 50 คัน/หน้า ──
  const pg = usePagination(filtered, 50, [q, statusFilter, typeFilter, dataFilter])

  const fleetOf       = (v: Vehicle) => v.fleetState ?? (v.status === "inactive" ? "inactive" : "preparing")
  const workingCount   = items.filter((v) => fleetOf(v) === "working").length
  const readyCount     = items.filter((v) => fleetOf(v) === "ready").length
  const preparingCount = items.filter((v) => fleetOf(v) === "preparing").length
  const activeCount   = items.filter((v) => v.status === "active").length
  const inactiveCount = items.filter((v) => v.status !== "active").length
  const mixerCount    = items.filter((v) => vType(v) === "mixer").length
  const trailerCount  = items.filter((v) => vType(v) === "trailer").length
  const completeCount   = items.filter((v) => isVehicleComplete(v)).length
  const incompleteCount = items.length - completeCount
  const showPanel     = panel !== null
  const editVehicle   = panel === "new" ? null : panel

  // ── Export Excel — เฉพาะแถวที่กรองอยู่ (respect search + status + type filters) ──
  async function handleExportExcel() {
    const rows = filtered.map((v) => ({
      "เบอร์รถ":       v.truckNumber   ?? "",
      "ประเภท":        vType(v) === "trailer" ? "Trailer" : "Mixer",
      "ทะเบียนรถ":     v.licensePlate  ?? "",
      "ประเภทรถ":      v.vehicleType   ?? "",
      "ลักษณะ":        v.characteristic ?? "",
      "ยี่ห้อ":        v.brand         ?? "",
      "รุ่น":          v.model         ?? "",
      "สีรถ":          v.color         ?? "",
      "วันจดทะเบียน":  v.registrationDate ?? "",
      "เลขตัวถัง":     v.chassisNumber ?? "",
      "เลขเครื่อง":    v.engineNumber  ?? "",
      "กำลังเครื่อง":  v.engineSize    ?? "",
      "สถานะ":         FLEET_META[fleetOf(v)].label,
      "ข้อมูลครบถ้วน": isVehicleComplete(v) ? "ครบ" : "ไม่ครบ",
      "วันที่คาดจะเสร็จ": isVehicleComplete(v) ? "" : (v.dataExpectedDate ?? ""),
    }))
    await exportToExcel([{ name: "ทะเบียนรถ", rows }], `vehicles-${todayStamp()}`)
  }

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">ข้อมูลยานพาหนะ</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">ทะเบียนรถ</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{activeCount} ใช้งาน · {inactiveCount} ไม่ใช้งาน · ข้อมูลครบ {completeCount}/{items.length} คัน</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 text-sm gap-1.5"
            disabled={syncing}
            onClick={syncFromAtms}
            title="เติมข้อมูลรถจาก ATMS vehiclemaster (เติมเฉพาะช่องที่ยังว่าง)"
          >
            {syncing ? (
              <><div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />กำลังดึง...</>
            ) : (
              <>⟳ ดึงข้อมูลจาก ATMS</>
            )}
          </Button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg h-9 px-3 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
            title="ดาวน์โหลดเป็น Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm gap-1.5"
            onClick={() => openPanel("new")}
          >
            <Plus className="w-4 h-4" />เพิ่มรถ
          </Button>
        </div>
      </div>

      {syncResult && (
        <div className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
          {syncResult}
        </div>
      )}

      {deepLinkMiss && (
        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
          ทะเบียน <span className="font-mono font-semibold">{deepLinkMiss}</span> ยังไม่มีในทะเบียนรถ — มีเฉพาะราคาขายในหน้า Price List
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "",         label: `ทั้งหมด (${items.length})` },
          { key: "working",   label: `รถวิ่งงานอยู่ (${workingCount})` },
          { key: "ready",     label: `รถพร้อมขาย (${readyCount})` },
          { key: "preparing", label: `รถอยู่ระหว่างดำเนินการให้พร้อมขาย (${preparingCount})` },
          { key: "inactive",  label: `ไม่ใช้งาน (${inactiveCount})` },
        ] as { key: StatusFilter; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === f.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        {([
          { key: "",        label: `ทุกประเภท` },
          { key: "mixer",   label: `Mixer (${mixerCount})` },
          { key: "trailer", label: `Trailer (${trailerCount})` },
        ] as { key: "" | "mixer" | "trailer"; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              typeFilter === f.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        {([
          { key: "",           label: `ข้อมูลทั้งหมด` },
          { key: "complete",   label: `🟢 ครบ (${completeCount})` },
          { key: "incomplete", label: `🟡 ไม่ครบ (${incompleteCount})` },
        ] as { key: "" | "complete" | "incomplete"; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setDataFilter(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              dataFilter === f.key
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <Input
            placeholder="ค้นหาทะเบียน / เบอร์รถ / ยี่ห้อ / เลขตัวถัง..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-72 text-xs pl-8"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                {TABLE_COLS.map((col) => (
                  <th key={col.key} className={`px-2.5 py-2 text-left font-semibold text-zinc-400 uppercase tracking-wider whitespace-nowrap ${col.w}`}>
                    {col.label}
                  </th>
                ))}
                <th className="px-2.5 py-2 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={TABLE_COLS.length + 1} className="px-4 py-10 text-center text-zinc-400 animate-pulse">
                    กำลังโหลดข้อมูล...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLS.length + 1} className="px-4 py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-zinc-300">
                      <Car className="w-8 h-8" />
                      <p className="text-sm text-zinc-400">ไม่พบรถ</p>
                      {q && <button className="text-xs text-zinc-400 underline" onClick={() => setQ("")}>ล้างการค้นหา</button>}
                    </div>
                  </td>
                </tr>
              ) : (
                pg.paged.map((v) => {
                  const specLine = [v.vehicleType, v.characteristic, v.color].filter(Boolean).join(" · ")
                  return (
                  <tr key={v._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors group cursor-pointer" onClick={() => openPanel(v)}>
                    {/* เบอร์รถ / ทะเบียน */}
                    <td className="px-2.5 py-2 align-top">
                      <div className="font-bold text-zinc-800 dark:text-zinc-100 font-mono">{v.truckNumber || "—"}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="font-mono text-[11px] text-zinc-500">{v.licensePlate || "—"}</span>
                        {v.registrationDocUrl && (
                          <a href={v.registrationDocUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="ดูสำเนาทะเบียนรถ" className="text-zinc-300 hover:text-emerald-500">
                            <FileText className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* ประเภท (Mixer / Trailer) */}
                    <td className="px-2.5 py-2 align-top">
                      {vType(v) === "trailer" ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Trailer</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Mixer</span>
                      )}
                    </td>

                    {/* ยี่ห้อ / รุ่น (+ ประเภทรถ · ลักษณะ · สี) */}
                    <td className="px-2.5 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        {v.brand
                          ? <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 font-medium text-[11px]">{v.brand}</span>
                          : <span className="text-zinc-300">—</span>}
                        {v.model && <span className="text-[11px] text-zinc-600 dark:text-zinc-400 truncate max-w-[130px]">{v.model}</span>}
                      </div>
                      {specLine && <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[190px]" title={specLine}>{specLine}</div>}
                    </td>

                    {/* ตัวถัง / เครื่อง (+ กำลัง) */}
                    <td className="px-2.5 py-2 align-top font-mono text-[10px] text-zinc-500 tracking-wide">
                      <div className="truncate max-w-[170px]" title={v.chassisNumber || ""}><span className="text-zinc-400">ถัง</span> {v.chassisNumber || "—"}</div>
                      <div className="truncate max-w-[170px] mt-0.5" title={v.engineNumber || ""}><span className="text-zinc-400">คร.</span> {v.engineNumber || "—"}</div>
                      {v.engineSize && <div className="text-zinc-400 font-sans">{v.engineSize}</div>}
                    </td>

                    {/* วันจดทะเบียน */}
                    <td className="px-2.5 py-2 align-top tabular-nums text-zinc-500 whitespace-nowrap">{formatThaiDateShort(v.registrationDate)}</td>

                    {/* สถานะ */}
                    <td className="px-2.5 py-2 align-top">
                      {(() => {
                        const fm  = FLEET_META[fleetOf(v)]
                        const sub = fleetOf(v) === "preparing" ? (v.saleStatus ? SALE_SUB[v.saleStatus] : "ยังไม่ระบุ") : ""
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] w-fit ${fm.cls}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${fm.dot}`} />
                              {fm.label}{fleetOf(v) === "working" && v.contractCode ? ` · ${v.contractCode}` : ""}
                            </span>
                            {sub && <span className="text-[10px] text-zinc-400 pl-1">{sub}</span>}
                          </div>
                        )
                      })()}
                    </td>

                    {/* ข้อมูลครบ / ไม่ครบ (ยึด tick box manual) */}
                    <td className="px-2.5 py-2 align-top">
                      {isVehicleComplete(v) ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />ครบ
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />ไม่ครบ
                          </span>
                          {v.dataExpectedDate && (
                            <span className="text-[9px] text-zinc-400 whitespace-nowrap" title="วันที่คาดจะเก็บข้อมูลครบ">คาดเสร็จ {formatThaiDateShort(v.dataExpectedDate)}</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2.5 py-2 align-top">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="px-2 py-1 text-[10px] font-medium text-zinc-400">แก้ไข</span>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        {!loading && (
          <PaginationBar {...pg} unit="คัน" note={q ? `(ค้นหาจากทั้งหมด ${items.length} คัน)` : undefined} />
        )}
      </div>

      {showPanel && (
        <SlidePanel
          vehicle={editVehicle}
          onClose={closePanel}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  )
}
