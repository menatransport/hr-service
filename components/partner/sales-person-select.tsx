"use client"

import { useEffect, useState } from "react"
import { prompt } from "@/components/partner/ui/confirm"
import { SALES_PEOPLE } from "@/lib/partner/quotation-people"

const ADD = "__add__"

/**
 * dropdown เลือกผู้ขาย — เพิ่มชื่อใหม่ได้จากในตัวเลือกเลย (บันทึกให้คนอื่นเลือกได้ด้วย)
 * value ที่ไม่มีในลิสต์ (เช่น ชื่อผู้ล็อกอิน/ใบเก่า) จะถูกใส่เป็นตัวเลือกไว้ไม่ให้หาย
 */
export function SalesPersonSelect({ value, onChange, className }: {
  value: string
  onChange: (name: string) => void
  className?: string
}) {
  const [names, setNames] = useState<string[]>([...SALES_PEOPLE])
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch("/api/partner/quotations/sales-people")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d) && d.length) setNames(d) })
      .catch(() => {})
  }, [])

  async function addNew() {
    const name = (await prompt({ title: "เพิ่มชื่อผู้ขาย", placeholder: "เช่น K.ใหม่ ฝ่ายขาย" }))?.trim()
    if (!name) return
    setErr("")
    const res = await fetch("/api/partner/quotations/sales-people", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    const d = await res.json().catch(() => null)
    if (Array.isArray(d?.names)) setNames(d.names)
    if (!res.ok) {
      // ชื่อซ้ำ → เลือกชื่อเดิมให้เลย ไม่ถือเป็น error ที่ต้องแก้
      const dup = (d?.names as string[] | undefined)?.find((n) => n.toLowerCase() === name.toLowerCase())
      if (res.status === 409 && dup) { onChange(dup); return }
      setErr(d?.error ?? "เพิ่มชื่อไม่สำเร็จ")
      return
    }
    onChange(d.name)
  }

  const options = value && !names.some((n) => n === value) ? [value, ...names] : names

  return (
    <>
      <select
        value={value}
        onChange={(e) => { if (e.target.value === ADD) addNew(); else onChange(e.target.value) }}
        className={className ?? "w-full h-9 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 bg-white dark:bg-zinc-900"}
      >
        {options.map((s) => <option key={s} value={s}>{s}</option>)}
        <option value={ADD}>➕ เพิ่มชื่อผู้ขายใหม่…</option>
      </select>
      {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
    </>
  )
}
