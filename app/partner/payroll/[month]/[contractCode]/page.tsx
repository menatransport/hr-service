"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Printer, Copy, Trash2 } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { Label } from "@/components/partner/ui/label"
import { formatMoney, formatMonth, computePayroll, prevMonth as getPrevMonth } from "@/lib/partner/utils"
import { usePartnerSession } from "@/lib/partner/auth/client"
import type { PayrollEntry, Contract } from "@/lib/partner/types"

type NumericFields = Omit<PayrollEntry, "_id"|"contractCode"|"month"|"totalIncome"|"totalDeductions"|"netPay"|"createdAt"|"updatedAt">

const INCOME_FIELDS: { key: keyof PayrollEntry; label: string }[] = [
  { key: "transportFee",     label: "ค่าขนส่ง" },
  { key: "ot",               label: "OT" },
  { key: "otherIncomeWHT",   label: "รับอื่นๆ (หักWHT)" },
  { key: "otherIncomeNoWHT", label: "รับอื่นๆ ไม่หักWHT" },
]

const DEDUCTION_FIELDS: { key: keyof PayrollEntry; label: string }[] = [
  { key: "fuel",                    label: "ค่าเชื้อเพลิง" },
  { key: "gps",                     label: "GPS" },
  { key: "repairInHouse",           label: "ค่าซ่อมแซม" },
  { key: "repairOutside",           label: "ซ่อมนอก" },
  { key: "mgmtFee8pct",             label: "ค่าดำเนินการ 8%" },
  { key: "labor",                   label: "ค่าแรง" },
  { key: "tire",                    label: "ค่ายาง" },
  { key: "tirePatch",               label: "ค่าปะยาง" },
  { key: "carWash",                 label: "ค่าทำความสะอาดรถ" },
  { key: "taxInsurance",            label: "ต่อภาษีและประกัน" },
  { key: "installment",             label: "ค่างวดรถ" },
  { key: "repairInstallment",       label: "ผ่อนชำระค่าซ่อม" },
  { key: "downPaymentInstallment",  label: "ผ่อนเงินดาวน์" },
]

const ZERO_ENTRY = Object.fromEntries(
  [...INCOME_FIELDS, ...DEDUCTION_FIELDS].map(({ key }) => [key, 0])
) as unknown as Omit<NumericFields, "workingDays" | "tripCount">

