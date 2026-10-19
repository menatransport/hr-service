/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

/**
 * วันทำงาน พจร. (payroll เฟส 2) — อัปโหลด Excel ชีต "สถานะวันทำงาน พจร." ของทีม
 * preview ตรวจก่อน → ยืนยัน = แทนที่ข้อมูลทั้งเดือน · payroll ใช้วันทำงานจากที่นี่อัตโนมัติ
 */

import { useCallback, useEffect, useState } from "react"
import { CalendarCheck, Upload, Check, AlertTriangle } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { Button } from "@/components/partner/ui/button"
import { FileZone } from "@/components/partner/excel-import"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"

/* eslint-disable @typescript-eslint/no-explicit-any */

function currentMonth() { return new Date().toISOString().slice(0, 7) }
const fmt = (n: any) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })

export default function AttendancePage() {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/partner/attendance?month=${month}`)
      if (r.ok) setRows(await r.json())
    } finally { setLoading(false) }
  }, [month])
  useEffect(() => { load(); setPreview(null) }, [load])

  async function run(action: "preview" | "confirm") {
    if (!file) { setMsg("เลือกไฟล์ก่อน"); return }
    setBusy(true); setMsg("")
    try {
      const fd = new FormData()
      fd.append("file", file); fd.append("month", month); fd.append("action", action)
      const r = await fetch("/api/partner/import/attendance", { method: "POST", body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(d.error ?? "ไม่สำเร็จ"); return }
      if (action === "preview") { setPreview(d); setMsg(`ตรวจแล้ว: ${d.total} คน · ไม่พบสัญญา ${d.noContract} · มีข้อสังเกต ${d.withWarn}`) }
      else { setPreview(null); setFile(null); setMsg(`✓ นำเข้าแล้ว ${d.imported} คน (เดือน ${month})`); await load() }
    } finally { setBusy(false) }
  }

  const visible = rows.filter((r) => !q || [r.driverName, r.contractCode, r.licensePlate, r.staffCode].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase())))

  async function exportExcel() {
    await exportToExcel([{ name: `วันทำงาน-${month}`, rows: visible.map((r) => ({
      "ชื่อ": r.driverName, "รหัส": r.staffCode, "ทะเบียน": r.licensePlate, "สัญญา": r.contractCode,
      "สถานะ": r.driverStatus, "ผู้ว่าจ้าง": r.employer, "แพล้นท์": r.plant, "วันทำงาน": r.workDays,
      "ค่าวินัย": r.allowances?.discipline, "โซนหนาแน่น": r.allowances?.denseZone, "ค่าฝีมือ": r.allowances?.skill,
      "เบี้ยขยัน": r.allowances?.diligence, "ค่าเช่าบ้าน": r.allowances?.houseRent, "สูตร": r.eligible ? "ได้" : "ไม่ได้",
    })) }], `attendance-${month}-${todayStamp()}`)
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Payroll · เฟส 2</p>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2"><CalendarCheck className="w-6 h-6 text-emerald-500" /> วันทำงาน พจร.</h1>
          <p className="text-xs text-zinc-400 mt-0.5">อัปโหลดไฟล์ Excel ชีต “สถานะวันทำงาน พจร.” — ยืนยันแล้ว payroll ใช้วันทำงานจากที่นี่อัตโนมัติ</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-40 text-sm" />
          <button type="button" onClick={exportExcel}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg h-9 px-3 hover:bg-emerald-100">
            Excel
          </button>
        </div>
      </div>

      {/* อัปโหลด */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
        <FileZone file={file} onFile={(f) => { setFile(f); setPreview(null); setMsg("") }} />
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 gap-1.5" disabled={busy || !file} onClick={() => run("preview")}>
            <Upload className="w-4 h-4" /> ตรวจไฟล์ (preview)
          </Button>
          <Button className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy || !preview} onClick={() => run("confirm")}>
            <Check className="w-4 h-4" /> ยืนยันนำเข้า → เดือน {month}
          </Button>
          {msg && <span className="text-xs text-emerald-600">{msg}</span>}
        </div>
        <p className="text-[10px] text-zinc-400">ยืนยัน = แทนที่ข้อมูลเดือน {month} ทั้งชุดด้วยไฟล์นี้ (ไฟล์คือความจริงของเดือน)</p>
      </div>

      {/* preview */}
      {preview && (
        <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
            ตรวจไฟล์: {preview.total} คน · ไม่พบสัญญา {preview.noContract} คน · วันทำงานไฟล์≠คำนวณ {preview.withWarn} คน
          </p>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-zinc-400 text-left"><th className="py-1 pr-3">ชื่อ</th><th className="pr-3">ทะเบียน</th><th className="pr-3">สัญญา</th><th className="text-right pr-3">วันทำงาน</th><th>ข้อสังเกต</th></tr></thead>
              <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40">
                {preview.rows.map((r: any, i: number) => (
                  <tr key={i} className={!r.contractCode || r.warnings?.length ? "text-amber-800 dark:text-amber-300" : "text-zinc-600 dark:text-zinc-300"}>
                    <td className="py-1 pr-3">{r.driverName}</td>
                    <td className="pr-3 font-mono">{r.licensePlate}</td>
                    <td className="pr-3 font-mono">{r.contractCode || "— ไม่พบ"}</td>
                    <td className="text-right pr-3 tabular-nums">{r.workDays}</td>
                    <td className="text-[10px]">{r.warnings?.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ข้อมูลที่นำเข้าแล้ว */}
      <div className="flex items-center gap-2">
        <Input placeholder="ค้นหา..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 text-xs" />
        <span className="text-xs text-zinc-400">{visible.length} คน · วันทำงานรวม {fmt(visible.reduce((s, r) => s + (r.workDays || 0), 0))}</span>
      </div>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 uppercase">
                <th className="px-2.5 py-2 text-left font-semibold">พขร. / รหัส</th>
                <th className="px-2.5 py-2 text-left font-semibold">ทะเบียน / สัญญา</th>
                <th className="px-2.5 py-2 text-left font-semibold">ผู้ว่าจ้าง / แพล้นท์</th>
                <th className="px-2.5 py-2 text-center font-semibold">วันทำงาน</th>
                <th className="px-2.5 py-2 text-left font-semibold">ตารางวัน (1–31)</th>
                <th className="px-2.5 py-2 text-center font-semibold">เบี้ยรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-400 animate-pulse">กำลังโหลด...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-zinc-400">ยังไม่มีข้อมูลเดือนนี้ — อัปโหลดไฟล์ด้านบน</td></tr>
              ) : visible.map((r) => {
                const allow = (r.allowances?.discipline || 0) + (r.allowances?.denseZone || 0) + (r.allowances?.skill || 0) + (r.allowances?.diligence || 0) + (r.allowances?.houseRent || 0)
                return (
                  <tr key={r._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 align-top">
                    <td className="px-2.5 py-2">
                      <div className="font-medium text-zinc-800 dark:text-zinc-100">{r.driverName}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">{r.staffCode} · {r.driverStatus}</div>
                    </td>
                    <td className="px-2.5 py-2 font-mono text-zinc-500">
                      <div>{r.licensePlate}</div>
                      <div className="text-[10px]">{r.contractCode || <span className="text-amber-600 inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> ไม่พบสัญญา</span>}</div>
                    </td>
                    <td className="px-2.5 py-2 text-zinc-500">
                      <div className="truncate max-w-[180px]" title={r.employer}>{r.employer || "—"}</div>
                      <div className="text-[10px] text-zinc-400">{r.plant}</div>
                    </td>
                    <td className="px-2.5 py-2 text-center tabular-nums font-bold">{r.workDays}</td>
                    <td className="px-2.5 py-2">
                      <div className="flex gap-px flex-wrap max-w-[340px]" title={(r.days ?? []).map((c: string, i: number) => `${i + 1}:${c || "-"}`).join(" ")}>
                        {(r.days ?? []).map((c: string, i: number) => (
                          <span key={i} className={`inline-block w-2.5 h-2.5 rounded-[2px] ${
                            /^A/i.test(c) ? "bg-emerald-400" : c && !isNaN(parseFloat(c)) ? "bg-amber-400" : c ? "bg-red-400" : "bg-zinc-150 bg-zinc-200 dark:bg-zinc-700"
                          }`} />
                        ))}
                      </div>
                    </td>
                    <td className="px-2.5 py-2 text-center tabular-nums">{allow > 0 ? fmt(allow) : <span className="text-zinc-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-zinc-400">■ เขียว = ทำงาน (A*) · เหลือง = บางส่วน (0.25–0.75) · แดง = ลา/ขาด · เทา = ว่าง — เบี้ย 5 ตัวเก็บไว้แล้ว จะผูกเข้าเงินเดือนในเฟส 4 (payroll v2)</p>
    </div>
  )
}
