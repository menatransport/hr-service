"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { hasPerm } from "@/lib/partner/rbac"
import { Upload, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/partner/ui/button"

// Mapping from Thai/English header aliases → Trip field keys
const HEADER_MAP: Record<string, string> = {
  // contractCode
  "รหัสสัญญา": "contractCode", "contract code": "contractCode", "contractcode": "contractCode", "code": "contractCode",
  // date
  "วันที่": "date", "date": "date",
  // ldtNumber
  "เลขที่ ldt": "ldtNumber", "ldt": "ldtNumber", "ldtnumber": "ldtNumber", "ldt number": "ldtNumber", "เลข ldt": "ldtNumber",
  // plant
  "แพล้นท์": "plant", "plant": "plant", "โรงงาน": "plant",
  // serviceType
  "บริการ": "serviceType", "service": "serviceType", "servicetype": "serviceType", "ประเภทบริการ": "serviceType",
  // routeCode
  "route": "routeCode", "routecode": "routeCode", "ship to": "routeCode", "shipto": "routeCode", "รหัสเส้นทาง": "routeCode",
  // destinationName
  "ปลายทาง": "destinationName", "destination": "destinationName", "destinationname": "destinationName", "ชื่อปลายทาง": "destinationName",
  // district
  "อำเภอ": "district", "district": "district",
  // province
  "จังหวัด": "province", "province": "province",
  // zone
  "โซน": "zone", "zone": "zone",
  // tripFee
  "ค่าเที่ยว": "tripFee", "trip fee": "tripFee", "tripfee": "tripFee", "ค่าขนส่ง": "tripFee", "ราคา": "tripFee", "fee": "tripFee",
}

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ")
}

function parseCSV(text: string): string[][] {
  // Handle both comma and tab-separated; strip BOM
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const delim = cleaned.split("\n")[0]?.includes("\t") ? "\t" : ","
  return cleaned.split("\n").filter((l) => l.trim()).map((line) =>
    line.split(delim).map((cell) => cell.replace(/^"|"$/g, "").trim())
  )
}

interface ParsedRow {
  contractCode: string
  date: string
  ldtNumber: string
  plant: string
  serviceType: string
  routeCode: string
  destinationName: string
  district: string
  province: string
  zone: string
  tripFee: number
  _error?: string
}

function buildRows(rows: string[][], headers: string[]): ParsedRow[] {
  const keyMap: Record<number, string> = {}
  headers.forEach((h, i) => {
    const mapped = HEADER_MAP[normalizeKey(h)]
    if (mapped) keyMap[i] = mapped
  })

  return rows.map((cells) => {
    const obj: Record<string, string> = {}
    cells.forEach((c, i) => { if (keyMap[i]) obj[keyMap[i]] = c })

    // Basic date normalization: DD/MM/YYYY → YYYY-MM-DD
    let date = obj.date ?? ""
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
      const [d, m, y] = date.split("/")
      date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }

    const contractCode = obj.contractCode ?? ""
    const tripFee = parseFloat(obj.tripFee?.replace(/,/g, "") ?? "0") || 0
    let _error: string | undefined
    if (!contractCode) _error = "ไม่มีรหัสสัญญา"
    else if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) _error = "วันที่ไม่ถูกต้อง"

    return {
      contractCode,
      date,
      ldtNumber: obj.ldtNumber ?? "",
      plant: obj.plant ?? "",
      serviceType: obj.serviceType ?? "",
      routeCode: obj.routeCode ?? "",
      destinationName: obj.destinationName ?? "",
      district: obj.district ?? "",
      province: obj.province ?? "",
      zone: obj.zone ?? "",
      tripFee,
      _error,
    }
  })
}

