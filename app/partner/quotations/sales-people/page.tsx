"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { confirm } from "@/components/partner/ui/confirm"
import { Users, Plus, Trash2, Check, X, Pencil, ArrowLeft, Info } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { Skeleton } from "@/components/partner/ui/skeleton"

interface Person {
  _id: string          // "" = ชื่อตั้งต้นในโค้ด ยังไม่มีใน DB จึงแก้/ลบไม่ได้
  name: string
  email: string
  phone: string
  quotations: number   // จำนวนใบเสนอราคาที่ผูกกับชื่อนี้
  seeded: boolean
}

export default function SalesPeoplePage() {
  const { data: session } = usePartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === "admin" || role === "superadmin"

  const [rows, setRows] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)

  const [nName, setNName] = useState("")
  const [nEmail, setNEmail] = useState("")
  const [nPhone, setNPhone] = useState("")

  const [editId, setEditId] = useState("")
  const [eName, setEName] = useState("")
  const [eEmail, setEEmail] = useState("")
  const [ePhone, setEPhone] = useState("")

  const load = useCallback(async () => {
    const r = await fetch("/api/partner/quotations/sales-people?full=1")
    if (r.ok) setRows(await r.json())
    setLoading(false)
  }, [])
  // ไม่ใช่แอดมิน → ไม่ยิง API เลย (หน้า return ออกก่อนถึงตาราง จึงไม่ต้องปิด loading)
  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  async function add() {
    if (!nName.trim()) return
    setBusy(true); setErr(""); setMsg("")
    try {
      const r = await fetch("/api/partner/quotations/sales-people", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nName.trim(), email: nEmail.trim(), phone: nPhone.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? "เพิ่มไม่สำเร็จ"); return }
      setMsg(`✓ เพิ่ม ${nName.trim()} แล้ว`)
      setNName(""); setNEmail(""); setNPhone("")
      await load()
    } finally { setBusy(false) }
  }

  function startEdit(p: Person) {
    setEditId(p._id); setEName(p.name); setEEmail(p.email); setEPhone(p.phone); setErr(""); setMsg("")
  }

  async function saveEdit(p: Person) {
    const renamed = eName.trim() !== p.name
    if (renamed && p.quotations > 0) {
      const ok = await confirm(
        `เปลี่ยนชื่อ "${p.name}" → "${eName.trim()}"\n\n` +
        `มีใบเสนอราคาผูกกับชื่อเดิมอยู่ ${p.quotations} ใบ ระบบจะแก้ชื่อผู้ขายในใบเหล่านั้นตามให้ทั้งหมด ` +
        `เพื่อไม่ให้ยอดคอมมิชชั่นแตกเป็นสองก้อน — ยืนยันหรือไม่?`
      )
      if (!ok) return
    }
    setBusy(true); setErr(""); setMsg("")
    try {
      const r = await fetch("/api/partner/quotations/sales-people", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: p._id, name: eName.trim(), email: eEmail.trim(), phone: ePhone.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? "บันทึกไม่สำเร็จ"); return }
      setMsg(d.renamed ? `✓ บันทึกแล้ว · อัปเดตใบเสนอราคาเดิม ${d.renamed} ใบ` : "✓ บันทึกแล้ว")
      setEditId("")
      await load()
    } finally { setBusy(false) }
  }

  async function remove(p: Person) {
    if (p.quotations > 0) {
      setErr(`ลบ "${p.name}" ไม่ได้ — มีใบเสนอราคาผูกอยู่ ${p.quotations} ใบ`)
      return
    }
    if (!await confirm(`ลบ "${p.name}" ออกจากรายชื่อทีมขาย?`)) return
    setBusy(true); setErr(""); setMsg("")
    try {
      const r = await fetch("/api/partner/quotations/sales-people", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: p._id }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? "ลบไม่สำเร็จ"); return }
      setMsg(`✓ ลบ ${p.name} แล้ว`)
      await load()
    } finally { setBusy(false) }
  }

  if (!isAdmin) {
    return <div className="max-w-2xl mx-auto py-16 text-center text-sm text-zinc-400">หน้านี้สำหรับแอดมินเท่านั้น</div>
  }

  const seededCount = rows.filter((r) => r.seeded).length

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">ระบบขาย</p>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-[#C9A227]" /> ทีมขาย</h1>
          <p className="text-xs text-zinc-400 mt-0.5">ชื่อ / email / เบอร์โทร พนักงานขาย — ชื่อในลิสต์นี้คือตัวเลือกในใบเสนอราคา และเป็นตัวจับกลุ่มยอดคอม</p>
        </div>
        <Link href="/partner/quotations" className="flex items-center gap-1.5 text-sm border border-zinc-300 dark:border-zinc-700 px-3 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
          <ArrowLeft className="w-4 h-4" /> กลับหน้าขาย
        </Link>
      </div>

      {/* เพิ่มคนใหม่ */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">เพิ่มพนักงานขาย</p>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">ชื่อ *</label>
            <Input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="เช่น K.ใหม่ ฝ่ายขาย" className="h-9 text-sm" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">Email</label>
            <Input type="email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} placeholder="name@menatransport.co.th" className="h-9 text-sm" />
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">เบอร์โทร</label>
            <Input value={nPhone} onChange={(e) => setNPhone(e.target.value)} placeholder="08x-xxx-xxxx" className="h-9 text-sm" />
          </div>
          <Button onClick={add} disabled={busy || !nName.trim()} className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
            <Plus className="w-4 h-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      {msg && <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-2">{msg}</p>}
      {err && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{err}</p>}

      {/* ตาราง */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10"><tr className="text-zinc-400 dark:text-zinc-500">
              {["ชื่อ", "Email", "เบอร์โทร", "ใบเสนอราคา", ""].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium bg-zinc-50 dark:bg-zinc-800/90 border-b border-zinc-100 dark:border-zinc-800 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800">
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk${i}`}>{Array.from({ length: 5 }).map((_, c) => (<td key={c} className="px-3 py-2"><Skeleton className="h-4" /></td>))}</tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-zinc-300 text-xs">ยังไม่มีรายชื่อ</td></tr>
              ) : rows.map((p) => {
                const editingThis = editId === p._id && p._id !== ""
                return (
                  <tr key={p._id || `code:${p.name}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 align-middle">
                    <td className="px-3 py-2 font-medium">
                      {editingThis
                        ? <Input value={eName} onChange={(e) => setEName(e.target.value)} className="h-8 text-sm" />
                        : <span className="flex items-center gap-1.5">
                            {p.name}
                            {p.seeded && <span className="text-[9px] font-semibold text-zinc-400 border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5">ค่าตั้งต้น</span>}
                          </span>}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                      {editingThis
                        ? <Input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="h-8 text-sm" />
                        : (p.email || <span className="text-zinc-300 dark:text-zinc-600">—</span>)}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {editingThis
                        ? <Input value={ePhone} onChange={(e) => setEPhone(e.target.value)} className="h-8 text-sm" />
                        : (p.phone || <span className="text-zinc-300 dark:text-zinc-600">—</span>)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-zinc-500 dark:text-zinc-400">{p.quotations || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {p.seeded ? (
                          <span className="text-[10px] text-zinc-400">แก้ไม่ได้ — ต้อง seed เข้าฐานข้อมูลก่อน</span>
                        ) : editingThis ? (
                          <>
                            <Button size="sm" onClick={() => saveEdit(p)} disabled={busy || !eName.trim()} className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
                              <Check className="w-3 h-3 mr-0.5" /> บันทึก
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditId("")} className="h-7 px-2 text-xs">
                              <X className="w-3 h-3" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(p)} className="h-7 px-2 text-xs text-zinc-500 hover:text-emerald-600">
                              <Pencil className="w-3 h-3 mr-0.5" /> แก้ไข
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => remove(p)} disabled={busy}
                              className="h-7 px-1.5 text-zinc-400 hover:text-red-500 disabled:opacity-40" title={p.quotations > 0 ? `มีใบเสนอราคาผูกอยู่ ${p.quotations} ใบ` : "ลบ"}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {seededCount > 0 && (
        <p className="text-[11px] text-zinc-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          มี {seededCount} ชื่อที่ยังเป็นค่าตั้งต้นในโค้ด (<code className="text-[10px]">lib/quotation-people.ts</code>) ยังกรอก email/เบอร์ไม่ได้ —
          รัน <code className="text-[10px]">node scripts/seed-sales-people.mjs --apply</code> เพื่อย้ายเข้าฐานข้อมูลก่อน
        </p>
      )}
    </div>
  )
}
