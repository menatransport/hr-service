"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Skeleton } from "@/components/partner/ui/skeleton"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { PlusCircle, Search, AlertTriangle, Download, FileText, Upload, CheckCircle2, X } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { useSort, SortableTh } from "@/components/partner/use-sort"
import { formatMoney } from "@/lib/partner/utils"
import { missingDocFields } from "@/lib/partner/contract-doc"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"
import type { Contract } from "@/lib/partner/types"

const STATUS_LABEL: Record<string, string> = {
  active: "ใช้งาน", completed: "สิ้นสุด", terminated: "ยกเลิก"
}

// วันที่แบบสั้น (พ.ศ.) สำหรับ "วันที่ล่าสุด"
function fmtThaiShort(iso?: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return `${d.getDate()} ${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][d.getMonth()]} ${String(d.getFullYear()).slice(-2)}/${String(d.getFullYear() + 543).slice(-2)}`
}
const STATUS_COLOR: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  completed:  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  terminated: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
}

const STATUS_TABS = [
  { key: "",           label: "ทั้งหมด" },
  { key: "active",     label: "ใช้งาน" },
  { key: "completed",  label: "สิ้นสุด" },
  { key: "terminated", label: "ยกเลิก" },
]

// เอกสารแนบ 3 ไฟล์ต่อสัญญา (ชุดเดียวกับหน้าเพิ่มสัญญา)
const ATTACH_DOCS = [
  { field: "saleContractUrl",      label: "ซื้อขาย",    full: "สัญญาซื้อขาย (PDF)" },
  { field: "promotionDocUrl",      label: "แนบท้าย",    full: "เอกสารแนบท้าย (PDF)" },
  { field: "hireContractUrl",      label: "ว่าจ้าง",    full: "สัญญาว่าจ้าง (PDF)" },
  { field: "guaranteeContractUrl", label: "ค้ำประกัน",  full: "สัญญาค้ำประกัน (PDF)" },
  { field: "creditorDocUrl",       label: "เปิดเจ้าหนี้", full: "เปิดเจ้าหนี้ (PDF)" },
] as const
type AttachField = (typeof ATTACH_DOCS)[number]["field"]