export default function TripImportPage() {
  const { data: session } = usePartnerSession()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [csvText, setCsvText]   = useState("")
  const [parsed, setParsed]     = useState<ParsedRow[] | null>(null)
  const [, setHeaders]   = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]     = useState<{ inserted: number; skipped: number } | null>(null)
  const [parseError, setParseError] = useState("")

  if (!hasPerm(session?.user?.role, "vehiclecost")) {
    return <div className="p-8 text-center text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>
  }

  function handleParse() {
    setParseError("")
    if (!csvText.trim()) { setParseError("กรุณาวางข้อมูล CSV"); return }
    const lines = parseCSV(csvText)
    if (lines.length < 2) { setParseError("ไม่พบข้อมูล (ต้องมีแถวหัวตารางและข้อมูลอย่างน้อย 1 แถว)"); return }
    const [headerRow, ...dataRows] = lines
    setHeaders(headerRow)
    const rows = buildRows(dataRows, headerRow)
    if (rows.length === 0) { setParseError("ไม่พบแถวข้อมูล"); return }
    setParsed(rows)
    setResult(null)
  }

  async function handleImport() {
    if (!parsed) return
    const valid = parsed.filter((r) => !r._error)
    if (valid.length === 0) { setParseError("ไม่มีแถวที่ถูกต้องเพื่อนำเข้า"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/partner/trips/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: valid }),
      })
      const d = await res.json()
      if (!res.ok) { setParseError(d.error ?? "เกิดข้อผิดพลาด"); return }
      setResult(d)
    } finally { setSubmitting(false) }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? "")
      setParsed(null)
      setResult(null)
    }
    reader.readAsText(f, "utf-8")
  }

  const validRows = parsed?.filter((r) => !r._error) ?? []
  const invalidRows = parsed?.filter((r) => r._error) ?? []

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <button
          onClick={() => router.push("/partner/trips")}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3"
        >
          <ArrowLeft className="w-3 h-3" /> กลับ
        </button>
        <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">นำเข้ารายเที่ยว (CSV)</h1>
        <p className="text-sm text-zinc-400 mt-1">
          รองรับ CSV ทั้ง comma และ tab-separated · วางข้อมูลหรืออัปโหลดไฟล์ · ระบบจะข้ามเลขที่ LDT ซ้ำโดยอัตโนมัติ
        </p>
      </div>

      {/* Column guide */}
      <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">คอลัมน์ที่รองรับ</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300">
          {[
            ["รหัสสัญญา *", "contractCode"],
            ["วันที่ *", "date (YYYY-MM-DD หรือ DD/MM/YYYY)"],
            ["เลขที่ LDT", "ldtNumber (ใช้ dedup)"],
            ["แพล้นท์", "plant"],
            ["บริการ", "serviceType"],
            ["Route/Ship To", "routeCode"],
            ["ปลายทาง", "destinationName"],
            ["อำเภอ", "district"],
            ["จังหวัด", "province"],
            ["โซน", "zone"],
            ["ค่าเที่ยว", "tripFee"],
          ].map(([th, desc]) => (
            <div key={th}>
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{th}</span>
              <span className="text-zinc-400"> — {desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Input area */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300 flex-1">วางข้อมูล CSV หรืออัปโหลดไฟล์</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
          >
            <Upload className="w-3.5 h-3.5" />
            เลือกไฟล์
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
        </div>
        <textarea
          value={csvText}
          onChange={(e) => { setCsvText(e.target.value); setParsed(null); setResult(null) }}
          rows={8}
          placeholder={"รหัสสัญญา,วันที่,เลขที่ LDT,แพล้นท์,ปลายทาง,จังหวัด,ค่าเที่ยว\nMTL001,2026-06-01,LDT-001,สระบุรี,ปลายทาง A,กรุงเทพ,3500"}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono resize-y dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {parseError && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> {parseError}
          </p>
        )}
        <Button
          type="button"
          onClick={handleParse}
          disabled={!csvText.trim()}
          className="bg-zinc-700 hover:bg-zinc-800 text-white"
        >
          ตรวจสอบข้อมูล
        </Button>
      </div>

      {/* Preview */}
      {parsed && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
              พบ {parsed.length} แถว · ถูกต้อง <span className="text-emerald-600">{validRows.length}</span>
              {invalidRows.length > 0 && <> · ข้อผิดพลาด <span className="text-red-500">{invalidRows.length}</span></>}
            </p>
            {validRows.length > 0 && !result && (
              <Button
                type="button"
                onClick={handleImport}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {submitting ? "กำลังนำเข้า..." : `นำเข้า ${validRows.length} รายการ`}
              </Button>
            )}
          </div>

          {result && (
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm dark:bg-emerald-950/30 dark:border-emerald-700">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="font-semibold text-emerald-700">นำเข้าสำเร็จ!</span>
                <span className="ml-2 text-zinc-600">บันทึกแล้ว {result.inserted} รายการ</span>
                {result.skipped > 0 && <span className="ml-2 text-zinc-400">ข้าม {result.skipped} (LDT ซ้ำ)</span>}
              </div>
              <button
                onClick={() => router.push("/partner/trips")}
                className="ml-auto text-emerald-600 hover:underline text-xs font-medium"
              >
                ดูรายเที่ยว →
              </button>
            </div>
          )}

          {/* Invalid row errors */}
          {invalidRows.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900 p-3 space-y-1">
              <p className="text-xs font-semibold text-red-500 mb-1">แถวที่มีข้อผิดพลาด (จะถูกข้าม)</p>
              {invalidRows.slice(0, 10).map((r, i) => (
                <p key={i} className="text-xs text-red-600">
                  แถว {parsed.indexOf(r) + 2}: {r.contractCode || "(ไม่มีรหัส)"} — {r._error}
                </p>
              ))}
              {invalidRows.length > 10 && <p className="text-xs text-red-400">...และอีก {invalidRows.length - 10} แถว</p>}
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800 text-zinc-500 uppercase tracking-wide">
                <tr>
                  <th className="px-2.5 py-2 text-left">#</th>
                  <th className="px-2.5 py-2 text-left">รหัส / วันที่</th>
                  <th className="px-2.5 py-2 text-left">LDT</th>
                  <th className="px-2.5 py-2 text-left">แพล้นท์</th>
                  <th className="px-2.5 py-2 text-left">ปลายทาง / จังหวัด</th>
                  <th className="px-2.5 py-2 text-right">ค่าเที่ยว</th>
                  <th className="px-2.5 py-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i} className={r._error ? "bg-red-50 dark:bg-red-950/10" : ""}>
                    <td className="px-2.5 py-2 align-top text-zinc-400 tabular-nums">{i + 1}</td>
                    {/* รหัส / วันที่ */}
                    <td className="px-2.5 py-2 align-top">
                      <div className="font-medium truncate max-w-[130px]" title={r.contractCode}>{r.contractCode || <span className="text-red-400">-</span>}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">{r.date || <span className="text-red-400">-</span>}</div>
                    </td>
                    <td className="px-2.5 py-2 align-top font-mono truncate max-w-[120px]" title={r.ldtNumber}>{r.ldtNumber}</td>
                    <td className="px-2.5 py-2 align-top text-zinc-500 truncate max-w-[100px]" title={r.plant}>{r.plant}</td>
                    {/* ปลายทาง / จังหวัด */}
                    <td className="px-2.5 py-2 align-top">
                      <div className="truncate max-w-[200px]" title={r.destinationName}>{r.destinationName}</div>
                      {r.province && <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[200px]" title={r.province}>{r.province}</div>}
                    </td>
                    <td className="px-2.5 py-2 align-top text-right tabular-nums whitespace-nowrap">{r.tripFee.toLocaleString()}</td>
                    <td className="px-2.5 py-2 align-top text-center">
                      {r._error
                        ? <span className="text-red-500">✕</span>
                        : <span className="text-emerald-500">✓</span>
                      }
                    </td>
                  </tr>
                ))}
                {parsed.length > 50 && (
                  <tr>
                    <td colSpan={7} className="px-2.5 py-2 text-center text-zinc-400">
                      ...และอีก {parsed.length - 50} แถว (ทั้งหมดจะถูกนำเข้า)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
