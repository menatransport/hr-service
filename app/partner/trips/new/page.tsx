"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { hasPerm } from "@/lib/partner/rbac"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { Label } from "@/components/partner/ui/label"
import type { Trip } from "@/lib/partner/types"

type TripForm = Omit<Trip, "_id" | "createdAt">

const EMPTY: TripForm = {
  contractCode: "", date: "", ldtNumber: "", plant: "",
  serviceType: "", routeCode: "", destinationName: "",
  district: "", province: "", zone: "", tripFee: 0,
}

export default function NewTripPage() {
  const router = useRouter()
  const { data: session } = usePartnerSession()
  const [form, setForm]     = useState<TripForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState("")

  if (!hasPerm(session?.user?.role, "vehiclecost")) {
    return <div className="p-8 text-center text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  }

  function field(key: keyof TripForm) {
    return {
      value: String(form[key] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value
        setForm((p) => ({ ...p, [key]: key === "tripFee" ? Number(v) : v }))
      },
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!hasPerm(session?.user?.role, "vehiclecost")) return
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/partner/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "เกิดข้อผิดพลาด"); return }
      router.push("/partner/trips")
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-6">เพิ่มรายเที่ยว</h1>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>รหัสสัญญา *</Label>
            <Input {...field("contractCode")} required placeholder="MTL003" />
          </div>
          <div className="space-y-1">
            <Label>วันที่ *</Label>
            <ThaiDateInput value={String(form.date ?? "")} onChange={(iso) => setForm((p) => ({ ...p, date: iso }))} />
          </div>
          <div className="space-y-1">
            <Label>เลขที่ LDT</Label>
            <Input {...field("ldtNumber")} />
          </div>
          <div className="space-y-1">
            <Label>แพล้นท์</Label>
            <Input {...field("plant")} />
          </div>
          <div className="space-y-1">
            <Label>บริการ</Label>
            <Input {...field("serviceType")} />
          </div>
          <div className="space-y-1">
            <Label>Route/Ship To</Label>
            <Input {...field("routeCode")} />
          </div>
          <div className="space-y-1">
            <Label>ชื่อปลายทาง</Label>
            <Input {...field("destinationName")} />
          </div>
          <div className="space-y-1">
            <Label>อำเภอ</Label>
            <Input {...field("district")} />
          </div>
          <div className="space-y-1">
            <Label>จังหวัด</Label>
            <Input {...field("province")} />
          </div>
          <div className="space-y-1">
            <Label>โซน</Label>
            <Input {...field("zone")} />
          </div>
          <div className="space-y-1">
            <Label>ค่าเที่ยว (บาท)</Label>
            <Input {...field("tripFee")} type="number" min="0" step="0.01" />
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
        </div>
      </form>
    </div>
  )
}
