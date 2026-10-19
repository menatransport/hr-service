"use client"

/**
 * ปฏิทินเลือกวันที่แบบ พ.ศ. — แสดง/เลือกเป็นพุทธศักราช แต่ value เข้า/ออกเป็น
 * ISO ค.ศ. ("YYYY-MM-DD") เสมอ เพื่อให้ DB/เอกสาร/payroll (ที่อิง ค.ศ. + แปลง +543
 * ตอนแสดง) ทำงานเหมือนเดิม เปลี่ยนแค่หน้าตา ไม่เปลี่ยนค่าที่เก็บ
 * เมนูปฏิทิน render ผ่าน portal (fixed) กันโดนการ์ด overflow-hidden บัง
 */

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react"

const TH_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"]
const TH_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]
const TH_DOW = ["อา","จ","อ","พ","พฤ","ศ","ส"]
const MENU_W = 264

function parseISO(v: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || "")
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}
const toISO = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`

/** "YYYY-MM-DD" (ค.ศ.) → "10 ก.ค. 2026/2569" (ปีคู่) หรือ "10 ก.ค. 2569" (beOnly) */
export function displayThaiDate(v: string, beOnly = false): string {
  const p = parseISO(v)
  if (!p) return ""
  return beOnly ? `${p.d} ${TH_MONTHS_SHORT[p.m - 1]} ${p.y + 543}` : `${p.d} ${TH_MONTHS_SHORT[p.m - 1]} ${p.y}/${p.y + 543}`
}

export function ThaiDateInput({ value, onChange, disabled, placeholder = "เลือกวันที่", className = "", beOnly = false }: {
  value: string
  onChange: (iso: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  /** แสดงปีเป็น พ.ศ. ล้วน (วันที่เอกสารราชการ เช่น วันจดทะเบียน) */
  beOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref     = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const init = parseISO(value)
  const now  = new Date()
  const [viewY, setViewY] = useState(init ? init.y : now.getFullYear())
  const [viewM, setViewM] = useState(init ? init.m : now.getMonth() + 1)

  const updatePos = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    // clamp ให้เมนูอยู่ในจอเสมอ — ช่องที่อยู่คอลัมน์ขวา (เช่น วันหมดอายุ ใน side panel)
    // เคยล้นขอบขวา ทำให้ปุ่มเดือนถัดไปอยู่นอกจอ กดไม่ได้
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8))
    setPos({ top: r.bottom + 4, left })
  }

  useEffect(() => {
    if (!open) return
    const p = parseISO(value)
    if (p) { setViewY(p.y); setViewM(p.m) }
    updatePos()
    const on = () => updatePos()
    window.addEventListener("scroll", on, true)
    window.addEventListener("resize", on)
    return () => { window.removeEventListener("scroll", on, true); window.removeEventListener("resize", on) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const sel = parseISO(value)
  const firstDow    = new Date(viewY, viewM - 1, 1).getDay()
  const daysInMonth = new Date(viewY, viewM, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const prevMonth = () => (viewM === 1 ? (setViewM(12), setViewY(viewY - 1)) : setViewM(viewM - 1))
  const nextMonth = () => (viewM === 12 ? (setViewM(1), setViewY(viewY + 1)) : setViewM(viewM + 1))

  const beNow = now.getFullYear() + 543
  const years = Array.from({ length: 93 }, (_, i) => beNow + 10 - i)  // +10 ถึง -82 ปี

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex items-center gap-2 h-9 w-full px-3 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-left disabled:opacity-50 ${className}`}
      >
        <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        <span className={`flex-1 truncate ${value ? "" : "text-zinc-400"}`}>
          {value ? displayThaiDate(value, beOnly) : placeholder}
        </span>
        {value && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange("") }}
            className="text-zinc-300 hover:text-zinc-600 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: MENU_W }}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              <span>{TH_MONTHS[viewM - 1]}</span>
              <select
                value={viewY + 543}
                onChange={(e) => setViewY(Number(e.target.value) - 543)}
                className="bg-transparent font-semibold text-sm outline-none cursor-pointer text-zinc-800 dark:text-zinc-100"
                aria-label="ปี พ.ศ."
              >
                {years.map((by) => <option key={by} value={by}>{beOnly ? by : `${by - 543}/${by}`}</option>)}
              </select>
            </div>
            <button type="button" onClick={nextMonth} className="p-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {TH_DOW.map((d) => <div key={d} className="text-[10px] text-zinc-400 font-semibold py-1">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />
              const isSel   = sel && sel.y === viewY && sel.m === viewM && sel.d === d
              const isToday = now.getFullYear() === viewY && now.getMonth() + 1 === viewM && now.getDate() === d
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(toISO(viewY, viewM, d)); setOpen(false) }}
                  className={`h-7 rounded-md text-xs transition-colors ${
                    isSel ? "bg-emerald-600 text-white font-bold"
                    : isToday ? "ring-1 ring-emerald-400 text-emerald-700 dark:text-emerald-400"
                    : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {d}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
