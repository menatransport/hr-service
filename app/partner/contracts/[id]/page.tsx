/* eslint-disable react-hooks/purity, react-hooks/set-state-in-effect, react/no-unescaped-entities -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { confirm } from "@/components/partner/ui/confirm"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { computeMoney, DERIVED_KEYS } from "@/lib/partner/contract-money"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { Truck, ClipboardList, BarChart3, FileText, AlertTriangle, CheckCircle2, Upload, X, Clock } from "lucide-react"
import { SearchCombobox } from "@/components/partner/search-combobox"
import { missingDocFields, missingHireDocFields, missingGuaranteeDocFields, missingVendorDocFields } from "@/lib/partner/contract-doc"
import { ContractDocument, PromotionAttachment, normPlate, type PromoMaster } from "@/components/partner/contract-document"
import { HireContractDocument } from "@/components/partner/hire-contract-document"
import { GuaranteeContractDocument } from "@/components/partner/guarantee-contract-document"
import { VendorDocDocument } from "@/components/partner/vendor-doc-document"
import { useDebounced } from "@/lib/partner/use-debounced"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { Label } from "@/components/partner/ui/label"
import { formatMoney, formatDate } from "@/lib/partner/utils"
import { ActivityHistory } from "@/components/partner/activity-history"
import type { Contract, Driver, Vehicle } from "@/lib/partner/types"

const CONTRACT_FIELD_LABELS: Record<string, string> = {
  contractDate: "วันที่ทำสัญญา", startDate: "วันที่เริ่ม", buyerName: "ชื่อผู้เช่าซื้อ",
  driverName: "ชื่อผู้ขับขี่", licensePlate: "ทะเบียนรถ", truckNumber: "เบอร์รถ",
  totalPrice: "ราคาขายรถ", downPayment: "เงินดาวน์รวม", cashDown: "ดาวน์ชำระแล้ว",
  remainingInstallment: "ดาวน์คงเหลือ", downInstallmentAmt: "ค่างวดดาวน์", downInstallmentCount: "จำนวนงวดดาวน์",
  financeAmount: "ยอดไฟแนนซ์", monthlyInstallment: "ค่างวด/เดือน", totalInstallments: "จำนวนงวดรวม",
  accountNumber: "เลขที่บัญชี", bankName: "ธนาคาร", nationalId: "เลขบัตร ปชช.", status: "สถานะ",
  guarantorName: "ชื่อผู้ค้ำ", guarantorNationalId: "เลขบัตรผู้ค้ำ",
}

type FieldSpec = { key: keyof Contract; label: string; type?: string; readOnly?: boolean }

const TEXT_FIELDS: FieldSpec[] = [
  { key: "contractCode",  label: "รหัสสัญญา",         readOnly: true },
  { key: "contractDate",  label: "วันที่ทำสัญญา",      type: "date" },
  { key: "startDate",     label: "วันที่เริ่มต้น",      type: "date" },
  { key: "buyerPrefix",   label: "คำนำหน้าผู้เช่าซื้อ" },
  { key: "buyerName",     label: "ชื่อผู้เช่าซื้อ" },
  { key: "driverName",    label: "ชื่อผู้ขับขี่" },
  { key: "phone",         label: "เบอร์โทร",            type: "tel" },
  { key: "bankName",      label: "ธนาคาร" },
  { key: "accountNumber", label: "เลขที่บัญชี" },
  { key: "plant",         label: "แพล้นท์" },
  { key: "truckNumber",   label: "เบอร์รถ" },
  { key: "licensePlate",  label: "ทะเบียนรถ" },
  { key: "vehicleBrand",  label: "ยี่ห้อรถ" },
]

const NUM_FIELDS: FieldSpec[] = [
  { key: "totalPrice",          label: "ราคาขายรถ (บาท)" },
  { key: "downPayment",         label: "เงินดาวน์รวม (บาท)" },
  { key: "cashDown",            label: "เงินดาวน์ชำระแล้ว (บาท)" },
  { key: "remainingInstallment", label: "เงินดาวน์คงเหลือ (บาท)" },
  { key: "downInstallmentAmt",  label: "ค่างวดดาวน์/เดือน (บาท)" },
  { key: "downInstallmentCount", label: "จำนวนงวดดาวน์ (เดือน)" },
  { key: "financeAmount",       label: "ยอดเงินค่างวด (บาท)" },
  { key: "monthlyInstallment",  label: "ค่างวดรายเดือน (บาท)" },
  { key: "totalInstallments",   label: "จำนวนงวดรวม" },
]

// ผู้ค้ำประกัน — ใช้ในเอกสารสัญญาค้ำประกัน (เว้นว่างได้ถ้าไม่มีผู้ค้ำ)
const GUARANTOR_FIELDS: FieldSpec[] = [
  { key: "guarantorName",       label: "ชื่อ – นามสกุล ผู้ค้ำประกัน" },
  { key: "guarantorNationalId", label: "เลขบัตรประชาชนผู้ค้ำประกัน" },
  { key: "guarantorAddress",    label: "ที่อยู่ผู้ค้ำประกัน" },
]

// ข้อมูลที่ใช้ในเอกสารสัญญาซื้อขาย (PDF) — กรอกให้ครบเพื่อให้เอกสารไม่มีช่องว่าง
const DOC_FIELDS: FieldSpec[] = [
  { key: "birthDate",               label: "วันเกิดผู้ซื้อ (คำนวณอายุ)", type: "date" },
  { key: "nationalId",              label: "เลขบัตรประชาชนผู้ซื้อ" },
  { key: "driverAddress",           label: "ที่อยู่ผู้ซื้อ (เลขที่/หมู่/ตำบล/อำเภอ/จังหวัด)" },
  { key: "vehicleType",             label: "ประเภทรถ" },
  { key: "vehicleCharacteristic",   label: "ลักษณะ/มาตรฐาน" },
  { key: "vehicleModel",            label: "รุ่นรถ" },
  { key: "vehicleRegistrationDate", label: "วันจดทะเบียนรถ", type: "date" },
  { key: "vehicleColor",            label: "สีรถ" },
  { key: "chassisNumber",           label: "หมายเลขตัวรถ (ตัวถัง)" },
  { key: "engineNumber",            label: "หมายเลขเครื่องยนต์" },
  { key: "engineSize",              label: "ขนาดกำลังเครื่องยนต์" },
]

// ขั้นตอนแก้ไข — โครงเดียวกับหน้าเพิ่มสัญญา
const WIZARD_STEPS = [
  { title: "ข้อมูลหลัก",      desc: "สัญญา + ประกัน/ภาษี" },
  { title: "สัญญาซื้อขาย",    desc: "ผู้ซื้อ/รถ + การเงิน" },
  { title: "สัญญาค้ำประกัน",  desc: "ผู้ค้ำประกัน" },
  { title: "สรุป & บันทึก",   desc: "หมายเหตุ + ตรวจสอบ" },
]

export default function ContractDetailPage() {
  const { id }             = useParams<{ id: string }>()
  const router             = useRouter()
  const { data: session }  = usePartnerSession()
  const isAdmin            = ["admin", "superadmin"].includes(session?.user?.role ?? "")
  const [form, setForm]    = useState<Contract | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]  = useState(false)
  const [error, setError]  = useState("")
  const [promoList, setPromoList] = useState<PromoMaster[]>([])
  const [docTab, setDocTab] = useState<"sale" | "promo" | "hire" | "guarantee" | "vendor">("sale")
  const [step, setStep] = useState(0)
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [pullDriverId, setPullDriverId] = useState("")
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [pullVehicleId, setPullVehicleId] = useState("")
  const [guarUp, setGuarUp] = useState<string | null>(null)  // field เอกสารผู้ค้ำที่กำลังอัปโหลด
  // รายการผ่อนรถใน driver-ledger (ผ่อนจริง + หลักฐาน) — null = ยังไม่ผูก
  const [ledger, setLedger] = useState<{ debtCode: string; monthsPaid: number; principal: number; paidAmount: number; remaining: number; monthlyAmount: number } | null>(null)
  const [creatingLedger, setCreatingLedger] = useState(false)

  function reloadContract() {
    fetch(`/api/partner/contracts/${id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setForm(d) })
  }

  // สร้างรายการผ่อนรถใน ledger จากสัญญานี้
  async function createVehicleLedger() {
    setCreatingLedger(true); setError("")
    try {
      const res = await fetch("/api/partner/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convertFrom: { type: "contract", id } }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error ?? "สร้างรายการผ่อนรถไม่สำเร็จ"); return }
      reloadContract()
    } finally { setCreatingLedger(false) }
  }

  // อัปโหลดเอกสารผู้ค้ำ → เก็บ url ลง form (บันทึกพร้อมฟอร์มสัญญา)
  async function uploadGuarantorDoc(field: keyof Contract, file: File) {
    setGuarUp(field as string)
    try {
      const fd = new FormData()
      fd.append("file", file); fd.append("folder", "guarantors")
      const up = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!up.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
      const { url } = await up.json()
      setForm((p) => p ? { ...p, [field]: url } : p)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally { setGuarUp(null) }
  }

  // เปลี่ยน step → สลับ preview ไปเอกสารที่เกี่ยวข้อง
  useEffect(() => {
    setDocTab(step === 2 ? "guarantee" : "sale")
  }, [step])

  // คีย์ลัดโหลด PDF: กด 1–5 เปิดหน้าพิมพ์ (auto-print) — ข้ามเมื่อกำลังพิมพ์ในช่องกรอก
  useEffect(() => {
    const routes: Record<string, string> = {
      "1": "document", "2": "promotion-document", "3": "hire-document",
      "4": "guarantee-document", "5": "vendor-document",
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return
      const route = routes[e.key]
      if (!route) return
      e.preventDefault()
      router.push(`/partner/contracts/${id}/${route}?print=1`)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [id, router])

  // ทะเบียนพนักงาน (/drivers) + ทะเบียนรถ (/vehicles) — ใช้ดึงข้อมูลมาเติมในสัญญา
  useEffect(() => {
    fetch("/api/partner/drivers?status=active")
      .then((r) => r.ok ? r.json() : [])
      .then(setDrivers)
    fetch("/api/partner/vehicles")
      .then((r) => r.ok ? r.json() : [])
      .then(setVehicles)
  }, [])

  // merge ข้อมูลพนักงานเข้าฟอร์ม — overwrite=false เติมเฉพาะช่องที่ยังว่าง
  function mergeDriver(d: Driver, overwrite: boolean) {
    const pick = (master?: string, current?: string) =>
      overwrite ? (master || current || "") : (current || master || "")
    setForm((p) => p ? {
      ...p,
      driverId:      d._id ?? p.driverId,
      birthDate:     pick(d.birthDate,     p.birthDate),
      nationalId:    pick(d.nationalId,    p.nationalId),
      driverAddress: pick(d.address,       p.driverAddress),
      phone:         pick(d.phone,         p.phone),
      bankName:      pick(d.bankName,      p.bankName),
      accountNumber: pick(d.accountNumber, p.accountNumber),
    } : p)
  }

  // เดาพนักงานที่ตรงกับสัญญานี้ (driverId ก่อน แล้วค่อยเทียบชื่อ) → เติมช่องว่างให้อัตโนมัติ
  const buyerNameInForm = form?.buyerName ?? ""
  const driverIdInForm  = form?.driverId ?? ""
  useEffect(() => {
    if (!drivers.length || pullDriverId) return
    const match =
      (driverIdInForm && drivers.find((d) => d._id === driverIdInForm)) ||
      drivers.find((d) => `${d.firstName} ${d.lastName}`.trim() === buyerNameInForm.trim())
    if (match?._id) {
      setPullDriverId(match._id)
      mergeDriver(match, false)   // ดึงอัตโนมัติ: เติมเฉพาะช่องที่ยังว่าง
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, buyerNameInForm, driverIdInForm, pullDriverId])

  // merge ข้อมูลรถเข้าฟอร์ม — overwrite=false เติมเฉพาะช่องที่ยังว่าง
  function mergeVehicle(v: Vehicle, overwrite: boolean) {
    const pick = (master?: string, current?: string) =>
      overwrite ? (master || current || "") : (current || master || "")
    setForm((p) => p ? {
      ...p,
      vehicleId:               v._id ?? p.vehicleId,
      licensePlate:            pick(v.licensePlate,     p.licensePlate),
      truckNumber:             pick(v.truckNumber,      p.truckNumber),
      vehicleType:             pick(v.vehicleType,      p.vehicleType),
      vehicleCharacteristic:   pick(v.characteristic,   p.vehicleCharacteristic),
      vehicleBrand:            pick(v.brand,            p.vehicleBrand),
      vehicleModel:            pick(v.model,            p.vehicleModel),
      vehicleRegistrationDate: pick(v.registrationDate, p.vehicleRegistrationDate),
      vehicleColor:            pick(v.color,            p.vehicleColor),
      chassisNumber:           pick(v.chassisNumber,    p.chassisNumber),
      engineNumber:            pick(v.engineNumber,     p.engineNumber),
      engineSize:              pick(v.engineSize,       p.engineSize),
    } : p)
  }

  // เดารถที่ตรงกับสัญญานี้ (vehicleId ก่อน แล้วค่อยเทียบทะเบียน) → เติมช่องว่างให้อัตโนมัติ
  const plateInForm     = form?.licensePlate ?? ""
  const vehicleIdInForm = form?.vehicleId ?? ""
  useEffect(() => {
    if (!vehicles.length || pullVehicleId) return
    const match =
      (vehicleIdInForm && vehicles.find((v) => v._id === vehicleIdInForm)) ||
      vehicles.find((v) => (v.licensePlate ?? "").trim() === plateInForm.trim())
    if (match?._id) {
      setPullVehicleId(match._id)
      mergeVehicle(match, false)   // ดึงอัตโนมัติ: เติมเฉพาะช่องที่ยังว่าง
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, plateInForm, vehicleIdInForm, pullVehicleId])

  // เลือกพนักงาน/รถจาก combobox ในฟอร์ม → เติมข้อมูลทับทันที
  function handlePickDriver(d: Driver | null) {
    if (!d) {
      setPullDriverId("")
      setForm((p) => p ? { ...p, driverId: "", buyerName: "", driverName: "" } : p)
      return
    }
    if (d._id) setPullDriverId(d._id)
    const name = `${d.firstName} ${d.lastName}`.trim()
    setForm((p) => p ? { ...p, driverId: d._id ?? "", buyerName: name, driverName: name } : p)
    mergeDriver(d, true)
  }

  function handlePickVehicle(v: Vehicle | null) {
    if (!v) {
      setPullVehicleId("")
      setForm((p) => p ? { ...p, vehicleId: "", licensePlate: "" } : p)
      return
    }
    if (v._id) setPullVehicleId(v._id)
    mergeVehicle(v, true)
  }

  // ข้อมูลที่ยังขาดในตัว master เอง → ชี้ให้ไปแก้ที่ต้นทางได้เลย
  const pulledDriver  = drivers.find((d) => d._id === pullDriverId)
  const pulledVehicle = vehicles.find((v) => v._id === pullVehicleId)
  const driverMasterMissing = pulledDriver
    ? ([
        [!pulledDriver.birthDate,  "วันเกิด"],
        [!pulledDriver.nationalId, "เลขบัตรประชาชน"],
        [!pulledDriver.address,    "ที่อยู่"],
        [!pulledDriver.phone,      "เบอร์โทร"],
        [!(pulledDriver.bankName && pulledDriver.accountNumber), "บัญชีธนาคาร"],
      ] as [boolean, string][]).filter(([miss]) => miss).map(([, label]) => label)
    : []
  const vehicleMasterMissing = pulledVehicle
    ? ([
        [!pulledVehicle.vehicleType,      "ประเภทรถ"],
        [!pulledVehicle.characteristic,   "ลักษณะ"],
        [!pulledVehicle.brand,            "ยี่ห้อ"],
        [!pulledVehicle.model,            "รุ่น"],
        [!pulledVehicle.registrationDate, "วันจดทะเบียน"],
        [!pulledVehicle.color,            "สีรถ"],
        [!pulledVehicle.chassisNumber,    "เลขตัวถัง"],
        [!pulledVehicle.engineNumber,     "เลขเครื่อง"],
        [!pulledVehicle.engineSize,       "ขนาดเครื่องยนต์"],
      ] as [boolean, string][]).filter(([miss]) => miss).map(([, label]) => label)
    : []

  useEffect(() => {
    fetch(`/api/partner/contracts/${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setForm(d) })
    fetch("/api/partner/promotions/master")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setPromoList(d))
  }, [id])

  // ดึงสถานะการผ่อนจริงจาก ledger เมื่อสัญญาผูกแล้ว
  useEffect(() => {
    if (!form?.ledgerDebtCode || !form?.contractCode) { setLedger(null); return }
    fetch(`/api/partner/ledger?contractCode=${encodeURIComponent(form.contractCode)}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Array<Record<string, unknown>>) => {
        const e = rows.find((x) => x.debtCode === form.ledgerDebtCode)
          ?? rows.find((x) => (x.source as { type?: string } | undefined)?.type === "vehicle_installment")
        setLedger(e ? {
          debtCode:     e.debtCode as string,
          monthsPaid:   (e.monthsPaid as number) ?? 0,
          principal:    (e.principal as number) ?? 0,
          paidAmount:   (e.paidAmount as number) ?? 0,
          remaining:    (e.remaining as number) ?? 0,
          monthlyAmount:(e.monthlyAmount as number) ?? 0,
        } : null)
      })
      .catch(() => setLedger(null))
  }, [form?.ledgerDebtCode, form?.contractCode])

  // ทุกข้อมูลที่ปรากฏในเอกสารสัญญา = จำเป็นต้องกรอก → ไฮไลต์ช่องที่ยังขาด
  const missingDoc  = missingDocFields(form)
  // จำนวนข้อมูลที่ยังขาดของแต่ละเอกสาร — ใช้ในสรุปขั้นตอนสุดท้าย
  const missCounts = {
    sale:      missingDocFields(form).length,
    // แนบท้ายโปรโมชั่น: นับจาก promotion_master (ไม่มี record = ขาด 3, มี = นับ pro1/2/3 ที่ว่าง)
    promo:     (() => {
      const mp = promoList.find((p) => normPlate(p.licensePlate) === normPlate(form?.licensePlate ?? "")) ?? null
      return mp ? [mp.pro1TotalValue, mp.pro2RepairBudget, mp.pro3AnnualPm].filter((v) => v == null).length : 3
    })(),
    hire:      missingHireDocFields(form).length,
    guarantee: missingGuaranteeDocFields(form).length,
    vendor:    missingVendorDocFields(form).length,
  }
  const missingKeys = new Set(missingDoc.map((f) => f.key))
  const missingCls = (key: keyof Contract) =>
    missingKeys.has(key)
      ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50 dark:bg-amber-950/30 placeholder:text-amber-400"
      : ""

  function strField(key: keyof Contract, type = "text", readOnly = false) {
    return {
      value: String(form?.[key] ?? ""),
      type,
      disabled: !isAdmin || readOnly,
      className: missingCls(key),
      placeholder: missingKeys.has(key) ? "จำเป็นต้องกรอก" : undefined,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((p) => p ? { ...p, [key]: e.target.value } : p),
    }
  }

  function numField(key: keyof Contract) {
    return {
      value: String(form?.[key] ?? 0),
      type: "number",
      min: "0",
      step: "any",   // อนุญาตทศนิยม (เช่น ค่างวด 2,222.22) — กัน native validation บล็อกการบันทึก
      disabled: !isAdmin,
      className: missingCls(key),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((p) => p ? { ...p, [key]: Number(e.target.value) } : p),
    }
  }

  // วันที่ = ปฏิทิน พ.ศ. (เก็บ ค.ศ. ISO), ที่เหลือเป็น input ปกติ
  function dateOrInput(key: keyof Contract, type = "text", readOnly = false) {
    if (type === "date") return (
      <ThaiDateInput
        value={String(form?.[key] ?? "")}
        onChange={(iso) => setForm((p) => p ? { ...p, [key]: iso } : p)}
        disabled={!isAdmin || readOnly}
        className={missingCls(key)}
      />
    )
    // เลขบัตรประชาชน (ผู้ซื้อ/ผู้ค้ำ) = ตัวเลขล้วน สูงสุด 13 หลัก + โชว์ตัวนับถ้ายังไม่ครบ
    if (key === "nationalId" || key === "guarantorNationalId") {
      const v = String(form?.[key] ?? "")
      return (
        <>
          <Input
            {...strField(key, "text", readOnly)}
            inputMode="numeric"
            maxLength={13}
            className={`font-mono tracking-wider ${missingCls(key)}`}
            onChange={(e) => setForm((p) => p ? { ...p, [key]: e.target.value.replace(/\D/g, "").slice(0, 13) } : p)}
          />
          {v.length > 0 && v.length !== 13 && (
            <p className="text-[10px] text-amber-600 mt-0.5">{v.length}/13 หลัก</p>
          )}
        </>
      )
    }
    return <Input {...strField(key, type, readOnly)} />
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !isAdmin) return
    // เลขบัตร ปชช. เว้นว่างได้ แต่ถ้ากรอกต้องเป็นตัวเลข 13 หลักพอดี
    if (form.nationalId && !/^\d{13}$/.test(form.nationalId)) {
      setError("ถ้ากรอกเลขบัตรประชาชนผู้ซื้อ ต้องเป็นตัวเลข 13 หลัก"); setStep(1); return
    }
    if (form.guarantorNationalId && !/^\d{13}$/.test(form.guarantorNationalId)) {
      setError("ถ้ากรอกเลขบัตรประชาชนผู้ค้ำประกัน ต้องเป็นตัวเลข 13 หลัก"); setStep(2); return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`/api/partner/contracts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // ช่องที่คำนวณได้ให้ยึดสูตรเสมอ (form อาจถือค่าเก่าที่ไม่ตรงสูตรอยู่)
        body: JSON.stringify({ ...form, ...computeMoney(form) }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "เกิดข้อผิดพลาด"); return }
      // อยู่หน้าเดิมหลังบันทึก — โชว์สถานะ "บันทึกแล้ว" ชั่วครู่แทนการเด้งกลับหน้ารายการ
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  // debounce เอกสาร A4 ในพรีวิว — พิมพ์แล้วไม่ re-render ทุกตัวอักษร
  // ต้องเรียก hook ก่อน early-return เสมอ (Rules of Hooks): ถ้าเรียกหลัง `if (!form) return`
  // จำนวน hook จะไม่คงที่ระหว่าง render (form: null → โหลดเสร็จ) → React crash ทั้งหน้า
  const debouncedForm = useDebounced(form, 200)

  if (!form) return <div className="text-zinc-400 text-sm">กำลังโหลด...</div>

  // ผ่าน guard แล้ว form ไม่เป็น null; debounce อาจ lag ชั่วครู่ตอนโหลดครั้งแรก → fallback เป็น form
  const previewData = debouncedForm ?? form

  const paid = form.totalPrice && form.downPayment && form.totalInstallments && form.monthlyInstallment
    ? form.downPayment + form.monthlyInstallment * form.totalInstallments
    : null

  return (
    <div className="max-w-[1500px]">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">สัญญา {form.contractCode}</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{form.buyerName} · {form.licensePlate}</p>
        <div className="flex gap-2 mt-3">
          <Link
            href={`/partner/trips?q=${encodeURIComponent(form.contractCode)}`}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5"
          >
            <Truck className="w-3.5 h-3.5" /> รายเที่ยว
          </Link>
          <Link
            href={`/partner/payroll?q=${encodeURIComponent(form.contractCode)}`}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5"
          >
            <ClipboardList className="w-3.5 h-3.5" /> ประวัติเงินเดือน
          </Link>
          <Link
            href={`/partner/promotions/${form.contractCode}`}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-1.5"
          >
            <BarChart3 className="w-3.5 h-3.5" /> โปรโมชั่น
          </Link>
          <ActivityHistory
            entity="contract"
            entityId={form.contractCode}
            fieldLabels={CONTRACT_FIELD_LABELS}
            actionLabels={{ edit: "แก้ไขสัญญา" }}
          />
          <ActivityHistory
            entity="contract_attachment"
            entityId={form.contractCode}
            label="ประวัติเอกสารแนบ"
            fieldLabels={{ saleContractUrl: "สัญญาซื้อขาย", promotionDocUrl: "แนบท้าย", hireContractUrl: "ว่าจ้าง", guaranteeContractUrl: "ค้ำประกัน", creditorDocUrl: "เปิดเจ้าหนี้" }}
            actionLabels={{ attach: "แนบไฟล์", remove: "ลบไฟล์" }}
          />
          <Link
            href={`/partner/contracts/${id}/document`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> สัญญาซื้อขาย (PDF)
            <kbd className="ml-1 text-[9px] font-mono leading-none px-1 py-0.5 rounded bg-white/80 border border-emerald-300 text-emerald-700">1</kbd>
          </Link>
          <Link
            href={`/partner/contracts/${id}/promotion-document`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> เอกสารแนบท้าย (PDF)
            <kbd className="ml-1 text-[9px] font-mono leading-none px-1 py-0.5 rounded bg-white/80 border border-emerald-300 text-emerald-700">2</kbd>
          </Link>
          <Link
            href={`/partner/contracts/${id}/hire-document`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> สัญญาว่าจ้าง (PDF)
            <kbd className="ml-1 text-[9px] font-mono leading-none px-1 py-0.5 rounded bg-white/80 border border-emerald-300 text-emerald-700">3</kbd>
          </Link>
          <Link
            href={`/partner/contracts/${id}/guarantee-document`}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
          >
            <FileText className="w-3.5 h-3.5" /> สัญญาค้ำประกัน (PDF)
            <kbd className="ml-1 text-[9px] font-mono leading-none px-1 py-0.5 rounded bg-white/80 border border-emerald-300 text-emerald-700">4</kbd>
          </Link>
          <a
            href="/partner/vendor-open-form.pdf"
            download="แบบฟอร์มเอกสารเปิดเจ้าหนี้รายใหม่.pdf"
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-300 bg-emerald-50 rounded-lg px-3 py-1.5"
            title="ดาวน์โหลดแบบฟอร์มเปิดเจ้าหนี้ (ฟอร์มเปล่า)"
          >
            <FileText className="w-3.5 h-3.5" /> เปิดเจ้าหนี้ (PDF)
          </a>
        </div>
      </div>

      {/* ความครบถ้วนของข้อมูลเอกสารสัญญา — ทุกช่องในสัญญาจำเป็นต้องกรอก */}
      {missingDoc.length > 0 ? (
        <div className="mb-6 rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            ข้อมูลเอกสารสัญญายังไม่ครบ — ขาดอีก {missingDoc.length} รายการ (ทุกข้อมูลในสัญญาจำเป็นต้องกรอก)
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {missingDoc.map((f) => (
              <span key={f.key} className="text-[11px] font-medium bg-white dark:bg-zinc-900 text-amber-800 dark:text-amber-300 border border-amber-300 rounded-full px-2.5 py-0.5">
                {f.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
            ช่องที่ต้องกรอกถูกไฮไลต์เป็นสีเหลืองในฟอร์มด้านล่าง — กรอกแล้วกดบันทึก
          </p>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" /> ข้อมูลเอกสารสัญญาครบถ้วน — พร้อมออกเอกสารจริง
        </div>
      )}

      {/* ── ซ้าย: ฟอร์ม | ขวา: preview สัญญาสด ── */}
      <div className="flex gap-6 items-start">
        <div className="w-full xl:max-w-2xl min-w-0 shrink-0 xl:w-[42rem]">

      {/* ── Stepper: 4 ขั้นตอนตามเอกสารสัญญา ── */}
      <div className="mb-6 flex items-center">
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.title} className={`flex items-center ${i < WIZARD_STEPS.length - 1 ? "flex-1" : ""}`}>
            <button type="button" onClick={() => setStep(i)} className="flex items-center gap-2 group">
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

      {/* Installment summary card */}
      {step === 0 && form.totalPrice > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-xs text-zinc-400 mb-1">ราคาขาย</p>
              <p className="text-lg font-bold">{formatMoney(form.totalPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-1">งวดละ / จำนวนงวด</p>
              <p className="text-lg font-bold">{formatMoney(form.monthlyInstallment)} <span className="text-sm font-normal text-zinc-400">× {form.totalInstallments} งวด</span></p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 mb-1">รวมที่ต้องชำระ</p>
              <p className="text-lg font-bold text-emerald-600">{paid ? formatMoney(paid) : "-"}</p>
            </div>
          </div>
          {/* สถานะการผ่อน — ถ้าผูก ledger แล้วใช้ของจริง, ไม่งั้นเป็นการประมาณ */}
          {form.monthlyInstallment > 0 && form.totalInstallments > 0 && (() => {
            if (ledger) {
              // ── ผ่อนจริงจาก driver-ledger (นับการจ่ายจริง + หลักฐาน) ──
              const total = form.totalInstallments
              const paidN = Math.min(ledger.monthsPaid, total)
              const remainN = total - paidN
              const pct = Math.round((paidN / total) * 100)
              return (
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">
                      ● ผ่อนจริง (จาก ledger)
                    </span>
                    <a href={`/partner/driver-ledger?q=${encodeURIComponent(ledger.debtCode)}`}
                       className="text-[11px] font-semibold text-emerald-600 hover:underline">
                      บันทึกจ่าย / ดูหลักฐาน →
                    </a>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                    <span>ผ่อนไปแล้ว {paidN}/{total} งวด ({pct}%) · จ่ายจริง {formatMoney(ledger.paidAmount)} บาท</span>
                    <span>คงเหลือ <span className="font-semibold text-zinc-700 dark:text-zinc-300">{remainN} งวด · {formatMoney(ledger.remaining)} บาท</span></span>
                  </div>
                  <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            }
            // ── ยังไม่ผูก ledger → ประมาณจากปฏิทิน + ปุ่มสร้าง ──
            const start = new Date(form.startDate)
            const now = new Date()
            const monthsPassed = form.startDate ? Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())) : 0
            const monthsPaid = Math.min(monthsPassed, form.totalInstallments)
            const remaining = form.totalInstallments - monthsPaid
            const remainingAmt = remaining * form.monthlyInstallment
            const pct = Math.round((monthsPaid / form.totalInstallments) * 100)
            return (
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">
                    ประมาณตามปฏิทิน
                  </span>
                  <button
                    type="button"
                    onClick={createVehicleLedger}
                    disabled={creatingLedger}
                    className="text-[11px] font-semibold text-emerald-600 hover:underline disabled:opacity-50"
                    title="สร้างรายการผ่อนรถใน driver-ledger เพื่อบันทึกการจ่ายจริง + แนบหลักฐาน"
                  >
                    {creatingLedger ? "กำลังสร้าง..." : "+ สร้างรายการผ่อนรถ (บันทึกจ่ายจริง)"}
                  </button>
                </div>
                <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                  <span>ผ่อนไปแล้ว {monthsPaid}/{form.totalInstallments} งวด ({pct}%)</span>
                  <span>คงเหลือ <span className="font-semibold text-zinc-700 dark:text-zinc-300">{remaining} งวด · {formatMoney(remainingAmt)} บาท</span></span>
                </div>
                <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ภาษี & ประกันภัย — ย้ายไปจัดการตามทะเบียนรถที่ /insurance-tax (การ์ดนี้ read-only) */}
      {/* 🔒 ล็อคสัญญา — ล็อคแล้วห้ามแก้ทุกคนจนกว่าแอดมินจะปลด */}
      {step === 0 && (
        <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
          form.locked
            ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30"
            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
        }`}>
          <div className="text-xs">
            {form.locked ? (
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                🔒 สัญญาถูกล็อคโดย {form.locked.by} เมื่อ {`${new Date(form.locked.at).getDate()}/${new Date(form.locked.at).getMonth() + 1}/${new Date(form.locked.at).getFullYear()}/${new Date(form.locked.at).getFullYear() + 543}`} — แก้ไข/แนบไฟล์ไม่ได้จนกว่าจะปลดล็อค
              </span>
            ) : (
              <span className="text-zinc-500">สัญญายังไม่ถูกล็อค — แอดมินล็อคได้เพื่อกันการแก้ไข</span>
            )}
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={async () => {
                const r = await fetch(`/api/partner/contracts/${id}/lock`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ locked: !form.locked }),
                })
                if (r.ok) reloadContract()
                else setError((await r.json().catch(() => ({}))).error ?? "ล็อคไม่สำเร็จ")
              }}
              className={`shrink-0 text-xs font-semibold rounded-lg px-3 py-1.5 border ${
                form.locked
                  ? "text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
                  : "text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
              }`}
            >
              {form.locked ? "🔓 ปลดล็อค" : "🔒 ล็อคสัญญา"}
            </button>
          )}
        </div>
      )}
      {/* ปิดงวดเอง (ผ่อนครบ) — สัญญา active ⇄ completed; คนขับขึ้นแท็บ "Active (ปิดงวดแล้ว)" */}
      {step === 0 && (
        <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
          form.status === "completed"
            ? "border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30"
            : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
        }`}>
          <div className="text-xs">
            {form.status === "completed" ? (
              <span className="font-semibold text-sky-700 dark:text-sky-300">✅ ปิดงวดแล้ว (ผ่อนครบ) — คนขับอยู่ในกลุ่ม Active (ปิดงวดแล้ว)</span>
            ) : form.status === "terminated" ? (
              <span className="font-semibold text-rose-600">สัญญาถูกยกเลิก</span>
            ) : (
              <span className="text-zinc-500">ค่างวดรถ: ระบบนับจาก ledger อัตโนมัติ — ถ้าผ่อนครบแล้วแต่ยังไม่ขึ้น กด "ปิดงวด" ได้เลย</span>
            )}
          </div>
          {form.status !== "terminated" && (
            <button
              type="button"
              onClick={async () => {
                const reopen = form.status === "completed"
                const ok = await confirm(reopen
                  ? { title: "เปิดสัญญาใหม่?", description: `${form.contractCode} จะกลับเป็นสถานะใช้งาน (ผ่อนชำระ)`, confirmText: "เปิดใหม่" }
                  : { title: "ปิดงวดสัญญานี้?", description: `${form.contractCode} — ยืนยันว่าผ่อนชำระค่างวดรถครบแล้ว คนขับจะย้ายไปกลุ่ม Active (ปิดงวดแล้ว)`, confirmText: "ปิดงวด (ผ่อนครบ)" })
                if (!ok) return
                const r = await fetch(`/api/partner/contracts/${id}/close`, {
                  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reopen }),
                })
                if (r.ok) { toast.success(reopen ? "เปิดสัญญาใหม่แล้ว" : "ปิดงวดแล้ว"); reloadContract() }
                else toast.error((await r.json().catch(() => ({}))).error ?? "ไม่สำเร็จ")
              }}
              className={`shrink-0 text-xs font-semibold rounded-lg px-3 py-1.5 border ${
                form.status === "completed"
                  ? "text-zinc-600 border-zinc-300 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300"
                  : "text-sky-700 border-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-300"
              }`}
            >
              {form.status === "completed" ? "เปิดสัญญาใหม่" : "✅ ปิดงวด (ผ่อนครบ)"}
            </button>
          )}
        </div>
      )}
      {step === 0 && <InsuranceTaxCard plate={form.licensePlate} />}
      {step === 0 && <ContractAttachments contractId={id} />}

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        {step === 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-4">ข้อมูลสัญญา</h2>
          <div className="grid grid-cols-2 gap-4">
            {TEXT_FIELDS.map(({ key, label, type, readOnly }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                {key === "buyerPrefix" ? (
                  <select
                    value={String(form.buyerPrefix ?? "นาย")}
                    disabled={!isAdmin}
                    onChange={(e) => setForm((p) => p ? { ...p, buyerPrefix: e.target.value } : p)}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50 dark:border-zinc-700"
                  >
                    {["นาย", "นาง", "นางสาว"].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : key === "buyerName" && isAdmin ? (
                  <>
                    <SearchCombobox<Driver>
                      items={drivers}
                      selected={
                        pulledDriver ??
                        (form.buyerName
                          ? ({ _id: "__current__", firstName: form.buyerName, lastName: "", status: "active" } as Driver)
                          : null)
                      }
                      onSelect={handlePickDriver}
                      getLabel={(d) => `${d.firstName} ${d.lastName}`.trim()}
                      getSub={(d) => d.staffCode ?? ""}
                      placeholder="พิมพ์ชื่อ นามสกุล หรือรหัสพนักงาน..."
                      searchKeys={(d) => [d.firstName, d.lastName, d.staffCode ?? "", d.nationalId ?? "", d.phone ?? ""]}
                    />
                    {pulledDriver && driverMasterMissing.length > 0 && (
                      <Link
                        href={`/partner/drivers/${pullDriverId}`}
                        target="_blank"
                        className="flex items-start gap-1 text-[10px] text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                        <span>ทะเบียนพนักงานยังขาด: {driverMasterMissing.join(", ")} — คลิกไปกรอก →</span>
                      </Link>
                    )}
                  </>
                ) : key === "licensePlate" && isAdmin ? (
                  <>
                    <SearchCombobox<Vehicle>
                      items={vehicles}
                      selected={
                        pulledVehicle ??
                        (form.licensePlate
                          ? ({ _id: "__current__", licensePlate: form.licensePlate } as Vehicle)
                          : null)
                      }
                      onSelect={handlePickVehicle}
                      getLabel={(v) => v.licensePlate ?? ""}
                      getSub={(v) => [v.truckNumber, v.brand].filter(Boolean).join(" · ")}
                      placeholder="พิมพ์ทะเบียน เบอร์รถ หรือยี่ห้อ..."
                      searchKeys={(v) => [v.licensePlate ?? "", v.truckNumber ?? "", v.brand ?? "", v.model ?? "", v.chassisNumber ?? ""]}
                    />
                    {pulledVehicle && vehicleMasterMissing.length > 0 && (
                      <Link
                        href={`/partner/vehicles?edit=${pullVehicleId}`}
                        target="_blank"
                        className="flex items-start gap-1 text-[10px] text-amber-600 hover:text-amber-700 hover:underline"
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-px" />
                        <span>ทะเบียนรถยังขาด: {vehicleMasterMissing.join(", ")} — คลิกไปกรอก →</span>
                      </Link>
                    )}
                  </>
                ) : (
                  dateOrInput(key, type ?? "text", readOnly)
                )}
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">สถานะ</Label>
              <select
                value={String(form.status ?? "active")}
                disabled={!isAdmin}
                onChange={(e) => setForm((p) => p ? { ...p, status: e.target.value as Contract["status"] } : p)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm disabled:opacity-50"
              >
                <option value="active">ใช้งาน</option>
                <option value="completed">สิ้นสุด</option>
                <option value="terminated">ยกเลิก</option>
              </select>
            </div>
          </div>
        </div>
        )}

        {step === 1 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-1">ข้อมูลผู้ซื้อ / รถ (สำหรับเอกสารสัญญา)</h2>
          <p className="text-xs text-zinc-400 mb-4">กรอกให้ครบเพื่อให้เอกสารสัญญา (PDF) ไม่มีช่องว่างให้เติมมือ</p>

          {/* เลือกพนักงาน/ทะเบียนรถได้จากช่อง "ชื่อผู้เช่าซื้อ" และ "ทะเบียนรถ" ใน ข้อมูลสัญญา (ขั้นตอนที่ 1) */}
          <div className="grid grid-cols-2 gap-4">
            {DOC_FIELDS.map(({ key, label, type, readOnly }) => (
              <div key={key} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                {dateOrInput(key, type ?? "text", readOnly)}
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">ระยะทางที่ใช้แล้ว (กม.)</Label>
              <Input {...numField("mileage")} />
            </div>
          </div>
        </div>
        )}

        {step === 2 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-1">ผู้ค้ำประกัน (สำหรับสัญญาค้ำประกัน)</h2>
          <p className="text-xs text-zinc-400 mb-4">เว้นว่างได้ถ้าไม่มีผู้ค้ำประกัน — เอกสารจะพิมพ์เป็นเส้นประให้เติมมือ</p>
          <div className="grid grid-cols-2 gap-4">
            {GUARANTOR_FIELDS.map(({ key, label }) => (
              <div key={key} className={`space-y-1 ${key === "guarantorAddress" ? "col-span-2" : ""}`}>
                <Label className="text-xs">{label}</Label>
                {dateOrInput(key)}
              </div>
            ))}
          </div>

          {/* เอกสารผู้ค้ำ — แนบท้าย PDF สัญญาค้ำประกัน (รูป jpg/png) */}
          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 mb-2">เอกสารผู้ค้ำ (แนบท้าย PDF สัญญาค้ำประกัน)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {([
                { key: "guarantorIdCardUrl",   label: "บัตรประชาชน" },
                { key: "guarantorHouseRegUrl", label: "ทะเบียนบ้าน" },
                { key: "guarantorSalaryUrl",   label: "สลิปเงินเดือน" },
                { key: "guarantorWorkCertUrl", label: "หนังสือรับรองงาน" },
              ] as { key: keyof Contract; label: string }[]).map(({ key, label }) => {
                const url = form[key] as string | undefined
                const isBusy = guarUp === key
                return (
                  <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
                    <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{label}</span>
                    {url ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline">
                          <FileText className="w-3 h-3" /> เปิด
                        </a>
                        <button type="button" title={`ลบ${label}`}
                          onClick={() => setForm((p) => p ? { ...p, [key]: "" } : p)}
                          className="text-zinc-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                      </span>
                    ) : (
                      <label className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-dashed cursor-pointer shrink-0 ${isBusy ? "border-blue-300 text-blue-600" : "border-zinc-300 dark:border-zinc-600 text-zinc-400 hover:border-emerald-400 hover:text-emerald-600"}`}>
                        {isBusy ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                        แนบไฟล์
                        <input type="file" accept="image/*,.pdf" className="hidden" disabled={isBusy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGuarantorDoc(key, f); e.target.value = "" }} />
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-zinc-400 mt-2">* รูป jpg/png จะถูกต่อเป็นหน้าท้าย PDF สัญญาค้ำประกัน (บันทึกสัญญาก่อนจึงจะมีผล)</p>
          </div>
        </div>
        )}

        {step === 1 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-4">ข้อมูลการเงิน</h2>
          <p className="text-xs text-zinc-500 mb-4">
            กรอกได้เฉพาะ <b>เงินดาวน์ชำระแล้ว</b> · ช่องที่เหลือคำนวณให้อัตโนมัติ
            ส่วนราคาขาย/เงินดาวน์รวม/จำนวนงวด แก้ที่หน้า <Link href="/partner/price-list" className="underline">ราคาขาย</Link> แล้วกดดึงราคาใหม่
          </p>
          <div className="grid grid-cols-2 gap-4">
            {NUM_FIELDS.map(({ key, label }) => {
              const derived = (DERIVED_KEYS as readonly string[]).includes(key)
              const calc = computeMoney(form)[key as keyof ReturnType<typeof computeMoney>]
              const stored = Number(form[key] ?? 0) || 0
              const changed = derived && Math.abs(calc - stored) > 1
              return (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">
                    {label}
                    {derived && <span className="ml-1 text-[10px] text-zinc-400">คำนวณอัตโนมัติ</span>}
                  </Label>
                  {key === "cashDown"
                    ? <Input {...numField(key)} />
                    : <Input
                        value={derived ? String(calc) : String(form[key] ?? 0)}
                        readOnly disabled type="number"
                        className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-300"
                      />}
                  {changed && (
                    <p className="text-[11px] text-amber-600">
                      ค่าเดิมในสัญญา {formatMoney(stored)} — กดบันทึกแล้วจะเปลี่ยนเป็น {formatMoney(calc)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {step === 3 && (<>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-4">หมายเหตุ</h2>
          <textarea
            value={String(form.notes ?? "")}
            disabled={!isAdmin}
            onChange={(e) => setForm((p) => p ? { ...p, notes: e.target.value } : p)}
            rows={4}
            placeholder="บันทึกหมายเหตุเพิ่มเติม..."
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-y disabled:opacity-50 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* ── สรุปความครบถ้วนของเอกสารทั้ง 3 ฉบับ ── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400 mb-4">ความครบถ้วนของเอกสาร</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {([
              { key: "sale",      label: "สัญญาซื้อขาย",   href: `/partner/contracts/${id}/document` },
              { key: "promo",     label: "แนบท้ายโปรโมชั่น", href: `/partner/contracts/${id}/promotion-document` },
              { key: "hire",      label: "สัญญาว่าจ้าง",   href: `/partner/contracts/${id}/hire-document` },
              { key: "guarantee", label: "สัญญาค้ำประกัน", href: `/partner/contracts/${id}/guarantee-document` },
              { key: "vendor",    label: "เปิดเจ้าหนี้",   href: `/partner/contracts/${id}/vendor-document` },
            ] as const).map(({ key, label, href }) => {
              const miss = missCounts[key]
              return (
                <div
                  key={key}
                  className={`rounded-lg border px-3 py-2.5 ${
                    miss === 0
                      ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                      : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
                  }`}
                >
                  <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</div>
                  <div className={`text-[11px] font-semibold mt-0.5 ${miss === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {miss === 0 ? "✓ ข้อมูลครบ" : `ขาด ${miss} รายการ`}
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    <button type="button" onClick={() => setDocTab(key)} className="text-[10px] text-zinc-500 underline hover:text-zinc-700">
                      ดูตัวอย่าง
                    </button>
                    <Link href={href} className="text-[10px] text-emerald-600 underline hover:text-emerald-700">
                      พิมพ์ PDF
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        </>)}

        <div className="flex gap-3 items-center">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              ← ย้อนกลับ
            </Button>
          )}
          {step < WIZARD_STEPS.length - 1 && (
            <Button type="button" onClick={() => setStep(step + 1)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              ถัดไป: {WIZARD_STEPS[step + 1].title} →
            </Button>
          )}
          {isAdmin && (
            <Button
              type="submit"
              disabled={saving}
              className={step === WIZARD_STEPS.length - 1
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : ""}
              variant={step === WIZARD_STEPS.length - 1 ? "default" : "outline"}
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="w-4 h-4" /> บันทึกแล้ว
            </span>
          )}
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
            <Link
              href={`/partner/contracts/${id}/${docTab === "sale" ? "document" : docTab === "promo" ? "promotion-document" : docTab === "hire" ? "hire-document" : docTab === "guarantee" ? "guarantee-document" : "vendor-document"}`}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline whitespace-nowrap"
            >
              เปิดหน้าพิมพ์ / PDF →
            </Link>
          </div>
          <div className="max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-200 dark:bg-zinc-950 p-4">
            <div style={{ zoom: 0.58 }}>
              {docTab === "sale" ? (
                <ContractDocument contract={previewData} />
              ) : docTab === "promo" ? (
                <PromotionAttachment
                  contract={previewData}
                  promo={promoList.find((p) => normPlate(p.licensePlate) === normPlate(previewData.licensePlate)) ?? null}
                />
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

// ── การ์ดภาษี & ประกันภัย (read-only) — จัดการตามทะเบียนรถที่ /insurance-tax (แยก 4 รายการ) ──
const IT_LABELS: Record<string, string> = {
  insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษีทะเบียน", inspection: "ตรวจสภาพ",
}
type ItItem = {
  itemType?: string; effectiveDate?: string; expiryDate?: string; amount?: number
  company?: string; installmentCount?: number; monthlyInstallment?: number; status?: string
}
function InsuranceTaxCard({ plate }: { plate?: string }) {
  const [items, setItems] = useState<ItItem[] | null | undefined>(undefined) // undefined = กำลังโหลด
  useEffect(() => {
    if (!plate) { setItems(null); return }
    fetch(`/api/partner/insurance-tax?plate=${encodeURIComponent(plate)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems((d.items ?? d.cycles ?? []) as ItItem[]))
      .catch(() => setItems(null))
  }, [plate])

  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
  const manageLink = `/partner/insurance-tax${plate ? `?q=${encodeURIComponent(plate)}` : ""}`

  // รายการล่าสุดต่อประเภท (ข้าม renewed ถ้ามี active)
  const latest: Record<string, ItItem | undefined> = {}
  for (const it of items ?? []) {
    const t = it.itemType ?? ""
    if (!t) continue
    if (!latest[t] || (latest[t]!.status === "renewed" && it.status !== "renewed")) {
      if (!latest[t]) latest[t] = it
      else if (latest[t]!.status === "renewed" && it.status !== "renewed") latest[t] = it
    }
  }
  const types = ["insurance", "prb", "tax", "inspection"]
  const shown = types.map((t) => [t, latest[t]] as const)
  const hasAny = shown.some(([, it]) => it)
  const anyExpired = shown.some(([, it]) => it?.expiryDate && it.expiryDate < today)
  const totalAmount = shown.reduce((s, [, it]) => s + (it?.amount ?? 0), 0)
  const totalMonthly = shown.reduce((s, [, it]) => s + (it?.monthlyInstallment ?? 0), 0)

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-xl border p-5 mb-6 ${
      anyExpired ? "border-red-300 dark:border-red-800" : "border-zinc-200 dark:border-zinc-800"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          ภาษี & ประกันภัย <span className="normal-case text-zinc-400">(ตามทะเบียนรถ — แยก 4 รายการ)</span>
        </h2>
        <div className="flex items-center gap-2">
          {anyExpired && (
            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">มีรายการหมดอายุ</span>
          )}
          <Link href={manageLink} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
            จัดการภาษี & ประกันภัย →
          </Link>
        </div>
      </div>
      {items === undefined ? (
        <p className="text-xs text-zinc-400">กำลังโหลด…</p>
      ) : !hasAny ? (
        <p className="text-xs text-zinc-400">
          ยังไม่มีข้อมูลภาษี/ประกันของทะเบียนนี้ — เพิ่มได้ที่เมนู งานประจำวัน → ภาษี & ประกันภัย
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-3">
            {shown.map(([t, it]) => {
              const expired = it?.expiryDate ? it.expiryDate < today : false
              return (
                <div key={t} className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-2.5">
                  <p className="text-xs text-zinc-400 mb-1">{IT_LABELS[t]}</p>
                  <p className="text-sm font-semibold">{it?.amount ? formatMoney(it.amount) : "-"}</p>
                  <p className={`text-[11px] mt-0.5 ${expired ? "text-red-600 font-medium" : "text-zinc-500"}`}>
                    {it?.expiryDate ? `หมดอายุ ${formatDate(it.expiryDate)}` : "ไม่มีข้อมูล"}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
            <div><span className="text-zinc-400">รวมทั้งสิ้น </span><span className="text-emerald-600 font-semibold">{formatMoney(totalAmount)}</span></div>
            <div><span className="text-zinc-400">หักเงินเดือนรวม </span>{totalMonthly ? `${formatMoney(totalMonthly)}/เดือน` : "-"}</div>
            <div><span className="text-zinc-400">บริษัทประกัน </span>{latest["insurance"]?.company || "-"}</div>
          </div>
        </>
      )}
    </div>
  )
}

// ── เอกสารแนบ 5 ชนิด (แนบ/ลบ ได้ทุก user + บันทึก audit ว่าใครลบเมื่อไหร่) ──
const ATTACH_DOCS_DETAIL = [
  { field: "saleContractUrl",      label: "สัญญาซื้อขาย" },
  { field: "promotionDocUrl",      label: "เอกสารแนบท้าย" },
  { field: "hireContractUrl",      label: "สัญญาว่าจ้าง" },
  { field: "guaranteeContractUrl", label: "สัญญาค้ำประกัน" },
  { field: "creditorDocUrl",       label: "เปิดเจ้าหนี้" },
] as const

type AttachHistory = {
  action: string
  changes: Record<string, { from: unknown; to: unknown }>
  editedBy: { email: string; name?: string }
  editedAt: string
}

function ContractAttachments({ contractId }: { contractId: string }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<AttachHistory[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [confirmField, setConfirmField] = useState<string | null>(null)  // field ที่กำลังรอยืนยันลบ

  const load = () => {
    fetch(`/api/partner/contracts/${contractId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Record<string, string> | null) => {
        if (c) setUrls(Object.fromEntries(ATTACH_DOCS_DETAIL.map((d) => [d.field, c[d.field] ?? ""])))
      })
    fetch(`/api/partner/contracts/${contractId}/attachment`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d: { history?: AttachHistory[] }) => setHistory(d.history ?? []))
      .catch(() => {})
  }
  useEffect(() => { load() }, [contractId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(field: string, url: string) {
    const res = await fetch(`/api/partner/contracts/${contractId}/attachment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, url }),
    })
    if (!res.ok) throw new Error("บันทึกไฟล์แนบไม่สำเร็จ")
    load()
  }

  async function upload(field: string, label: string, file: File) {
    setBusy(field)
    try {
      const fd = new FormData()
      fd.append("file", file); fd.append("folder", "contracts")
      const up = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!up.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
      const { url } = await up.json()
      await patch(field, url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด")
    } finally { setBusy(null) }
  }

  async function remove(field: string) {
    setConfirmField(null)
    setBusy(field)
    try { await patch(field, "") }
    catch (e) { toast.error(e instanceof Error ? e.message : "เกิดข้อผิดพลาด") }
    finally { setBusy(null) }
  }

  const fmtTime = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
      }).format(new Date(iso))
    } catch { return iso }
  }
  const labelOf = (field: string) => ATTACH_DOCS_DETAIL.find((d) => d.field === field)?.label ?? field

  const removeLog = history.filter((h) => h.action === "remove")

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">เอกสารแนบ (PDF / รูปภาพ)</h2>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <Clock className="w-3.5 h-3.5" /> ประวัติ ({history.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {ATTACH_DOCS_DETAIL.map(({ field, label }) => {
          const url = urls[field]
          const isBusy = busy === field
          return (
            <div key={field} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2">
              <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{label}</span>
              {url ? (
                confirmField === field ? (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <button type="button" disabled={isBusy} onClick={() => remove(field)}
                      className="text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 rounded px-2 py-0.5 disabled:opacity-40">
                      ยืนยันลบ
                    </button>
                    <button type="button" onClick={() => setConfirmField(null)}
                      className="text-[11px] text-zinc-400 hover:text-zinc-600">ยกเลิก</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <a href={url} target="_blank" rel="noreferrer" title={`เปิด${label}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline">
                      <FileText className="w-3 h-3" /> เปิด
                    </a>
                    <button type="button" disabled={isBusy} onClick={() => setConfirmField(field)}
                      title={`ลบ${label}`} className="text-zinc-300 hover:text-red-500 disabled:opacity-40">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )
              ) : (
                <label title={`แนบ${label}`}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border border-dashed cursor-pointer shrink-0 ${
                    isBusy ? "border-blue-300 text-blue-600" : "border-zinc-300 dark:border-zinc-600 text-zinc-400 hover:border-emerald-400 hover:text-emerald-600"
                  }`}>
                  {isBusy ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Upload className="w-3 h-3" />}
                  แนบไฟล์
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={isBusy}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(field, label, f); e.target.value = "" }} />
                </label>
              )}
            </div>
          )
        })}
      </div>

      {removeLog.length > 0 && !showLog && (
        <p className="text-[11px] text-zinc-400 mt-3">
          ลบล่าสุด: {labelOf(Object.keys(removeLog[0].changes)[0])} โดย {removeLog[0].editedBy.name || removeLog[0].editedBy.email} · {fmtTime(removeLog[0].editedAt)}
        </p>
      )}

      {showLog && (
        <div className="mt-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1.5 max-h-56 overflow-y-auto">
          {history.map((h, i) => {
            const field = Object.keys(h.changes)[0]
            return (
              <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-500">
                <span className={`inline-block w-12 shrink-0 font-semibold ${h.action === "remove" ? "text-red-500" : "text-emerald-600"}`}>
                  {h.action === "remove" ? "ลบ" : "แนบ"}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300 shrink-0 w-24 truncate">{labelOf(field)}</span>
                <span className="text-zinc-500 truncate flex-1">{h.editedBy.name || h.editedBy.email}</span>
                <span className="text-zinc-400 shrink-0">{fmtTime(h.editedAt)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
