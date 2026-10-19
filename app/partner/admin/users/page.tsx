/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useCallback, useEffect, useState } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { ShieldCheck, Trash2, Plus } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { RoleMatrix } from "@/components/partner/role-matrix"
import { Button } from "@/components/partner/ui/button"
import { ROLES, ROLE_LABELS } from "@/lib/partner/rbac"

type Row = { email: string; role: string; updatedAt?: string; updatedBy?: string }
const ASSIGNABLE = ROLES.filter((r) => r !== "superadmin")

export default function AdminUsersPage() {
  const { data: session } = usePartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [newRole, setNewRole] = useState("fleet")
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    const r = await fetch("/api/partner/admin/users")
    if (r.ok) setRows(await r.json())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function save(em: string, rl: string) {
    setMsg("")
    const r = await fetch("/api/partner/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em, role: rl }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error ?? "บันทึกไม่สำเร็จ"); return }
    setMsg(`✓ บันทึก ${em} = ${ROLE_LABELS[rl as keyof typeof ROLE_LABELS] ?? rl}`)
    await load()
  }

  async function remove(em: string) {
    if (!await confirm(`ลบสิทธิ์ของ ${em}? (จะกลับเป็น "ดูอย่างเดียว")`)) return
    await fetch("/api/partner/admin/users", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em }) })
    await load()
  }

  if (role !== "superadmin") {
    return <div className="max-w-2xl mx-auto py-16 text-center text-sm text-zinc-400">หน้านี้สำหรับ Superadmin เท่านั้น</div>
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <div>
        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Superadmin</p>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-emerald-500" /> ผู้ใช้ & สิทธิ์</h1>
        <p className="text-xs text-zinc-400 mt-0.5">ตั้งบทบาทรายคน — ดูขอบเขตสิทธิ์แต่ละบทบาทจากตารางท้ายหน้า</p>
      </div>

      {/* เพิ่มผู้ใช้ */}
      <div className="flex items-end gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-zinc-500 mb-1">อีเมล (@menatransport.co.th)</label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="somchai@menatransport.co.th" className="h-9 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">บทบาท</label>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 text-sm">
            {ASSIGNABLE.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => email.trim() && save(email.trim(), newRole)}>
          <Plus className="w-4 h-4" /> เพิ่ม
        </Button>
      </div>

      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      {/* รายชื่อ */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
              <th className="px-3 py-2.5 text-left font-semibold text-zinc-400 uppercase">อีเมล</th>
              <th className="px-3 py-2.5 text-left font-semibold text-zinc-400 uppercase w-44">บทบาท</th>
              <th className="px-3 py-2.5 text-left font-semibold text-zinc-400 uppercase">แก้ล่าสุด</th>
              <th className="px-3 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">กำลังโหลด...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                ยังไม่ตั้งบทบาทใคร — ระบบอยู่ในโหมดเดิม (ทุกคนในโดเมน = แอดมิน) จนกว่าจะเพิ่มคนแรก/ตั้ง SUPERADMIN_EMAILS
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.email} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-3 py-2.5 font-mono">{r.email}</td>
                <td className="px-3 py-2.5">
                  <select value={r.role} onChange={(e) => save(r.email, e.target.value)} className="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 text-xs">
                    {ASSIGNABLE.map((x) => <option key={x} value={x}>{ROLE_LABELS[x]}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2.5 text-zinc-400">{r.updatedAt?.slice(0, 10)} {r.updatedBy ? `· ${r.updatedBy}` : ""}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => remove(r.email)} className="text-zinc-300 hover:text-red-500" title="ลบออกจากลิสต์ (กลับเป็นดูอย่างเดียว)">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
          <RoleMatrix />
    </div>
  )
}
