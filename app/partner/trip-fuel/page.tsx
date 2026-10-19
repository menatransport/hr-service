/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

/**
 * ค่าเที่ยว & เชื้อเพลิง (payroll เฟส 1) — ดึงสรุปจาก BI (mena-bi.driverCost) ต่อเดือน
 * กระทบยอดเชื้อเพลิงตามสูตรชีต "ค่าขนส่ง": ใช้จริง = เติม+ยกเข้า−ยกออก · หัก = ใช้จริง×ราคา
 * แถวที่มีสัญญา → payroll ใช้ตัวเลขชุดนี้เป็น ค่าขนส่ง + ค่าเชื้อเพลิง อัตโนมัติ
 */

import { useCallback, useEffect, useState, useRef } from "react"
import { toast } from "sonner"
import { confirm } from "@/components/partner/ui/confirm"
import { Fuel, RefreshCw, Download, Save } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmt = (n: any) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })

function currentMonth() { return new Date().toISOString().slice(0, 7) }

export default function TripFuelPage() {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<any[]>([])
  const [cfg, setCfg] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [msg, setMsg] = useState("")
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/partner/trip-fuel?month=${month}`)
      if (r.ok) { const d = await r.json(); setRows(d.rows); setCfg(d.config) }
    } finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  async function uploadFile(f: File) {
    setSyncing(true)
    try {
      const fd = new FormData()
      fd.append("file", f); fd.append("month", month); fd.append("action", "preview")
      const r = await fetch("/api/partner/import/trip-fuel", { method: "POST", body: fd })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? "อ่านไฟล์ไม่สำเร็จ"); return }
      const t = d.totals
      const msg = `ชีต: ${d.sheetName}\nพจส. ${t.drivers} คน · ${t.tripCount.toLocaleString()} เที่ยว\nค่าเที่ยวรวม ${t.tripFee.toLocaleString()} บาท\nหักน้ำมัน ${t.fuelDeduct.toLocaleString()} บาท (เกินเรต ${t.overMoney.toLocaleString()} / คืน ${t.underMoney.toLocaleString()})` +
        (d.unmatched.length ? `\n\n⚠ จับคู่สัญญาไม่ได้ ${d.unmatched.length} คน: ${d.unmatched.slice(0, 8).join(", ")}${d.unmatched.length > 8 ? "…" : ""}` : "") +
        `\n\nยืนยันแทนที่ข้อมูลเดือน ${month} ทั้งชุด?`
      if (!await confirm(msg)) return
      const fd2 = new FormData()
      fd2.append("file", f); fd2.append("month", month); fd2.append("action", "confirm")
      const r2 = await fetch("/api/partner/import/trip-fuel", { method: "POST", body: fd2 })
      const d2 = await r2.json()
      if (!r2.ok) { toast.error(d2.error ?? "นำเข้าไม่สำเร็จ"); return }
      await load()
    } finally { setSyncing(false) }
  }

  async function sync() {
    setSyncing(true); setMsg("")
    try {
      const r = await fetch("/api/partner/trip-fuel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, action: "sync" }) })
      const d = await r.json().catch(() => ({}))
      setMsg(r.ok ? `✓ ดึงสำเร็จ — ${d.biRows} ใบ LDT → ${d.drivers} พขร.` : (d.error ?? "ดึงไม่สำเร็จ"))
      await load()
    } finally { setSyncing(false) }
  }

  async function saveCfg() {
    setSavingCfg(true); setMsg("")
    try {
      const r = await fetch("/api/partner/trip-fuel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cfg, month }) })
      setMsg(r.ok ? "✓ บันทึกราคา + คำนวณใหม่ทุกแถวแล้ว" : "บันทึกไม่สำเร็จ")
      await load()
    } finally { setSavingCfg(false) }
  }

  async function patchRow(id: string, patch: any) {
    await fetch("/api/partner/trip-fuel", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) })
    await load()
  }

  const visible = rows.filter((r) => !q || [r.driverName, r.contractCode, r.licensePlate].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase())))
  const sum = (k: string) => visible.reduce((s, r) => s + (Number(r[k]) || 0), 0)

  async function exportExcel() {
    await exportToExcel([{ name: `ค่าเที่ยว-${month}`, rows: visible.map((r) => ({
      "พขร.": r.driverName, "สัญญา": r.contractCode, "ทะเบียน": r.licensePlate, "เที่ยว": r.tripCount,
      "ค่าเที่ยวรวม": r.tripFee, "ดีเซลอนุมัติ": r.dieselApproved, "เติม": r.dieselFilled,
      "ยกเข้า": r.dieselCarryIn, "ยกออก": r.dieselCarryOut, "ใช้จริง": r.dieselUsed,
      "เกิน": r.dieselOver, "ต่ำกว่า": r.dieselUnder, "NGV ใช้จริง": r.ngvUsed,
      "เงินเกินเรต": r.overMoney, "เงินคืน": r.underMoney, "หักเชื้อเพลิง": r.fuelDeduct, "คงเหลือ": r.netAfterFuel,
    })) }], `trip-fuel-${month}-${todayStamp()}`)
  }

  const cfgField = (k: string, label: string) => (
    <div key={k}>
      <label className="block text-[10px] text-zinc-400 mb-0.5">{label}</label>
      <Input type="number" step="0.01" value={cfg?.[k] ?? 0}
        onChange={(e) => setCfg((p: any) => ({ ...p, [k]: Number(e.target.value) || 0 }))}
        className="h-8 w-24 text-xs text-right" />
    </div>
  )

  return (
    <div className="max-w-[1500px] mx-auto py-6 px-4 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Payroll · เฟส 1</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><Fuel className="w-6 h-6 text-emerald-500" /> ค่าเที่ยว & เชื้อเพลิง</h1>
          <p className="text-xs text-zinc-400 mt-0.5">อัปโหลดไฟล์ &quot;ค่าเที่ยว Mixer พจร.&quot; จากปฏิบัติการ (ชีตสรุปค่าเที่ยว) — ไฟล์คือแหล่งจริงของเดือน · payroll ใช้เลขนี้อัตโนมัติ</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40 text-sm" />
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = "" }} />
          <Button className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={syncing}
            onClick={() => fileRef.current?.click()}>
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "กำลังนำเข้า..." : "อัปโหลดไฟล์ค่าเที่ยว"}
          </Button>
          <button type="button" onClick={exportExcel}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg h-9 px-3 hover:bg-emerald-100">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* ราคาเชื้อเพลิงของเดือน */}
      {cfg && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="flex items-end gap-3 flex-wrap">
            {cfgField("dieselPrice", "ดีเซล ฿/ลิตร")}
            {cfgField("dieselOverPrice", "ดีเซลเกินเรต ฿/ล.")}
            {cfgField("dieselUnderPrice", "ดีเซลต่ำกว่าเรต ฿/ล.")}
            {cfgField("ngvPrice", "NGV ฿/กก.")}
            {cfgField("ngvOverPrice", "NGV เกินเรต")}
            {cfgField("ngvUnderPrice", "NGV ต่ำกว่าเรต")}
            {cfgField("overThreshold", "เกณฑ์ยกให้ (฿)")}
            {cfgField("overPenalty", "ค่าปรับเกินเกณฑ์ (฿)")}
            <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" disabled={savingCfg} onClick={saveCfg}>
              <Save className="w-3.5 h-3.5" /> บันทึกราคา
            </Button>
            <p className="text-[10px] text-zinc-400">เกินเรต: ยอด ≤ เกณฑ์ = ยกให้ · เกินเกณฑ์ = เก็บเต็ม + ค่าปรับ · ต่ำกว่าเรตคืนเต็มจำนวน</p>
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-emerald-600">{msg}</p>}

      <div className="flex items-center gap-2">
        <Input placeholder="ค้นหา พขร. / สัญญา / ทะเบียน..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-64 text-xs" />
        <span className="text-xs text-zinc-400">{visible.length} คน · เที่ยวรวม {fmt(sum("tripCount"))} · ค่าเที่ยว {fmt(sum("tripFee"))} · หักเชื้อเพลิง {fmt(sum("fuelDeduct"))}</span>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 uppercase">
                <th className="px-2.5 py-2 text-left font-semibold">พขร. / สัญญา</th>
                <th className="px-2.5 py-2 text-center font-semibold">เที่ยว</th>
                <th className="px-2.5 py-2 text-right font-semibold">ค่าเที่ยวรวม</th>
                <th className="px-2.5 py-2 text-right font-semibold">ดีเซล อนุมัติ/เติม</th>
                <th className="px-2.5 py-2 text-right font-semibold">ยกเข้า/ยกออก</th>
                <th className="px-2.5 py-2 text-right font-semibold">ใช้จริง</th>
                <th className="px-2.5 py-2 text-right font-semibold">เกิน / ต่ำกว่า</th>
                <th className="px-2.5 py-2 text-right font-semibold">เงินเกิน/คืน</th>
                <th className="px-2.5 py-2 text-right font-semibold">หักเชื้อเพลิง</th>
                <th className="px-2.5 py-2 text-right font-semibold">คงเหลือ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-400 animate-pulse">กำลังโหลด...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-zinc-400">ยังไม่มีข้อมูลเดือนนี้ — กด “ดึงจาก BI”</td></tr>
              ) : visible.map((r) => (
                <tr key={r._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 align-top">
                  <td className="px-2.5 py-2">
                    <div className="font-medium text-zinc-800 dark:text-zinc-100">{r.driverName}</div>
                    <div className="text-[10px] text-zinc-400 font-mono">{r.contractCode || "— ไม่พบสัญญา"} · {r.licensePlate}{r.plateCount > 1 ? ` (+${r.plateCount - 1} คัน)` : ""}</div>
                  </td>
                  <td className="px-2.5 py-2 text-center tabular-nums">{r.tripCount}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{fmt(r.tripFee)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-zinc-500">{fmt(r.dieselApproved)} / {fmt(r.dieselFilled)}</td>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Input type="number" step="0.001" defaultValue={r.dieselCarryIn}
                        onBlur={(e) => Number(e.target.value) !== r.dieselCarryIn && patchRow(r._id, { dieselCarryIn: e.target.value })}
                        className="h-6 w-16 text-[11px] text-right px-1" title="ยกเข้า (ลิตร)" />
                      <span className="text-zinc-300">/</span>
                      <Input type="number" step="0.001" defaultValue={r.dieselCarryOut}
                        onBlur={(e) => Number(e.target.value) !== r.dieselCarryOut && patchRow(r._id, { dieselCarryOut: e.target.value })}
                        className="h-6 w-16 text-[11px] text-right px-1" title="ยกออก (ลิตร)" />
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmt(r.dieselUsed)}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    <span className={r.dieselOver > 0 ? "text-red-500 font-semibold" : "text-zinc-400"}>{fmt(r.dieselOver)}</span>
                    <span className="text-zinc-300"> / </span>
                    <span className={r.dieselUnder > 0 ? "text-emerald-600" : "text-zinc-400"}>{fmt(r.dieselUnder)}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums">
                    <span className={r.overMoney > 0 ? "text-red-500 font-semibold" : "text-zinc-400"}>{fmt(r.overMoney)}</span>
                    <span className="text-zinc-300"> / </span>
                    <span className={r.underMoney > 0 ? "text-emerald-600" : "text-zinc-400"}>{fmt(r.underMoney)}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">{fmt(r.fuelDeduct)}</td>
                  <td className={`px-2.5 py-2 text-right tabular-nums font-bold ${r.netAfterFuel < 0 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>{fmt(r.netAfterFuel)}</td>
                </tr>
              ))}
            </tbody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 font-semibold">
                  <td className="px-2.5 py-2">รวม {visible.length} คน</td>
                  <td className="px-2.5 py-2 text-center tabular-nums">{fmt(sum("tripCount"))}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmt(sum("tripFee"))}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-zinc-500">{fmt(sum("dieselApproved"))} / {fmt(sum("dieselFilled"))}</td>
                  <td className="px-2.5 py-2" />
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmt(sum("dieselUsed"))}</td>
                  <td className="px-2.5 py-2" />
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmt(sum("overMoney"))} / {fmt(sum("underMoney"))}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums text-red-600">{fmt(sum("fuelDeduct"))}</td>
                  <td className="px-2.5 py-2 text-right tabular-nums">{fmt(sum("netAfterFuel"))}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400">* NGV แสดงรวมในสูตรแล้ว (แก้ยกเข้า/ออก NGV ได้ในเฟสถัดไปถ้าใช้) · กด “ดึงจาก BI” ซ้ำได้ — ค่าที่กรอกมือ (ยกเข้า/ยกออก) จะไม่หาย</p>
    </div>
  )
}
