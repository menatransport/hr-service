"use client"

/**
 * รับ-หักอื่นๆ (payroll เฟส 4) — รายการมีชื่อต่อคน/เดือน แทนชีต รับอื่นๆ/หักอื่นๆ + ไฟล์แนบทั้งหมด
 * นำเข้าแบบ "วางจาก Excel": copy 2 คอลัมน์ (อ้างอิง, จำนวนเงิน) จากไฟล์ไหนก็ได้ → วาง → ระบบจับคู่สัญญาให้
 */

import { useCallback, useEffect, useState } from "react"
import { confirm, prompt } from "@/components/partner/ui/confirm"
import { SlidersHorizontal, Plus, Trash2, ClipboardPaste, Check } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { EXTRA_TYPES } from "@/lib/partner/payroll-extras"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmt = (n: any) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })
const currentMonth = () => new Date().toISOString().slice(0, 7)

export default function PayrollExtrasPage() {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<any[]>([])
  const [tab, setTab] = useState<"income" | "deduct">("income")
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  // เพิ่มเดี่ยว
  const [nType, setNType] = useState("clean_truck")
  const [nCC, setNCC] = useState(""); const [nAmt, setNAmt] = useState(""); const [nNote, setNNote] = useState("")
  // นำเข้าแบบวาง
  const [showPaste, setShowPaste] = useState(false)
  const [pType, setPType] = useState("clean_truck")
  const [pasteText, setPasteText] = useState("")
  const [preview, setPreview] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  async function copyFromPrev() {
    const [y, m] = month.split("-").map(Number)
    const from = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`
    const label = await prompt({
      title: `คัดลอกรายการจากเดือน ${from} → ${month}\nระบุชื่อรายการ (เว้นว่าง = ทุกรายการของเดือนก่อน · ข้ามคนที่มีรายการเดิมแล้ว)`,
      defaultValue: "รับสภาพหนี้ จราจร" })
    if (label === null) return
    const r = await fetch("/api/partner/payroll-extras", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action: "copy-month", from, labels: label.trim() ? [label.trim()] : [] }),
    })
    const d = await r.json()
    if (!r.ok) { setMsg(`✗ ${d.error ?? "คัดลอกไม่สำเร็จ"}`); return }
    setMsg(`✓ คัดลอก ${d.copied} รายการจาก ${from} (ข้ามซ้ำ ${d.skipped})`)
    await load()
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch(`/api/partner/payroll-extras?month=${month}`); if (r.ok) setRows(await r.json()) }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  function parsePaste(): { ref: string; amount: number; note?: string }[] {
    return pasteText.split(/\r?\n/).map((line) => {
      const cells = line.split(/\t|,/).map((c) => c.trim()).filter((c) => c !== "")
      if (cells.length < 2) return null
      // เงิน = คอลัมน์ตัวเลขขวาสุด · อ้างอิง = คอลัมน์แรก · ที่เหลือ = note
      let amtIdx = -1
      for (let i = cells.length - 1; i >= 1; i--) {
        const v = parseFloat(cells[i].replace(/,/g, ""))
        if (!isNaN(v) && v !== 0) { amtIdx = i; break }
      }
      if (amtIdx === -1) return null
      return { ref: cells[0], amount: parseFloat(cells[amtIdx].replace(/,/g, "")), note: cells.slice(1, amtIdx).join(" ") || undefined }
    }).filter(Boolean) as any[]
  }

  async function runImport(previewOnly: boolean) {
    const lines = parsePaste()
    if (lines.length === 0) { setMsg("วางข้อมูลก่อน (อ้างอิง แท็บ จำนวนเงิน)"); return }
    setBusy(true); setMsg("")
    try {
      const r = await fetch("/api/partner/payroll-extras", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, type: pType, action: "import", preview: previewOnly, lines }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(d.error ?? "ไม่สำเร็จ"); return }
      if (previewOnly) { setPreview(d); setMsg(`จับคู่ได้ ${d.matched} · ไม่พบ ${d.unmatched.length}`) }
      else { setPreview(null); setPasteText(""); setShowPaste(false); setMsg(`✓ นำเข้า ${d.inserted} รายการ${d.unmatched.length ? ` · ไม่พบสัญญา ${d.unmatched.length}` : ""}`); await load() }
    } finally { setBusy(false) }
  }

  async function addOne() {
    if (!nCC.trim() || !nAmt) { setMsg("ใส่รหัสสัญญา + จำนวนเงิน"); return }
    const r = await fetch("/api/partner/payroll-extras", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, type: nType, contractCode: nCC.trim().toUpperCase(), amount: Number(nAmt), note: nNote }) })
    if (r.ok) { setNCC(""); setNAmt(""); setNNote(""); setMsg("✓ เพิ่มแล้ว"); await load() }
  }

  async function del(id: string) {
    if (!await confirm("ลบรายการนี้?")) return
    await fetch("/api/partner/payroll-extras", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    await load()
  }

  const visible = rows.filter((r) => r.kind === tab)
  const total = visible.reduce((s, r) => s + (r.amount || 0), 0)

  async function exportExcel() {
    await exportToExcel([{ name: `รับหักอื่นๆ-${month}`, rows: rows.map((r) => ({
      "เดือน": r.month, "ประเภท": r.label, "รับ/หัก": r.kind === "income" ? "รับ" : "หัก",
      "สัญญา": r.contractCode, "ชื่อ": r.driverName, "ทะเบียน": r.licensePlate,
      "จำนวนเงิน": r.amount, "WHT": r.wht ? "หัก ณ ที่จ่าย" : "ไม่หัก", "หมายเหตุ": r.note ?? "", "ที่มา": r.source,
    })) }], `payroll-extras-${month}-${todayStamp()}`)
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Payroll · เฟส 4</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><SlidersHorizontal className="w-6 h-6 text-emerald-500" /> รับ-หักอื่นๆ</h1>
          <p className="text-xs text-zinc-400 mt-0.5">รายการมีชื่อต่อคน/เดือน — เงินเดือนรวมยอดเข้าช่อง รับ/หัก (WHT/ไม่WHT) อัตโนมัติ</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40 text-sm" />
          <Button variant="outline" className="h-9 gap-1.5" onClick={() => setShowPaste((v) => !v)}>
            <ClipboardPaste className="w-4 h-4" /> นำเข้า (วางจาก Excel)
          </Button>
          <Button variant="outline" className="h-9 gap-1.5" onClick={copyFromPrev}>
            ⟳ คัดลอกรายการประจำจากเดือนก่อน
          </Button>
          <button type="button" onClick={exportExcel}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg h-9 px-3 hover:bg-emerald-100">
            Excel
          </button>
        </div>
      </div>

      {showPaste && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="block text-[10px] text-zinc-400 mb-0.5">ประเภทรายการ</label>
              <select value={pType} onChange={(e) => setPType(e.target.value)} className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 text-sm">
                {EXTRA_TYPES.map((t) => <option key={t.key} value={t.key}>[{t.kind === "income" ? "รับ" : "หัก"}] {t.label}</option>)}
              </select>
            </div>
            <p className="text-[11px] text-zinc-400 flex-1">
              copy จาก Excel 2 คอลัมน์: <b>อ้างอิง</b> (รหัสสัญญา / ทะเบียน / ชื่อคนขับ) + <b>จำนวนเงิน</b> แล้ววางที่นี่ — ระบบจับคู่สัญญาให้เอง
            </p>
          </div>
          <textarea value={pasteText} onChange={(e) => { setPasteText(e.target.value); setPreview(null) }}
            placeholder={"MTL003\t1500\nสบ.71-1956\t2000\nสมดี คงเคน\t800"}
            className="w-full h-36 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9" disabled={busy} onClick={() => runImport(true)}>ตรวจก่อน (preview)</Button>
            <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" disabled={busy || !preview} onClick={() => runImport(false)}>
              <Check className="w-4 h-4" /> ยืนยันนำเข้า
            </Button>
            {preview && preview.unmatched.length > 0 && (
              <span className="text-[11px] text-amber-600">ไม่พบสัญญา: {preview.unmatched.slice(0, 4).map((u: any) => u.ref).join(", ")}{preview.unmatched.length > 4 ? ` +${preview.unmatched.length - 4}` : ""}</span>
            )}
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      {/* เพิ่มเดี่ยว */}
      <div className="flex items-end gap-2 flex-wrap bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3">
        <select value={nType} onChange={(e) => setNType(e.target.value)} className="h-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 text-sm">
          {EXTRA_TYPES.map((t) => <option key={t.key} value={t.key}>[{t.kind === "income" ? "รับ" : "หัก"}] {t.label}</option>)}
        </select>
        <Input placeholder="รหัสสัญญา (MTL003)" value={nCC} onChange={(e) => setNCC(e.target.value)} className="h-9 w-40 text-sm font-mono" />
        <Input type="number" placeholder="จำนวนเงิน" value={nAmt} onChange={(e) => setNAmt(e.target.value)} className="h-9 w-32 text-sm text-right" />
        <Input placeholder="หมายเหตุ" value={nNote} onChange={(e) => setNNote(e.target.value)} className="h-9 w-48 text-sm" />
        <Button className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={addOne}><Plus className="w-4 h-4" /> เพิ่ม</Button>
      </div>

      {/* tabs + ตาราง */}
      <div className="flex items-center gap-2">
        {(["income", "deduct"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${tab === k
              ? k === "income" ? "bg-emerald-600 text-white" : "bg-red-500 text-white"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            {k === "income" ? "รายรับ" : "รายหัก"} ({rows.filter((r) => r.kind === k).length})
          </button>
        ))}
        <span className="text-xs text-zinc-400 ml-2">รวม {fmt(total)} บาท</span>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 uppercase">
              <th className="px-2.5 py-2 text-left font-semibold">ประเภท</th>
              <th className="px-2.5 py-2 text-left font-semibold">พขร. / สัญญา</th>
              <th className="px-2.5 py-2 text-right font-semibold">จำนวนเงิน</th>
              <th className="px-2.5 py-2 text-center font-semibold">WHT</th>
              <th className="px-2.5 py-2 text-left font-semibold">หมายเหตุ / ที่มา</th>
              <th className="px-2.5 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-400 animate-pulse">กำลังโหลด...</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-400">ยังไม่มีรายการ{tab === "income" ? "รับ" : "หัก"}เดือนนี้</td></tr>
            ) : visible.map((r) => (
              <tr key={r._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-2.5 py-2">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.kind === "income" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"}`}>{r.label}</span>
                </td>
                <td className="px-2.5 py-2">
                  <span className="text-zinc-700 dark:text-zinc-200">{r.driverName ?? "—"}</span>
                  <span className="text-[10px] text-zinc-400 font-mono ml-1.5">{r.contractCode}</span>
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{fmt(r.amount)}</td>
                <td className="px-2.5 py-2 text-center">
                  <button type="button" title="สลับหัก ณ ที่จ่าย"
                    onClick={async () => { await fetch("/api/partner/payroll-extras", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r._id, wht: !r.wht }) }); await load() }}
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${r.wht ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
                    {r.wht ? "WHT" : "ไม่หัก"}
                  </button>
                </td>
                <td className="px-2.5 py-2 text-zinc-400">
                  {r.note && <span className="mr-1.5">{r.note}</span>}
                  <span className="text-[9px]">{r.source === "import" ? "นำเข้า" : "กรอกมือ"}</span>
                </td>
                <td className="px-2.5 py-2">
                  <button onClick={() => del(r._id)} className="text-zinc-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-zinc-400">ประเภทที่รองรับ: {EXTRA_TYPES.filter((t) => t.kind === tab).map((t) => t.label).join(" · ")}</p>
    </div>
  )
}
