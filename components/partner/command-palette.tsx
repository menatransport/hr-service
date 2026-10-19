/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { Search } from "lucide-react"
import { isAdminRole, salespersonPageAllowed } from "@/lib/partner/rbac"

type Item = { href: string; label: string; group: string; admin?: boolean; superadmin?: boolean }
const ITEMS: Item[] = [
  { href: "/partner", label: "หน้าหลัก · คู่มือ", group: "ทั่วไป" },
  { href: "/partner/alerts", label: "ต้องดูด่วน / แจ้งเตือน", group: "ทั่วไป" },
  { href: "/partner/drivers", label: "คนขับ", group: "สัญญา" },
  { href: "/partner/drivers?status=exit", label: "คนขับพ้นสภาพ", group: "สัญญา" },
  { href: "/partner/vehicles", label: "รถ", group: "สัญญา" },
  { href: "/partner/price-list", label: "ราคาขาย", group: "สัญญา" },
  { href: "/partner/contracts", label: "สัญญา", group: "สัญญา" },
  { href: "/partner/quotations", label: "ระบบขาย (ใบเสนอ/ดีล)", group: "ขาย" },
  { href: "/partner/quotations/dashboard", label: "แดชบอร์ดงานขาย", group: "ขาย" },
  { href: "/partner/catalog", label: "Catalog รถ (PDF รายคัน)", group: "ขาย" },
  { href: "/partner/quotations/commission", label: "ยอดขาย & ค่าคอมมิชชั่น", group: "ขาย" },
  { href: "/partner/promotions", label: "โปรโมชั่น", group: "โปรโมชั่น" },
  { href: "/partner/reports/promotions", label: "รายงานสรุปยอดโปรโมชั่น", group: "โปรโมชั่น" },
  { href: "/partner/vehicle-cost", label: "ค่าใช้จ่ายรถ", group: "เงินเดือน" },
  { href: "/partner/insurance-tax", label: "ภาษี & ประกันภัย", group: "เงินเดือน" },
  { href: "/partner/trip-fuel", label: "ค่าเที่ยว & เชื้อเพลิง", group: "เงินเดือน" },
  { href: "/partner/attendance", label: "วันทำงาน พจร.", group: "เงินเดือน" },
  { href: "/partner/payroll-extras", label: "รับ-หักอื่นๆ", group: "เงินเดือน" },
  { href: "/partner/payroll", label: "เงินเดือน", group: "เงินเดือน" },
  { href: "/partner/payroll/sop", label: "SOP/WI ปิดงวด", group: "เงินเดือน" },
  { href: "/partner/driver-ledger", label: "หนี้สิน & เงินสะสม", group: "เงินเดือน" },
  { href: "/partner/reports", label: "รายงาน", group: "เงินเดือน" },
  { href: "/partner/import", label: "นำเข้า Excel", group: "แอดมิน", admin: true },
  { href: "/partner/admin/month", label: "จัดการรอบเดือน", group: "แอดมิน", admin: true },
  { href: "/partner/admin/users", label: "ผู้ใช้ & สิทธิ์", group: "แอดมิน", superadmin: true },
]

export function CommandPalette() {
  const router = useRouter()
  const { data: session } = usePartnerSession()
  const role = session?.user?.role ?? ""
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allowed = useMemo(() => ITEMS.filter((it) => {
    if (role === "salesperson") return salespersonPageAllowed(it.href)
    if (it.superadmin) return role === "superadmin"
    if (it.admin) return isAdminRole(role)
    return true
  }), [role])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return allowed
    return allowed.filter((it) => it.label.toLowerCase().includes(s) || it.href.includes(s) || it.group.toLowerCase().includes(s))
  }, [q, allowed])

  // ⌘K / Ctrl+K เปิด-ปิด, Esc ปิด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v) }
      else if (e.key === "Escape") setOpen(false)
    }
    // เปิดจากปุ่มใน navbar ก็ได้ (custom event)
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener("open-command-palette", onOpen)
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-command-palette", onOpen) }
  }, [])

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { setActive(0) }, [q])

  if (!open) return null
  const go = (href: string) => { setOpen(false); router.push(href) }

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-[1px]" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="ค้นหาเมนู" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-zinc-100 dark:border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active].href) }
            }}
            placeholder="ไปที่หน้า... (พิมพ์ชื่อเมนู)" className="flex-1 h-12 bg-transparent text-sm outline-none text-zinc-800 dark:text-zinc-100" />
          <kbd className="text-[10px] text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? <div className="px-4 py-6 text-center text-sm text-zinc-400">ไม่พบเมนู</div> :
            results.map((it, i) => (
              <button key={it.href} onMouseEnter={() => setActive(i)} onClick={() => go(it.href)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between ${i === active ? "bg-amber-50 dark:bg-zinc-800" : ""}`}>
                <span className="text-sm text-zinc-800 dark:text-zinc-100">{it.label}</span>
                <span className="text-[11px] text-zinc-400">{it.group}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
