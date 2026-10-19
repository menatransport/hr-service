"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { hasPerm } from "@/lib/partner/rbac"
import { Search, X, ChevronDown, Tag, Upload, Trash2, FileText } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { SearchCombobox } from "@/components/partner/search-combobox"
import { ContractDocument, PromotionAttachment, normPlate, type PromoMaster } from "@/components/partner/contract-document"
import { HireContractDocument } from "@/components/partner/hire-contract-document"
import { GuaranteeContractDocument } from "@/components/partner/guarantee-contract-document"
import { VendorDocDocument } from "@/components/partner/vendor-doc-document"
import { missingDocFields, missingHireDocFields, missingGuaranteeDocFields, missingVendorDocFields } from "@/lib/partner/contract-doc"
import { useDebounced } from "@/lib/partner/use-debounced"
import type { Contract, Driver, Vehicle } from "@/lib/partner/types"

// ─── types ─────────────────────────────────────────────────────────────────────

interface PriceRow {
  licensePlate:         string
  totalSalePrice:       number
  downPayment:          number
  cashDown:             number
  remainingInstallment: number
  downInstallmentCount: number
  downInstallmentAmt:   number
  financeAmount:        number
  financeInstallments:  number
  monthlyPayment:       number
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function calcAge(birthDate?: string | null): string {
  if (!birthDate) return ""
  const b = new Date(birthDate)
  const now = new Date()
  const age = now.getFullYear() - b.getFullYear() -
    (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0)
  return String(age)
}

function thaiDate(iso?: string | null): string {
  if (!iso) return ""
  const [y, m, d] = iso.slice(0, 10).split("-")
  const months = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${parseInt(y)}/${parseInt(y) + 543}`
}

function fmt(n?: number | null): string {
  if (!n) return "—"
  return n.toLocaleString("th-TH")
}

// ─── section wrapper ───────────────────────────────────────────────────────────

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest">{title}</span>
        {badge && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
            <Tag className="w-2.5 h-2.5" /> {badge}
          </span>
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-zinc-800 dark:text-zinc-200">{value || <span className="text-zinc-300 dark:text-zinc-600">—</span>}</div>
    </div>
  )
}

// ─── form state ────────────────────────────────────────────────────────────────

interface FormState {
  contractCode:            string
  contractDate:            string
  driverId:                string
  buyerName:               string
  driverName:              string
  birthDate:               string
  nationalId:              string
  driverAddress:           string
  phone:                   string
  bankName:                string
  accountNumber:           string
  vehicleId:               string
  vehicleType:             string
  vehicleCharacteristic:   string
  vehicleBrand:            string
  vehicleModel:            string
  vehicleRegistrationDate: string
  vehicleColor:            string
  licensePlate:            string
  truckNumber:             string
  chassisNumber:           string
  engineNumber:            string
  engineSize:              string
  mileage:                 number
  // price fields (from master_price_list by licensePlate)
  totalPrice:              number
  downPayment:             number
  cashDown:                number
  remainingInstallment:    number
  downInstallmentCount:    number
  downInstallmentAmt:      number
  financeAmount:           number
  monthlyInstallment:      number
  totalInstallments:       number
  startDate:               string
  plant:                   string
  status:                  string
  payEveryLastDay:         boolean
  saleContractUrl:         string
  promotionDocUrl:         string
  hireContractUrl:         string
  guaranteeContractUrl:    string
  creditorDocUrl:          string
  guarantorName:           string
  guarantorNationalId:     string
  guarantorAddress:        string
  // ข้อมูลเปิดเจ้าหนี้
  buyerNameEn:             string
  email:                   string
  bankAccountType:         string
  bankBranch:              string
  vendorCodeWinspeed:      string
  vendorCodeAtms:          string
  notes:                   string
}

const EMPTY: FormState = {
  contractCode: "", contractDate: new Date().toISOString().slice(0, 10),
  driverId: "", buyerName: "", driverName: "", birthDate: "", nationalId: "",
  driverAddress: "", phone: "", bankName: "", accountNumber: "",
  vehicleId: "", vehicleType: "", vehicleCharacteristic: "", vehicleBrand: "",
  vehicleModel: "", vehicleRegistrationDate: "", vehicleColor: "",
  licensePlate: "", truckNumber: "", chassisNumber: "", engineNumber: "", engineSize: "", mileage: 0,
  totalPrice: 0, downPayment: 0, cashDown: 0, remainingInstallment: 0,
  downInstallmentCount: 0, downInstallmentAmt: 0, financeAmount: 0,
  monthlyInstallment: 0, totalInstallments: 0,
  startDate: "", plant: "", status: "active", payEveryLastDay: false,
  saleContractUrl: "", promotionDocUrl: "", hireContractUrl: "", guaranteeContractUrl: "", creditorDocUrl: "",
  guarantorName: "", guarantorNationalId: "", guarantorAddress: "",
  buyerNameEn: "", email: "", bankAccountType: "ออมทรัพย์", bankBranch: "",
  vendorCodeWinspeed: "", vendorCodeAtms: "", notes: "",
}

// ─── wizard steps ─────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { title: "ข้อมูลหลัก",      desc: "สัญญา + ผู้เช่าซื้อ" },
  { title: "สัญญาซื้อขาย",    desc: "รถ + ราคา/งวด" },
  { title: "สัญญาค้ำประกัน",  desc: "ผู้ค้ำประกัน" },
  { title: "เปิดเจ้าหนี้",    desc: "ข้อมูลผู้ขาย/บัญชี" },
  { title: "เอกสาร & บันทึก", desc: "ไฟล์แนบ + ตรวจสอบ" },
]

// ─── page ─────────────────────────────────────────────────────────────────────

export default function NewContractPage() {
  const router = useRouter()
  const { data: session } = usePartnerSession()

  const [form,     setForm]     = useState<FormState>(EMPTY)
  const [drivers,  setDrivers]  = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [prices,   setPrices]   = useState<PriceRow[]>([])
  const [promoList, setPromoList] = useState<PromoMaster[]>([])
  const [docTab, setDocTab] = useState<"sale" | "promo" | "hire" | "guarantee" | "vendor">("sale")
  const [step, setStep] = useState(0)

  // เปลี่ยน step → สลับ preview ไปเอกสารที่เกี่ยวข้อง
  useEffect(() => {
    setDocTab(step === 2 ? "guarantee" : step === 3 ? "vendor" : "sale")
  }, [step])
  const [selectedDriver,  setSelectedDriver]  = useState<Driver  | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState("")
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)

  // track last plate we auto-filled so we don't override manual edits
  const lastAutoFilledPlate = useRef("")

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v })), [])

  // Load all lookup data on mount
  useEffect(() => {
    fetch("/api/partner/contracts/next-code")
      .then((r) => r.ok ? r.json() : { code: "MTL-001" })
      .then((d) => set("contractCode", d.code))
    fetch("/api/partner/drivers?status=active")
      .then((r) => r.ok ? r.json() : [])
      .then(setDrivers)
    fetch("/api/partner/vehicles")
      .then((r) => r.ok ? r.json() : [])
      .then(setVehicles)
    fetch("/api/partner/price-list")
      .then((r) => r.ok ? r.json() : [])
      .then(setPrices)
    fetch("/api/partner/promotions/master")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setPromoList(Array.isArray(d) ? d : []))
  }, [set])

  // prefill ทะเบียนจากดีล/ใบเสนอ: /contracts/new?plate=<ทะเบียน> (ราคา+รถเติมอัตโนมัติ)
  const platePrefilled = useRef(false)
  useEffect(() => {
    if (platePrefilled.current || vehicles.length === 0) return
    const pplate = new URLSearchParams(window.location.search).get("plate")?.trim()
    if (!pplate) return
    platePrefilled.current = true
    set("licensePlate", pplate)
    const v = vehicles.find((x) => x.licensePlate === pplate)
    if (v) setSelectedVehicle(v)
  }, [vehicles, set])

  // Auto-fill price whenever licensePlate changes (vehicle selection OR manual input)
  useEffect(() => {
    const plate = form.licensePlate.trim()
    if (!plate || !prices.length) return
    if (plate === lastAutoFilledPlate.current) return   // already filled for this plate
    const pr = prices.find((p) => p.licensePlate === plate)
    if (!pr) return
    lastAutoFilledPlate.current = plate
    setForm((prev) => ({
      ...prev,
      totalPrice:           pr.totalSalePrice,
      downPayment:          pr.downPayment,
      cashDown:             pr.cashDown,
      remainingInstallment: pr.remainingInstallment,
      downInstallmentCount: pr.downInstallmentCount,
      downInstallmentAmt:   pr.downInstallmentAmt,
      financeAmount:        pr.financeAmount,
      monthlyInstallment:   pr.monthlyPayment,
      totalInstallments:    pr.financeInstallments,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.licensePlate, prices])

  // Driver selected → fill personal section
  function handleDriverSelect(d: Driver | null) {
    setSelectedDriver(d)
    if (!d) {
      setForm((p) => ({ ...p, driverId: "", buyerName: "", driverName: "",
        birthDate: "", nationalId: "", driverAddress: "", phone: "" }))
      return
    }
    const fullName = `${d.firstName} ${d.lastName}`.trim()
    setForm((p) => ({
      ...p,
      driverId:      d._id ?? "",
      buyerName:     fullName,
      driverName:    fullName,
      birthDate:     d.birthDate     ?? "",
      nationalId:    d.nationalId    ?? "",
      driverAddress: d.address       ?? "",
      phone:         d.phone         ?? p.phone,
      bankName:      d.bankName      ?? p.bankName,
      accountNumber: d.accountNumber ?? p.accountNumber,
    }))
  }

  // Vehicle selected → fill vehicle section (price lookup handled by effect above)
  function handleVehicleSelect(v: Vehicle | null) {
    setSelectedVehicle(v)
    if (!v) {
      lastAutoFilledPlate.current = ""
      setForm((p) => ({
        ...p,
        vehicleId: "", vehicleType: "", vehicleCharacteristic: "",
        vehicleBrand: "", vehicleModel: "", vehicleRegistrationDate: "",
        vehicleColor: "", licensePlate: "", truckNumber: "",
        chassisNumber: "", engineNumber: "", engineSize: "",
        totalPrice: 0, downPayment: 0, cashDown: 0, remainingInstallment: 0,
        downInstallmentCount: 0, downInstallmentAmt: 0, financeAmount: 0,
        monthlyInstallment: 0, totalInstallments: 0,
      }))
      return
    }
    setForm((p) => ({
      ...p,
      vehicleId:               v._id              ?? "",
      vehicleType:             v.vehicleType      ?? "",
      vehicleCharacteristic:   v.characteristic   ?? "",
      vehicleBrand:            v.brand            ?? "",
      vehicleModel:            v.model            ?? "",
      vehicleRegistrationDate: v.registrationDate ?? "",
      vehicleColor:            v.color            ?? "",
      licensePlate:            v.licensePlate     ?? "",
      truckNumber:             v.truckNumber      ?? "",
      chassisNumber:           v.chassisNumber    ?? "",
      engineNumber:            v.engineNumber     ?? "",
      engineSize:              v.engineSize       ?? "",
    }))
    // price effect will fire from the licensePlate change above
  }

  async function uploadDoc(field: "saleContractUrl" | "promotionDocUrl" | "hireContractUrl" | "guaranteeContractUrl" | "creditorDocUrl", file: File) {
    setUploadingDoc(field)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "contracts")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Upload failed")
      const { url } = await res.json()
      set(field, url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploadingDoc(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasPerm(session?.user?.role, "contracts")) return
    // Enter บนขั้นตอนก่อนสุดท้าย = ถัดไป (กันบันทึกโดยไม่ตั้งใจ)
    if (step < WIZARD_STEPS.length - 1) { setStep(step + 1); return }
    if (!form.contractCode.trim()) { setError("กรุณากรอกรหัสสัญญา"); setStep(0); return }
    if (!form.buyerName.trim())    { setError("กรุณาเลือกหรือกรอกชื่อผู้เช่าซื้อ"); setStep(0); return }
    // เลขบัตรผู้ค้ำประกัน เว้นว่างได้ แต่ถ้ากรอกต้องเป็นตัวเลข 13 หลักพอดี
    if (form.guarantorNationalId && !/^\d{13}$/.test(form.guarantorNationalId)) {
      setError("ถ้ากรอกเลขบัตรประชาชนผู้ค้ำประกัน ต้องเป็นตัวเลข 13 หลัก"); setStep(2); return
    }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/partner/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? "เกิดข้อผิดพลาด"); return
      }
      router.push("/partner/contracts")
    } finally {
      setSaving(false)
    }
  }

  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")
  const priceRow = prices.find((p) => p.licensePlate === form.licensePlate.trim())

  // ── live preview: ใช้เกณฑ์/เอกสารชุดเดียวกับหน้าแก้ไขสัญญา ──
  const previewContract = form as unknown as Contract
  // debounce ค่าที่ส่งเข้าเอกสาร A4 — พิมพ์รัว ๆ ไม่ re-render เอกสารทุกตัวอักษร
  const previewData = useDebounced(previewContract, 200)
  const previewPromo =
    promoList.find((p) => normPlate(p.licensePlate) === normPlate(form.licensePlate)) ?? null
  const missingDoc =
    docTab === "sale" ? missingDocFields(previewContract)
    : docTab === "promo" ? []
    : docTab === "hire" ? missingHireDocFields(previewContract)
    : docTab === "guarantee" ? missingGuaranteeDocFields(previewContract)
    : missingVendorDocFields(previewContract)

  // จำนวนข้อมูลที่ยังขาดของแต่ละเอกสาร — ใช้ในสรุปก่อนบันทึก
  const missCounts = {
    sale:      missingDocFields(previewContract).length,
    promo:     previewPromo
      ? [previewPromo.pro1TotalValue, previewPromo.pro2RepairBudget, previewPromo.pro3AnnualPm].filter((v) => v == null).length
      : 3,
    hire:      missingHireDocFields(previewContract).length,
    guarantee: missingGuaranteeDocFields(previewContract).length,
    vendor:    missingVendorDocFields(previewContract).length,
  }

  return (
    <div className="max-w-[1500px]">
      {/* ── ซ้าย: ฟอร์ม | ขวา: preview สัญญาสด (เหมือนหน้าแก้ไขสัญญา) ── */}
      <div className="flex gap-6 items-start">
        <div className="w-full xl:max-w-2xl min-w-0 shrink-0 xl:w-[42rem]">

      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">เพิ่มสัญญา</h1>
        <p className="text-sm text-zinc-400 mt-0.5">กรอกข้อมูลสัญญา เลือกผู้เช่าซื้อ และเลือกรถ</p>
      </div>

      {/* ── Stepper: 4 ขั้นตอนตามเอกสารสัญญา ── */}
      <div className="mb-6 flex items-center">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.title} className={`flex items-center ${i < WIZARD_STEPS.length - 1 ? "flex-1" : ""}`}>
            <button
              type="button"
              onClick={() => setStep(i)}
              className="flex items-center gap-2 group"
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                i === step
                  ? "bg-emerald-600 text-white"
                  : i < step
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700"
              }`}>
                {i < step ? "✓" : i + 1}
              </span>
              <span className="text-left hidden sm:block">
                <span className={`block text-xs font-semibold leading-tight ${
                  i === step ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400"
                }`}>{s.title}</span>
                <span className="block text-[10px] text-zinc-400 leading-tight">{s.desc}</span>
              </span>
            </button>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 ${i < step ? "bg-emerald-300 dark:bg-emerald-800" : "bg-zinc-200 dark:bg-zinc-700"}`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {step === 0 && <>
        {/* ── 1. ข้อมูลสัญญา ── */}
        <Section title="ข้อมูลสัญญา">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">รหัสสัญญา <span className="text-red-400">*</span></label>
              <Input
                value={form.contractCode}
                onChange={(e) => set("contractCode", e.target.value)}
                placeholder="MTL-001"
                className="h-9 text-sm font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">วันที่ทำสัญญา <span className="text-red-400">*</span></label>
              <ThaiDateInput value={form.contractDate} onChange={(iso) => set("contractDate", iso)} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">วันที่เริ่มผ่อนงวดแรก</label>
              <ThaiDateInput value={form.startDate} onChange={(iso) => set("startDate", iso)} />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">สถานะสัญญา</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="active">ใช้งาน</option>
                <option value="completed">สิ้นสุด</option>
                <option value="terminated">ยกเลิก</option>
              </select>
            </div>
            <div className="col-span-2 flex items-center gap-2.5 pt-1">
              <input
                type="checkbox"
                id="payEveryLastDay"
                checked={form.payEveryLastDay}
                onChange={(e) => set("payEveryLastDay", e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600 cursor-pointer"
              />
              <label htmlFor="payEveryLastDay" className="text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                จ่ายทุกวันสุดท้ายของเดือน
              </label>
            </div>
          </div>
        </Section>

        {/* ── 2. ข้อมูลส่วนบุคคล ── */}
        <Section title="ข้อมูลส่วนบุคคล" badge="พนักงานขับรถ">
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1">ค้นหาผู้เช่าซื้อ / พนักงานขับรถ</label>
            <SearchCombobox<Driver>
              items={drivers}
              selected={selectedDriver}
              onSelect={handleDriverSelect}
              getLabel={(d) => `${d.firstName} ${d.lastName}`.trim()}
              getSub={(d) => d.staffCode ?? ""}
              placeholder="พิมพ์ชื่อ นามสกุล หรือรหัสพนักงาน..."
              searchKeys={(d) => [d.firstName, d.lastName, d.staffCode ?? "", d.nationalId ?? "", d.phone ?? ""]}
            />
          </div>

          {selectedDriver ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow label="ชื่อ – นามสกุล"     value={`${selectedDriver.firstName} ${selectedDriver.lastName}`} />
                <InfoRow label="อายุ"                value={calcAge(selectedDriver.birthDate) ? `${calcAge(selectedDriver.birthDate)} ปี` : null} />
                <InfoRow label="วันเดือนปีเกิด"      value={thaiDate(selectedDriver.birthDate)} />
                <InfoRow label="เลขบัตรประชาชน"      value={selectedDriver.nationalId} />
                <InfoRow label="ที่อยู่"             value={selectedDriver.address} />
                <InfoRow label="เบอร์โทรศัพท์"       value={selectedDriver.phone} />
                <InfoRow label="ธนาคาร"              value={selectedDriver.bankName} />
                <InfoRow label="เลขที่บัญชี"         value={selectedDriver.accountNumber} />
              </div>

              {(selectedDriver.idCardUrl || selectedDriver.licenseUrl || selectedDriver.houseRegUrl) && (
                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">เอกสารแนบ</p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { url: selectedDriver.idCardUrl,   label: "บัตรประชาชน" },
                      { url: selectedDriver.licenseUrl,  label: "ใบขับขี่" },
                      { url: selectedDriver.houseRegUrl, label: "ทะเบียนบ้าน" },
                    ] as { url?: string; label: string }[])
                      .filter((d) => d.url)
                      .map(({ url, label }) => (
                        <a
                          key={label}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {label}
                        </a>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">ชื่อผู้เช่าซื้อ <span className="text-red-400">*</span></label>
                <Input value={form.buyerName} onChange={(e) => set("buyerName", e.target.value)} className="h-9 text-sm" placeholder="กรอกชื่อ นามสกุล" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">เบอร์โทร</label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="h-9 text-sm" type="tel" />
              </div>
            </div>
          )}

          {!selectedDriver && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">ธนาคาร</label>
                <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className="h-9 text-sm" placeholder="กสิกรไทย / กรุงไทย..." />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">เลขที่บัญชี</label>
                <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} className="h-9 text-sm font-mono" />
              </div>
            </div>
          )}
        </Section>
        </>}

        {step === 3 && <>
        {/* ── ข้อมูลเปิดเจ้าหนี้ (ใช้ในเอกสารเปิดเจ้าหนี้รายใหม่) ── */}
        <Section title="ข้อมูลเปิดเจ้าหนี้" badge="Vendor">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">ชื่อเจ้าหนี้ (ภาษาอังกฤษ)</label>
              <Input value={form.buyerNameEn} onChange={(e) => set("buyerNameEn", e.target.value)} className="h-9 text-sm" placeholder="Mr. ..." />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email ผู้ติดต่อ</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="h-9 text-sm" placeholder="example@mail.com" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">ประเภทบัญชี <span className="text-red-400">*</span></label>
              <select
                value={form.bankAccountType}
                onChange={(e) => set("bankAccountType", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="ออมทรัพย์">ออมทรัพย์</option>
                <option value="กระแสรายวัน">กระแสรายวัน</option>
                <option value="ประจำ">ประจำ</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">สาขาธนาคาร <span className="text-red-400">*</span></label>
              <Input value={form.bankBranch} onChange={(e) => set("bankBranch", e.target.value)} className="h-9 text-sm" placeholder="เช่น สาขาแก่งคอย" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">รหัสเจ้าหนี้ Winspeed</label>
              <Input value={form.vendorCodeWinspeed} onChange={(e) => set("vendorCodeWinspeed", e.target.value)} className="h-9 text-sm font-mono" placeholder="เว้นว่างได้ — บัญชีกำหนดหลังเปิด" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">รหัสเจ้าหนี้ ATMS</label>
              <Input value={form.vendorCodeAtms} onChange={(e) => set("vendorCodeAtms", e.target.value)} className="h-9 text-sm font-mono" placeholder="เว้นว่างได้ — บัญชีกำหนดหลังเปิด" />
            </div>
          </div>
        </Section>
        </>}

        {step === 2 && <>
        {/* ── ผู้ค้ำประกัน (ใช้ในสัญญาค้ำประกัน) ── */}
        <Section title="ผู้ค้ำประกัน" badge={form.guarantorName ? undefined : "เว้นว่างได้"}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">ชื่อ – นามสกุล ผู้ค้ำประกัน</label>
              <Input value={form.guarantorName} onChange={(e) => set("guarantorName", e.target.value)} className="h-9 text-sm" placeholder="นาย/นาง/นางสาว ..." />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">เลขบัตรประชาชนผู้ค้ำประกัน</label>
              <Input
                value={form.guarantorNationalId}
                onChange={(e) => set("guarantorNationalId", e.target.value.replace(/\D/g, "").slice(0, 13))}
                className="h-9 text-sm font-mono tracking-widest"
                placeholder="0000000000000"
                maxLength={13}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-zinc-400 mb-1">ที่อยู่ผู้ค้ำประกัน</label>
              <Input value={form.guarantorAddress} onChange={(e) => set("guarantorAddress", e.target.value)} className="h-9 text-sm" placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด" />
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2 mt-4">
            ใช้ในเอกสารสัญญาค้ำประกันเท่านั้น — สัญญาว่าจ้างใช้ข้อมูลผู้เช่าซื้อ/บัญชีธนาคารจากขั้นตอนที่ 1
          </p>
        </Section>
        </>}

        {step === 1 && <>
        {/* ── 3. ข้อมูลรถ ── */}
        <Section title="ข้อมูลรถ" badge="ทะเบียนรถ">
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1">ค้นหาทะเบียนรถ / เบอร์รถ</label>
            <SearchCombobox<Vehicle>
              items={vehicles.filter((v) => prices.some((p) => p.licensePlate === v.licensePlate))}
              selected={selectedVehicle}
              onSelect={handleVehicleSelect}
              getLabel={(v) => v.licensePlate ?? ""}
              getSub={(v) => [v.truckNumber, v.brand].filter(Boolean).join(" · ")}
              placeholder="พิมพ์ทะเบียน เบอร์รถ หรือยี่ห้อ..."
              searchKeys={(v) => [v.licensePlate ?? "", v.truckNumber ?? "", v.brand ?? "", v.model ?? "", v.chassisNumber ?? ""]}
            />
          </div>

          {selectedVehicle ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <InfoRow label="ทะเบียนรถ"              value={selectedVehicle.licensePlate} />
              <InfoRow label="เบอร์รถ"                value={selectedVehicle.truckNumber} />
              <InfoRow label="ประเภทรถ"               value={selectedVehicle.vehicleType} />
              <InfoRow label="ลักษณะ"                 value={selectedVehicle.characteristic} />
              <InfoRow label="ยี่ห้อ"                 value={selectedVehicle.brand} />
              <InfoRow label="รุ่น"                   value={selectedVehicle.model} />
              <InfoRow label="สีรถ"                  value={selectedVehicle.color} />
              <InfoRow label="วันจดทะเบียน"           value={thaiDate(selectedVehicle.registrationDate)} />
              <InfoRow label="เลขตัวถัง"              value={selectedVehicle.chassisNumber} />
              <InfoRow label="เลขเครื่อง"             value={selectedVehicle.engineNumber} />
              <InfoRow label="ขนาดกำลังเครื่องยนต์"   value={selectedVehicle.engineSize} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">ทะเบียนรถ</label>
                <Input
                  value={form.licensePlate}
                  onChange={(e) => { set("licensePlate", e.target.value) }}
                  className="h-9 text-sm font-mono"
                  placeholder="สบ.71-1956"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">เบอร์รถ</label>
                <Input value={form.truckNumber} onChange={(e) => set("truckNumber", e.target.value)} className="h-9 text-sm" placeholder="ME009" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">ยี่ห้อรถ</label>
                <Input value={form.vehicleBrand} onChange={(e) => set("vehicleBrand", e.target.value)} className="h-9 text-sm" placeholder="HINO" />
              </div>
            </div>
          )}
          <div className="mt-4 w-1/2 pr-2">
            <label className="block text-xs text-zinc-400 mb-1">ระยะทางที่ใช้แล้ว (กม.) — ใช้ในเอกสารสัญญา</label>
            <Input
              type="number"
              value={form.mileage || ""}
              onChange={(e) => set("mileage", Number(e.target.value) || 0)}
              className="h-9 text-sm"
              placeholder="เว้นว่างได้ ถ้าไม่ทราบ"
            />
          </div>
        </Section>

        {/* ── 4. ราคาซื้อและการชำระราคา ── */}
        <Section
          title="ราคาซื้อและการชำระราคา"
          badge={priceRow ? `อ้างอิงจาก ${form.licensePlate}` : undefined}
        >
          {priceRow ? (
            /* ── auto-filled from price-list ── */
            <div className="space-y-4">
              {/* summary strip */}
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 divide-y divide-emerald-100 dark:divide-emerald-900 overflow-hidden text-sm">
                <div className="flex">
                  <div className="flex-1 px-4 py-3 border-r border-emerald-100 dark:border-emerald-900">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">ราคาขายรวม</div>
                    <div className="font-bold text-zinc-800 dark:text-zinc-100 text-base">{fmt(priceRow.totalSalePrice)} <span className="text-xs font-normal text-zinc-400">บาท</span></div>
                  </div>
                  <div className="flex-1 px-4 py-3 border-r border-emerald-100 dark:border-emerald-900">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">ยอดไฟแนนซ์</div>
                    <div className="font-bold text-zinc-800 dark:text-zinc-100 text-base">{fmt(priceRow.financeAmount)} <span className="text-xs font-normal text-zinc-400">บาท</span></div>
                  </div>
                  <div className="flex-1 px-4 py-3">
                    <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">ค่างวด / เดือน</div>
                    <div className="font-bold text-zinc-800 dark:text-zinc-100 text-base">{fmt(priceRow.monthlyPayment)} <span className="text-xs font-normal text-zinc-400">บาท × {priceRow.financeInstallments} งวด</span></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-emerald-100 dark:divide-emerald-900 text-xs">
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">เงินดาวน์รวม</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(priceRow.downPayment)} บาท</div>
                  </div>
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">เงินดาวน์สด</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(priceRow.cashDown)} บาท</div>
                  </div>
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">งวดดาวน์คงเหลือ</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(priceRow.remainingInstallment)} บาท</div>
                  </div>
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">จำนวนงวดดาวน์</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{priceRow.downInstallmentCount} งวด</div>
                  </div>
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">ค่างวดดาวน์</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(priceRow.downInstallmentAmt)} บาท</div>
                  </div>
                  <div className="px-4 py-2.5">
                    <span className="text-zinc-400">จำนวนงวดไฟแนนซ์</span>
                    <div className="font-semibold text-zinc-700 dark:text-zinc-300">{priceRow.financeInstallments} งวด</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── manual entry when no price-list match ── */
            <div>
              {form.licensePlate && (
                <div className="mb-4 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-lg">
                  ไม่พบข้อมูลราคาสำหรับทะเบียน <span className="font-mono font-semibold">{form.licensePlate}</span> — กรอกราคาด้วยตนเอง
                </div>
              )}
              {!form.licensePlate && (
                <div className="mb-4 text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 rounded-lg">
                  เลือกทะเบียนรถก่อนเพื่อดึงราคาอัตโนมัติจาก price-list
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {(["totalPrice","downPayment","monthlyInstallment","totalInstallments"] as const).map((k) => (
                  <div key={k}>
                    <label className="block text-xs text-zinc-400 mb-1">
                      {k === "totalPrice" ? "ราคารถรวม (บาท)" :
                       k === "downPayment" ? "เงินดาวน์ (บาท)" :
                       k === "monthlyInstallment" ? "ค่างวด/เดือน (บาท)" : "จำนวนงวดรวม"}
                    </label>
                    <Input
                      type="number" min="0"
                      value={form[k] || ""}
                      onChange={(e) => set(k, Number(e.target.value))}
                      className="h-9 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
        </>}

        {step === 4 && <>
        {/* ── เอกสารแนบ ── */}
        {(() => {
          const docs = [
            { field: "saleContractUrl"      as const, label: "สัญญาซื้อขาย (PDF)" },
            { field: "promotionDocUrl"      as const, label: "เอกสารแนบท้าย (PDF)" },
            { field: "hireContractUrl"      as const, label: "สัญญาว่าจ้าง (PDF)" },
            { field: "guaranteeContractUrl" as const, label: "สัญญาค้ำประกัน (PDF)" },
            { field: "creditorDocUrl"       as const, label: "เปิดเจ้าหนี้ (PDF)" },
          ]
          const filled = docs.filter((d) => form[d.field]).length
          return (
            <Section title="เอกสารแนบ" badge={filled > 0 ? `${filled} ไฟล์` : undefined}>
              <p className="text-xs text-zinc-400 mb-4">PDF หรือรูปภาพ • สูงสุด 20 MB ต่อไฟล์</p>
              <div className="space-y-3">
                {docs.map(({ field, label }) => {
                  const url  = form[field]
                  const busy = uploadingDoc === field
                  return (
                    <div key={field} className="flex items-center gap-3">
                      <span className="text-sm text-zinc-600 dark:text-zinc-300 w-36 shrink-0">{label}</span>
                      {url ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700">
                          <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 text-xs text-emerald-600 hover:underline truncate"
                          >
                            ดูไฟล์
                          </a>
                          <button
                            type="button"
                            onClick={() => set(field, "")}
                            className="text-zinc-300 hover:text-red-500 transition-colors shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors
                          ${busy
                            ? "border-blue-300 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:border-blue-700"
                            : "border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
                          }`}>
                          {busy ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              <span>กำลังอัปโหลด...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>แนบไฟล์</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            disabled={!!uploadingDoc}
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(field, f); e.target.value = "" }}
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          )
        })()}

        {/* ── หมายเหตุ ── */}
        <Section title="หมายเหตุ">
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="บันทึกหมายเหตุเพิ่มเติม..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700"
          />
        </Section>

        {/* ── สรุปความครบถ้วนของเอกสารทั้ง 3 ฉบับก่อนบันทึก ── */}
        <Section title="ตรวจสอบก่อนบันทึก">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([
              { key: "sale",      label: "สัญญาซื้อขาย" },
              { key: "promo",     label: "แนบท้ายโปรโมชั่น" },
              { key: "hire",      label: "สัญญาว่าจ้าง" },
              { key: "guarantee", label: "สัญญาค้ำประกัน" },
              { key: "vendor",    label: "เปิดเจ้าหนี้" },
            ] as const).map(({ key, label }) => {
              const miss = missCounts[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDocTab(key)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    miss === 0
                      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                      : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
                  } ${docTab === key ? "ring-2 ring-emerald-400" : ""}`}
                >
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</div>
                  <div className={`text-[11px] font-semibold mt-0.5 ${miss === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {miss === 0 ? "✓ ข้อมูลครบ" : `ขาด ${miss} รายการ`}
                  </div>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-zinc-400 mt-3">
            ช่องที่ขาดจะพิมพ์เป็นเส้นประให้เติมด้วยมือ — บันทึกได้เลยแล้วมากรอกเพิ่มทีหลังที่หน้าแก้ไขสัญญา
          </p>
        </Section>
        </>}

        {/* ── Wizard navigation ── */}
        <div className="flex gap-3 pb-10 items-center">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              ← ย้อนกลับ
            </Button>
          )}
          {step < WIZARD_STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep(step + 1)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              ถัดไป: {WIZARD_STEPS[step + 1].title} →
            </Button>
          ) : (
            <Button type="submit" disabled={saving || !isAdmin} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? "กำลังบันทึก..." : "บันทึกสัญญา"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
        </div>
      </form>
        </div>

        {/* ── Preview เอกสารสัญญา (อัปเดตทันทีตามที่กรอก) ── */}
        <div className="hidden xl:block flex-1 min-w-0 sticky top-4">
          <div className="flex items-center justify-between mb-2 gap-3">
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {([
                { key: "sale", label: "สัญญาซื้อขาย" },
                { key: "promo", label: "แนบท้ายโปรโมชั่น" },
                { key: "hire", label: "สัญญาว่าจ้าง" },
                { key: "guarantee", label: "สัญญาค้ำประกัน" },
                { key: "vendor", label: "เปิดเจ้าหนี้" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDocTab(key)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    docTab === key
                      ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {missingDoc.length > 0 ? (
              <span className="text-[11px] font-semibold text-amber-600">
                ข้อมูลเอกสารยังขาดอีก {missingDoc.length} รายการ
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-600">
                ✓ ข้อมูลเอกสารครบถ้วน
              </span>
            )}
          </div>
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-950 p-4">
            <div style={{ zoom: 0.58 }}>
              {docTab === "sale" ? (
                <ContractDocument contract={previewData} />
              ) : docTab === "promo" ? (
                <PromotionAttachment contract={previewData} promo={previewPromo} />
              ) : docTab === "hire" ? (
                <HireContractDocument contract={previewData} />
              ) : docTab === "guarantee" ? (
                <GuaranteeContractDocument contract={previewData} />
              ) : (
                <VendorDocDocument contract={previewData} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