export default function PayrollEntryPage() {
  const { month, contractCode } = useParams<{ month: string; contractCode: string }>()
  const router = useRouter()
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")
  const [form, setForm]     = useState<NumericFields & { workingDays: number; tripCount: number }>({
    workingDays: 0, tripCount: 0, ...ZERO_ENTRY,
  })
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState("")
  const [isNew, setIsNew]           = useState(true)
  const [prevEntry, setPrevEntry]   = useState<PayrollEntry | null>(null)
  const [tripFeeTotal, setTripFeeTotal] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/partner/payroll/${month}/${contractCode}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setForm(d)
          setIsNew(false)
        } else {
          // Auto-fill installment + taxInsurance from contract for new entries
          fetch(`/api/partner/contracts?q=${encodeURIComponent(contractCode)}`)
            .then((r) => r.ok ? r.json() : [])
            .then((cs: Contract[]) => {
              const c = cs.find((x) => x.contractCode === contractCode)
              if (c) {
                setForm((p) => ({
                  ...p,
                  installment:   c.monthlyInstallment   ?? p.installment,
                  taxInsurance:  c.monthlyInsuranceFee   ?? p.taxInsurance,
                }))
              }
            })
        }
      })

    // Load trips for trip count + fee total reference
    fetch(`/api/partner/trips?contractCode=${encodeURIComponent(contractCode)}&month=${month}`)
      .then((r) => r.ok ? r.json() : null)
      .then((trips: Array<{ tripFee?: number }> | null) => {
        if (Array.isArray(trips) && trips.length > 0) {
          const total = trips.reduce((s, t) => s + (t.tripFee ?? 0), 0)
          setTripFeeTotal(total)
          setForm((p) => p.tripCount === 0 ? { ...p, tripCount: trips.length } : p)
        }
      })

    // Load previous month for comparison
    fetch(`/api/partner/payroll/${getPrevMonth(month)}/${contractCode}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setPrevEntry(d) })
  }, [month, contractCode])

  const computed = computePayroll(form as Parameters<typeof computePayroll>[0])

  // Keep a ref to the latest doSave so the keyboard handler never has a stale closure
  const doSaveRef = useRef(doSave)
  useEffect(() => { doSaveRef.current = doSave })

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault()
      doSaveRef.current().then((ok) => { if (ok) router.push("/partner/payroll") })
    }
  }, [router])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  function applyTripData() {
    if (tripFeeTotal === null) return
    setForm((p) => {
      const next = {
        ...p,
        transportFee: tripFeeTotal,
        mgmtFee8pct: Math.round(tripFeeTotal * 0.08 * 100) / 100,
      }
      return next
    })
  }

  function numField(key: keyof typeof form) {
    return {
      value: String(form[key] ?? 0),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value)
        setForm((p) => {
          const next = { ...p, [key]: val }
          if (key === "transportFee") next.mgmtFee8pct = Math.round(val * 0.08 * 100) / 100
          return next
        })
      },
      type: "number" as const,
      min: "0",
      step: "0.01",
    }
  }

  async function doSave(): Promise<boolean> {
    setSaving(true)
    setError("")
    try {
      const payload = { ...form, contractCode, month }
      const res = await fetch(`/api/partner/payroll/${month}/${contractCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "เกิดข้อผิดพลาด"); return false }
      return true
    } finally { setSaving(false) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (await doSave()) router.push("/partner/payroll")
  }

  async function handleDelete() {
    if (!await confirm(`ลบข้อมูลเงินเดือน ${contractCode} เดือน ${month}?`)) return
    const res = await fetch(`/api/partner/payroll/${month}/${contractCode}`, { method: "DELETE" })
    if (res.ok) router.push("/partner/payroll")
    else setError("ลบไม่สำเร็จ")
  }

  async function handleSaveAndNext() {
    if (!await doSave()) return
    // Find next unrecorded driver
    const [entriesRes, driversRes] = await Promise.all([
      fetch(`/api/partner/payroll?month=${month}`).then((r) => r.ok ? r.json() : []),
      fetch("/api/partner/drivers?status=active").then((r) => r.ok ? r.json() : []),
    ])
    const recorded = new Set((entriesRes as Array<{ contractCode: string }>).map((e) => e.contractCode))
    const next = (driversRes as Array<{ contractCode: string }>).find((d) => !recorded.has(d.contractCode))
    if (next) router.push(`/partner/payroll/${month}/${next.contractCode}`)
    else router.push("/partner/payroll")
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
            {isNew ? "กรอกเงินเดือน" : "แก้ไขเงินเดือน"}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">{contractCode} · {formatMonth(month)}</p>
        </div>
        {!isNew && (
          <Link
            href={`/partner/payroll/${month}/${contractCode}/print`}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
          >
            <Printer className="w-3.5 h-3.5" />
            ใบแจ้งเงินเดือน
          </Link>
        )}
      </div>

      {/* Previous month quick compare + copy */}
      {prevEntry && (
        <div className="mb-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">เดือนก่อนหน้า ({formatMonth(prevEntry.month)})</p>
            {isNew && (
              <button
                type="button"
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { _id: _i, month: _m, contractCode: _c, createdAt: _ca, updatedAt: _ua, totalIncome: _ti, totalDeductions: _td, netPay: _np, ...fields } = prevEntry
                  setForm((p) => ({ ...p, ...fields, tripCount: 0, transportFee: 0, ot: 0, otherIncomeWHT: 0, otherIncomeNoWHT: 0 }))
                }}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 border border-emerald-200 rounded px-2 py-0.5"
                title="คัดลอกรายการหักจากเดือนก่อน"
              >
                <Copy className="w-3 h-3" /> คัดลอกรายการหัก
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            {[
              { label: "รายรับ",   value: formatMoney(prevEntry.totalIncome),     color: "text-emerald-600" },
              { label: "รายหัก",   value: formatMoney(prevEntry.totalDeductions), color: "text-red-500" },
              { label: "สุทธิ",    value: formatMoney(prevEntry.netPay),          color: prevEntry.netPay < 0 ? "text-red-600" : "text-zinc-800 dark:text-zinc-100" },
              { label: "เที่ยว",   value: `${prevEntry.tripCount} เที่ยว`,       color: "" },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
                <p className={`font-semibold text-xs ${color}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip fee reference card */}
      {tripFeeTotal !== null && (
        <div className={`mb-4 rounded-xl border px-5 py-3 ${
          Math.abs(form.transportFee - tripFeeTotal) > 100
            ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-700"
            : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-700"
        }`}>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">ข้อมูลจากรายเที่ยว ({form.tripCount} เที่ยว)</p>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-zinc-500 text-xs">รวมค่าขนส่งจากเที่ยว</span>
              <p className="font-bold text-blue-700 dark:text-blue-400">{formatMoney(tripFeeTotal)} บาท</p>
            </div>
            <div className="text-zinc-300">→</div>
            <div>
              <span className="text-zinc-500 text-xs">ค่าขนส่งที่กรอก</span>
              <p className={`font-bold ${Math.abs(form.transportFee - tripFeeTotal) > 100 ? "text-amber-600" : "text-zinc-700 dark:text-zinc-300"}`}>
                {formatMoney(form.transportFee)} บาท
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {Math.abs(form.transportFee - tripFeeTotal) > 100 && (
                <span className="text-xs text-amber-600 font-medium">
                  ต่างกัน {formatMoney(Math.abs(form.transportFee - tripFeeTotal))} บาท
                </span>
              )}
              {form.transportFee !== tripFeeTotal && (
                <button
                  type="button"
                  onClick={applyTripData}
                  className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50"
                >
                  ใช้ข้อมูลจากเที่ยว
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Work summary */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-zinc-600 mb-4">ข้อมูลการทำงาน</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>วันทำงาน (วัน)</Label>
              <Input {...numField("workingDays")} />
            </div>
            <div className="space-y-1">
              <Label>จำนวนเที่ยว</Label>
              <Input {...numField("tripCount")} />
            </div>
          </div>
        </div>

        {/* Income */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-emerald-600 mb-4">รายการรับ</h2>
          <div className="grid grid-cols-2 gap-4">
            {INCOME_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input {...numField(key as keyof typeof form)} />
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between text-sm">
            <span className="text-zinc-500">รวมรายรับ</span>
            <span className="font-bold text-emerald-600">{formatMoney(computed.totalIncome)} บาท</span>
          </div>
        </div>

        {/* Deductions */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-sm font-semibold text-red-500 mb-4">รายการหัก</h2>
          <div className="grid grid-cols-2 gap-4">
            {DEDUCTION_FIELDS.map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-1">
                  <Label>{label}</Label>
                  {key === "mgmtFee8pct" && (
                    <span className="text-[10px] text-zinc-400">(8% ของค่าขนส่ง)</span>
                  )}
                </div>
                <Input {...numField(key as keyof typeof form)} />
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between text-sm">
            <span className="text-zinc-500">รวมรายหัก</span>
            <span className="font-bold text-red-500">{formatMoney(computed.totalDeductions)} บาท</span>
          </div>
        </div>

        {/* Net Pay */}
        <div className="bg-zinc-800 dark:bg-zinc-700 rounded-xl px-6 py-5 flex items-center justify-between">
          <span className="text-white font-medium">เงินสุทธิ</span>
          <span className="text-2xl font-bold text-emerald-400">{formatMoney(computed.netPay)} บาท</span>
        </div>

        <div className="flex gap-3 items-center">
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
          <span className="text-[10px] text-zinc-400 hidden sm:inline">Ctrl+S เพื่อบันทึก</span>
          {isNew && (
            <Button
              type="button"
              disabled={saving}
              onClick={handleSaveAndNext}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              บันทึกและถัดไป →
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
          {!isNew && isAdmin && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleDelete}
              className="ml-auto text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> ลบรายการ
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