export default function ContractsPage() {
  const { data: session } = usePartnerSession()
  const [items, setItems]   = useState<Contract[]>([])
  // prefill ค้นหาจาก ?q= (ลิงก์มาจากหน้าอื่น เช่น รหัสสัญญาในหน้า พขร.)
  const [q, setQ]           = useState(() =>
    typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("q") ?? "") : "")
  const [statusFilter, setStatusFilter] = useState("active")
  const [docFilter, setDocFilter] = useState("")   // "" ทั้งหมด | "complete" ครบ | "incomplete" ไม่ครบ
  const [attachFilter, setAttachFilter] = useState("")  // "" ทั้งหมด | "done" เอกสารครบ | "follow" ติดตามเอกสาร
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)   // `${contractId}:${field}`
  const [confirmDel, setConfirmDel] = useState<string | null>(null) // `${contractId}:${field}` ที่รอยืนยันลบ

  async function uploadAttachment(c: Contract, field: AttachField, file: File) {
    const key = `${c._id}:${field}`
    setUploading(key)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "contracts")
      const up = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!up.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ")
      const { url } = await up.json()
      const put = await fetch(`/api/partner/contracts/${c._id}/attachment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, url }),
      })
      if (!put.ok) throw new Error("บันทึกไฟล์แนบไม่สำเร็จ")
      setItems((prev) => prev.map((x) => (x._id === c._id ? { ...x, [field]: url } : x)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setUploading(null)
    }
  }

  // ลบไฟล์แนบ (เคลียร์ field ใน contract — ไฟล์ใน storage คงอยู่เผื่อกู้คืน)
  async function removeAttachment(c: Contract, field: AttachField) {
    setConfirmDel(null)
    const key = `${c._id}:${field}`
    setUploading(key)
    try {
      const res = await fetch(`/api/partner/contracts/${c._id}/attachment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, url: "" }),
      })
      if (!res.ok) throw new Error("ลบไฟล์แนบไม่สำเร็จ")
      setItems((prev) => prev.map((x) => (x._id === c._id ? { ...x, [field]: "" } : x)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด")
    } finally {
      setUploading(null)
    }
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q })
        if (statusFilter) params.set("status", statusFilter)
        const res = await fetch(`/api/partner/contracts?${params}`)
        if (res.ok) setItems(await res.json())
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [q, statusFilter])

  const today = new Date().toISOString().slice(0, 10)
  const d60 = new Date(); d60.setDate(d60.getDate() + 60)
  const in60 = d60.toISOString().slice(0, 10)

  async function handleExportExcel() {
    if (!visible.length) return
    const rows = visible.map((c) => {
      const missing = missingDocFields(c)
      const attached = ATTACH_DOCS.filter(({ field }) => c[field]).length
      return {
        "รหัส": c.contractCode,
        "ชื่อผู้เช่าซื้อ": c.buyerName,
        "ทะเบียน": c.licensePlate,
        "เบอร์รถ": c.truckNumber,
        "ยี่ห้อ": c.vehicleBrand,
        "รุ่น": c.vehicleModel ?? "",
        "วันที่ทำสัญญา": c.contractDate?.slice(0, 10) ?? "",
        "วันที่เริ่ม": c.startDate?.slice(0, 10) ?? "",
        "ราคารถ": c.totalPrice,
        "เงินดาวน์": c.downPayment,
        "ค่างวด/เดือน": c.monthlyInstallment,
        "จำนวนงวด": c.totalInstallments,
        "บริษัทประกัน": c.insurer ?? "",
        "วันต่อภาษี": c.taxRenewalDate ?? "",
        "วันหมดอายุ": c.taxExpiryDate ?? "",
        "สถานะ": c.status,
        "ข้อมูลครบ": missing.length === 0 ? "ครบ" : `ขาด ${missing.length}`,
        "วันที่ล่าสุด": missing.length === 0 ? (c.updatedAt?.slice(0, 10) ?? "") : "",
        "สถานะเอกสาร": c.saleContractUrl ? "เอกสารครบ" : "ติดตามเอกสาร",
        "เอกสารแนบ": `${attached}/${ATTACH_DOCS.length}`,
      }
    })
    await exportToExcel([{ name: "สัญญา", rows }], `contracts-${todayStamp()}`)
  }

  // ── กรอง: ความครบข้อมูล + สถานะเอกสาร (สัญญาซื้อขายอัปโหลดแล้ว = เอกสารครบ) ──
  const visible = items.filter((c) => {
    if (docFilter && (missingDocFields(c).length === 0) !== (docFilter === "complete")) return false
    if (attachFilter === "done"   && !c.saleContractUrl) return false
    if (attachFilter === "follow" &&  c.saleContractUrl) return false
    return true
  })

  const sort = useSort(visible, (c, k) => (c as unknown as Record<string, unknown>)[k])
  const pg = usePagination(sort.sorted, 50, [q, statusFilter, docFilter, attachFilter, sort.sortKey, sort.sortDir])

  const counts = {
    active:     items.filter((c) => c.status === "active").length,
    completed:  items.filter((c) => c.status === "completed").length,
    terminated: items.filter((c) => c.status === "terminated").length,
    complete:   items.filter((c) => missingDocFields(c).length === 0).length,
    docDone:    items.filter((c) => c.saleContractUrl).length,
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            สัญญา
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {visible.length} สัญญา
            {statusFilter === "" && (
              <> · ใช้งาน <span className="text-emerald-600 font-medium">{counts.active}</span> / สิ้นสุด {counts.completed} / ยกเลิก {counts.terminated}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleExportExcel}
              title="ดาวน์โหลดเป็น Excel (.xlsx)"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3 py-2 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          )}
          {["admin", "superadmin"].includes(session?.user?.role ?? "") && (
            <Link href="/partner/contracts/new">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <PlusCircle className="w-4 h-4 mr-1.5" /> เพิ่มสัญญา
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === tab.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* กรองตามความครบถ้วนของข้อมูลเอกสารสัญญา */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {[
            { key: "", label: "ข้อมูลทั้งหมด" },
            { key: "complete", label: `ครบ (${counts.complete})` },
            { key: "incomplete", label: `ไม่ครบ (${items.length - counts.complete})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDocFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                docFilter === tab.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* กรองตามสถานะเอกสาร (สัญญาซื้อขายอัปโหลดแล้ว) */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {[
            { key: "", label: "เอกสารทั้งหมด" },
            { key: "done", label: `เอกสารครบ (${counts.docDone})` },
            { key: "follow", label: `ติดตามเอกสาร (${items.length - counts.docDone})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAttachFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                attachFilter === tab.key
                  ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <Input
            placeholder="ค้นหา รหัส / ชื่อ / ทะเบียน / เบอร์รถ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-[11px] text-zinc-500 uppercase tracking-wider">
            <tr>
              <SortableTh label="รหัส / ผู้เช่าซื้อ" sortKey="contractCode" sort={sort} />
              <SortableTh label="ทะเบียน / ยี่ห้อ-รุ่น" sortKey="licensePlate" sort={sort} />
              <SortableTh label="ค่างวด/เดือน / ประกัน" sortKey="monthlyInstallment" sort={sort} align="right" />
              <SortableTh label="สถานะ" sortKey="status" sort={sort} align="center" />
              <th className="px-2.5 py-2 text-center font-semibold">ข้อมูลครบ</th>
              <th className="px-2.5 py-2 text-center font-semibold">สถานะเอกสาร</th>
              <th className="px-2.5 py-2 text-left font-semibold">เอกสารแนบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk${i}`}>{Array.from({ length: 7 }).map((_, c) => (<td key={c} className="px-4 py-3"><Skeleton className="h-4" /></td>))}</tr>
              ))
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-400">ไม่พบข้อมูล</td></tr>
            ) : pg.paged.map((c) => {
              const insExpired  = c.taxExpiryDate && c.taxExpiryDate < today
              const insExpiring = !insExpired && c.taxExpiryDate && c.taxExpiryDate <= in60
              const missing     = missingDocFields(c)
              return (
                <tr key={c._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  {/* รหัสสัญญา + ชื่อผู้เช่าซื้อ (+ พขร.) */}
                  <td className="px-2.5 py-2 align-top">
                    <Link
                      href={`/partner/contracts/${c._id}`}
                      className="font-mono font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      {c.contractCode}
                    </Link>
                    {c.locked && <span title={`ล็อคโดย ${c.locked.by}`} className="ml-1 text-[11px]">🔒</span>}
                    <div className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[180px]" title={c.buyerName}>{c.buyerName}</div>
                    {c.driverName && c.driverName !== c.buyerName && (
                      <div className="text-[10px] text-zinc-400 truncate max-w-[180px]" title={c.driverName}>{c.driverName}</div>
                    )}
                  </td>
                  {/* ทะเบียน + เบอร์รถ + ยี่ห้อ/รุ่น */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{c.licensePlate || "—"}</span>
                      {c.truckNumber && <span className="text-[10px] text-zinc-400">{c.truckNumber}</span>}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate max-w-[170px]" title={[c.vehicleBrand, c.vehicleModel].filter(Boolean).join(" · ")}>
                      <span className="font-medium">{c.vehicleBrand || "—"}</span>
                      {c.vehicleModel && <span className="text-zinc-400"> · {c.vehicleModel}</span>}
                    </div>
                  </td>
                  {/* ค่างวด/เดือน + ประกัน (ภาษี) */}
                  <td className="px-2.5 py-2 text-right align-top">
                    {c.monthlyInstallment ? (
                      <div className="tabular-nums">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(c.monthlyInstallment)}</span>
                        <span className="text-[10px] text-zinc-400 ml-1">×{c.totalInstallments}</span>
                      </div>
                    ) : <span className="text-zinc-300">—</span>}
                    <div className="mt-0.5">
                      {insExpired ? (
                        <span className="inline-flex items-center gap-0.5 text-red-500 text-[10px] font-medium" title={`หมดอายุ ${c.taxExpiryDate}`}>
                          <AlertTriangle className="w-3 h-3" /> ประกันหมดแล้ว
                        </span>
                      ) : insExpiring ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-500 text-[10px] font-medium" title={`หมด ${c.taxExpiryDate}`}>
                          <AlertTriangle className="w-3 h-3" /> ประกันใกล้หมด
                        </span>
                      ) : c.taxExpiryDate ? (
                        <span className="text-[10px] text-zinc-400 tabular-nums">ประกัน {c.taxExpiryDate.slice(0, 7)}</span>
                      ) : (
                        <span className="text-zinc-200 dark:text-zinc-700 text-[10px]">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-center align-top">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLOR[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  {/* ── ความครบถ้วนของข้อมูลเอกสารสัญญา (เกณฑ์เดียวกับหน้าแก้ไข/หน้าพิมพ์) ── */}
                  <td className="px-2.5 py-2 text-center align-top">
                    {missing.length === 0 ? (
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> ครบ
                        </span>
                        {fmtThaiShort(c.updatedAt) && (
                          <span className="text-[9px] text-zinc-400" title="วันที่อัปเดตล่าสุด">{fmtThaiShort(c.updatedAt)}</span>
                        )}
                      </div>
                    ) : (
                      <Link
                        href={`/partner/contracts/${c._id}`}
                        title={`ขาด: ${missing.map((f) => f.label).join(", ")}`}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full hover:bg-amber-100 dark:hover:bg-amber-950/60"
                      >
                        <AlertTriangle className="w-3 h-3" /> ขาด {missing.length}
                      </Link>
                    )}
                  </td>
                  {/* ── สถานะเอกสาร: อัปโหลดสัญญาซื้อขายแล้ว = เอกสารครบ / ยังไม่มี = ติดตามเอกสาร ── */}
                  <td className="px-2.5 py-2 text-center align-top">
                    {c.saleContractUrl ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> เอกสารครบ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-0.5 rounded-full">
                        <AlertTriangle className="w-3 h-3" /> ติดตามเอกสาร
                      </span>
                    )}
                  </td>
                  {/* ── เอกสารแนบ: ดูไฟล์ที่แนบแล้ว / แอดมินแนบไฟล์ได้จากหน้านี้ ── */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ATTACH_DOCS.map(({ field, label, full }) => {
                        const url  = c[field]
                        const key  = `${c._id}:${field}`
                        const busy = uploading === key
                        if (url) return (
                          confirmDel === key ? (
                            <span key={field} className="inline-flex items-center gap-1 text-[10px] font-medium bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded pl-1.5 pr-0.5 py-0.5">
                              <button type="button" disabled={busy} onClick={() => removeAttachment(c, field)}
                                className="font-semibold text-white bg-red-500 hover:bg-red-600 rounded px-1.5 py-0.5 disabled:opacity-40">ยืนยันลบ</button>
                              <button type="button" onClick={() => setConfirmDel(null)}
                                className="text-zinc-400 hover:text-zinc-600 px-0.5">ยกเลิก</button>
                            </span>
                          ) : (
                          <span
                            key={field}
                            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 pl-1.5 pr-0.5 py-0.5 rounded"
                          >
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              title={`เปิด${full}`}
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <FileText className="w-2.5 h-2.5" /> {label}
                            </a>
                            <button
                              type="button"
                              title={`ลบ${full}`}
                              disabled={busy}
                              onClick={() => setConfirmDel(key)}
                              className="ml-0.5 text-emerald-400 hover:text-red-500 disabled:opacity-40"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                          )
                        )
                        return (
                          <label
                            key={field}
                            title={`แนบ${full} (PDF/รูปภาพ สูงสุด 20 MB)`}
                            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-dashed cursor-pointer transition-colors
                              ${busy
                                ? "border-blue-300 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:border-blue-700"
                                : "border-zinc-300 dark:border-zinc-600 text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
                              }`}
                          >
                            {busy ? (
                              <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Upload className="w-2.5 h-2.5" />
                            )}
                            {label}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              disabled={!!uploading}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) uploadAttachment(c, field, f)
                                e.target.value = ""
                              }}
                            />
                          </label>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <PaginationBar {...pg} unit="สัญญา" />
      </div>
    </div>
  )
}
