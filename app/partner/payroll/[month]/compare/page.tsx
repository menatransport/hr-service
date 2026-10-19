"use client"

import { useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, Scale } from "lucide-react"
import { formatMoney, formatMonth } from "@/lib/partner/utils"

interface FieldStat {
  name: string; exact: number; off: number
  sumSys: number; sumFile: number; sumDelta: number
  deltas: { code: string; driverName: string; sys: number; file: number; delta: number }[]
}
interface Result {
  month: string; sheetName: string; fileDrivers: number; compared: number
  noEntry: string[]; extraEntries: string[]; matchRate: number; fields: FieldStat[]
}

const FIELD_TH: Record<string, string> = {
  workingDays: "วันทำงาน", tripCount: "จำนวนเที่ยว", transportFee: "ค่าขนส่ง", ot: "OT",
  otherIncWHT: "รับอื่น WHT (+เบี้ย)", otherIncNoWHT: "รับอื่นไม่ WHT", fuelNet: "น้ำมันสุทธิ",
  gps: "GPS", "repair+labor": "ค่าซ่อม/แรง/ยาง/ล้าง (รวม)", taxInsurance: "ภาษีประกัน (+ledger)",
  installment: "ค่างวดรถ (+ledger)", repairInstall: "ผ่อนซ่อม (+ledger)", downPayment: "ผ่อนดาวน์ (+ledger)",
  otherDedWHT: "หักอื่น WHT (+จราจร)", "otherDedNoWHT+misc": "หักอื่นไม่ WHT + รายการพิเศษ",
  wht3pct: "ภาษีหัก ณ ที่จ่าย 3%", netBeforeCarry: "สุทธิก่อนยกยอด (ตัวตัดสิน)",
}

export default function ComparePage() {
  const { month } = useParams<{ month: string }>()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [res, setRes] = useState<Result | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  async function upload(f: File) {
    setBusy(true); setErr(""); setRes(null)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const r = await fetch(`/api/partner/payroll/${month}/compare`, { method: "POST", body: fd })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? "เทียบไม่สำเร็จ"); return }
      setRes(d)
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/partner/payroll/${month}`} className="text-zinc-400 hover:text-zinc-600"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Scale className="w-5 h-5 text-blue-600" /> Parallel Run เทียบไฟล์ · {formatMonth(month)}</h1>
          <p className="text-xs text-zinc-400 mt-0.5">อัปโหลดไฟล์ Payroll ของงวด (ชีต Summary) — เทียบกับงวดในระบบรายฟิลด์รายคน · เกณฑ์ cutover: สุทธิตรง ≥ 99% สองงวดติด</p>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = "" }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
        <FileSpreadsheet className="w-4 h-4" /> {busy ? "กำลังเทียบ..." : "อัปโหลดไฟล์ Payroll เพื่อเทียบ"}
      </button>

      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{err}</div>}

      {res && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="พจส. ในไฟล์" value={String(res.fileDrivers)} />
            <Card label="เทียบได้" value={String(res.compared)} sub={res.noEntry.length ? `ไม่มีงวดในระบบ ${res.noEntry.length}` : "ครบทุกคน"} />
            <Card label="สุทธิตรงกัน" value={`${res.fields.find((f) => f.name === "netBeforeCarry")?.exact ?? 0} คน`} />
            <Card label="Match rate" value={`${res.matchRate.toFixed(1)}%`} strong={res.matchRate >= 99} />
          </div>

          {res.noEntry.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ในไฟล์แต่ไม่มีงวดในระบบ: {res.noEntry.join(", ")}
            </p>
          )}
          {res.extraEntries.length > 0 && (
            <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
              ในระบบแต่ไม่อยู่ในไฟล์: {res.extraEntries.join(", ")}
            </p>
          )}

          <div className="bg-white border border-zinc-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-100 bg-zinc-50">
                  <th className="text-left py-2 px-3 font-medium">ฟิลด์</th>
                  <th className="text-right font-medium">ตรง</th>
                  <th className="text-right font-medium">ต่าง</th>
                  <th className="text-right font-medium">Σ ระบบ</th>
                  <th className="text-right font-medium">Σ ไฟล์</th>
                  <th className="text-right font-medium pr-3">Σ ผลต่าง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {res.fields.map((f) => (
                  <FieldRow key={f.name} f={f} open={open === f.name} onToggle={() => setOpen(open === f.name ? null : f.name)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function FieldRow({ f, open, onToggle }: { f: FieldStat; open: boolean; onToggle: () => void }) {
  const ok = f.off === 0
  return (
    <>
      <tr onClick={() => !ok && onToggle()} className={ok ? "" : "cursor-pointer hover:bg-zinc-50"}>
        <td className="py-1.5 px-3">{ok ? "✅" : "⚠️"} {FIELD_TH[f.name] ?? f.name}{!ok && <span className="text-zinc-300 ml-1">{open ? "▾" : "▸"}</span>}</td>
        <td className="text-right text-emerald-600">{f.exact}</td>
        <td className={`text-right ${f.off ? "text-red-600 font-medium" : "text-zinc-300"}`}>{f.off}</td>
        <td className="text-right">{formatMoney(f.sumSys)}</td>
        <td className="text-right">{formatMoney(f.sumFile)}</td>
        <td className={`text-right pr-3 ${Math.abs(f.sumDelta) > 0.02 ? "text-red-600" : "text-zinc-300"}`}>{formatMoney(f.sumDelta)}</td>
      </tr>
      {open && f.deltas.length > 0 && (
        <tr>
          <td colSpan={6} className="bg-zinc-50 px-6 py-2">
            <table className="w-full text-[11px]">
              <tbody>
                {f.deltas.map((d) => (
                  <tr key={d.code}>
                    <td className="py-0.5">{d.code} · {d.driverName}</td>
                    <td className="text-right">ระบบ {formatMoney(d.sys)}</td>
                    <td className="text-right">ไฟล์ {formatMoney(d.file)}</td>
                    <td className={`text-right font-medium ${d.delta > 0 ? "text-red-600" : "text-blue-600"}`}>Δ {formatMoney(d.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  )
}

function Card({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${strong ? "border-emerald-500 bg-emerald-50" : "border-zinc-100 bg-white"}`}>
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${strong ? "text-emerald-700" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}
