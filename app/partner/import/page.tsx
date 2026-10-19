"use client"

import { useState } from "react"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { CheckCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { formatMoney, formatMonth } from "@/lib/partner/utils"
import { StepBar, FileZone, ErrorBar, type Step } from "@/components/partner/excel-import"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayrollPreviewRow {
  contractCode: string
  transportFee: number
  fuel: number
  installment: number
  taxInsurance: number
  repairInstallment: number
  otherIncomeWHT: number
  otherIncomeNoWHT: number
  gps: number
  totalIncome: number
  totalDeductions: number
  netPay: number
}

// ─── Payroll import ───────────────────────────────────────────────────────────

function PayrollImport() {
  const [step,    setStep]    = useState<Step>("upload")
  const [month,   setMonth]   = useState("")
  const [file,    setFile]    = useState<File | null>(null)
  const [preview, setPreview] = useState<PayrollPreviewRow[]>([])
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ upserted: number; modified: number; errors: number } | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function handlePreview() {
    if (!file || !month) { setError("เลือกไฟล์และระบุเดือนก่อน"); return }
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file); fd.append("month", month)
      const r = await fetch("/api/partner/import/preview", { method: "POST", body: fd })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? "เกิดข้อผิดพลาด"); return }
      setPreview(data.rows); setStep("preview")
    } catch { setError("ไม่สามารถอ่านไฟล์ได้") }
    finally { setLoading(false) }
  }

  async function handleConfirm() {
    if (!file || !month) return
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file); fd.append("month", month)
      const r = await fetch("/api/partner/import/confirm", { method: "POST", body: fd })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? "เกิดข้อผิดพลาด"); return }
      setResult(data); setStep("done")
    } catch { setError("ไม่สามารถนำเข้าข้อมูลได้") }
    finally { setLoading(false) }
  }

  const totalNetPay   = preview.reduce((s, r) => s + r.netPay, 0)
  const negativeCount = preview.filter((r) => r.netPay < 0).length

  return (
    <div className="space-y-5">
      <StepBar step={step} />
      <ErrorBar msg={error} />

      {step === "upload" && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เดือนที่นำเข้า</label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ไฟล์ Excel (.xlsx)</label>
            <FileZone file={file} onFile={setFile} />
          </div>
          <Button onClick={handlePreview} disabled={!file || !month || loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? "กำลังอ่าน..." : "ตรวจสอบข้อมูล"}
          </Button>
        </div>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-zinc-500">เดือน: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMonth(month)}</span></p>
              <p className="text-sm text-zinc-500">พนักงาน: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{preview.length} คน</span></p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-500">ยอดสุทธิรวม</p>
              <p className={`text-xl font-bold ${totalNetPay >= 0 ? "text-emerald-600" : "text-red-600"}`}>฿{formatMoney(totalNetPay)}</p>
            </div>
            {negativeCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg">
                <AlertTriangle className="w-4 h-4" />{negativeCount} ราย มียอดสุทธิติดลบ
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  {["รหัส","ค่าขนส่ง","รายได้รวม","หักรวม","สุทธิ"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-zinc-500 font-medium ${h === "รหัส" ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.contractCode} className={`border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${row.netPay < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{row.contractCode}</td>
                    <td className="px-4 py-2 text-right text-zinc-800 dark:text-zinc-200">{formatMoney(row.transportFee)}</td>
                    <td className="px-4 py-2 text-right text-emerald-700 dark:text-emerald-400 font-medium">{formatMoney(row.totalIncome)}</td>
                    <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">{formatMoney(row.totalDeductions)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${row.netPay < 0 ? "text-red-600" : "text-zinc-900 dark:text-zinc-100"}`}>{formatMoney(row.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("upload")} disabled={loading}>ย้อนกลับ</Button>
            <Button onClick={handleConfirm} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? "กำลังบันทึก..." : `ยืนยันนำเข้า ${preview.length} รายการ`}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && result && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">นำเข้าเสร็จสิ้น</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div><p className="text-zinc-400">รายการใหม่</p><p className="text-2xl font-bold text-emerald-600">{result.upserted}</p></div>
            <div><p className="text-zinc-400">อัปเดต</p><p className="text-2xl font-bold text-blue-600">{result.modified}</p></div>
            {result.errors > 0 && <div><p className="text-zinc-400">ข้อผิดพลาด</p><p className="text-2xl font-bold text-red-600">{result.errors}</p></div>}
          </div>
          <div className="flex justify-center gap-3 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => { setStep("upload"); setFile(null); setPreview([]); setResult(null); setMonth("") }}>นำเข้าใหม่</Button>
            <Button variant="outline" onClick={() => window.location.href = `/partner/payroll/${month}`}>ดูสลิป {formatMonth(month)}</Button>
            <Button onClick={() => window.location.href = "/partner/admin/month"} className="bg-emerald-600 hover:bg-emerald-700 text-white">จัดการรอบเดือน →</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const { data: session } = usePartnerSession()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  if (!isAdmin) {
    return <div className="p-8 text-zinc-400">เฉพาะผู้ดูแลระบบเท่านั้น</div>
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">นำเข้า Payroll เงินเดือน</h1>
        <p className="text-sm text-zinc-500 mt-1">
          อัปโหลดไฟล์ Excel เงินเดือนรายเดือน · ใบรับสภาพหนี้ / การเคลื่อนไหวของสินค้า ย้ายไปนำเข้าที่หน้า “ค่าใช้จ่ายรถ” แล้ว
        </p>
      </div>

      <PayrollImport />
    </div>
  )
}
