/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

/**
 * ภาษี & ประกันภัย — ติดตามรายการต่ออายุแบบแยก 4 รายการต่อทะเบียน (หน้า list)
 * หน้าจัดการรายคัน (4 การ์ด + ประวัติ) แยกเป็นหน้าเต็มที่ /insurance-tax/[plate]
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { ShieldCheck, Search, Download, Settings2 } from "lucide-react"
import { Input } from "@/components/partner/ui/input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { formatMoney } from "@/lib/partner/utils"
import { exportToExcel, todayStamp } from "@/lib/partner/export-excel"
import {
  ITEM_TYPES, ITEM_LABEL, ITEM_COL_LABEL, STATUS_LABEL, STATUS_COLOR, STATUS_DOT, STATUS_TEXT,
  STATUS_TABS, ITEM_TABS, EMPTY_COUNTS, fmt, shortThaiDate, normalizeRow, sumAmounts, sumMonthly,
  type Row, type Counts, type ItemType, type ItemStatus,
} from "./shared"

function InsuranceTaxContent() {
  const { data: session } = usePartnerSession()
  const searchParams = useSearchParams()
  const isAdmin = ["admin", "superadmin"].includes(session?.user?.role ?? "")

  const [items, setItems]   = useState<Row[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const [statusFilter, setStatusFilter] = useState("")
  const [itemFilter, setItemFilter] = useState<"" | ItemType>("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/partner/insurance-tax")
      if (!res.ok) throw new Error()
      const data = await res.json()
      const today = new Date().toISOString().slice(0, 10)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems(Array.isArray(data.items) ? data.items.map((r: any) => normalizeRow(r, today)) : [])
      setCounts(data.counts ?? EMPTY_COUNTS)
    } catch {
      // backend ยังไม่พร้อม / ผิดพลาด → แสดง empty state
      setItems([])
      setCounts(EMPTY_COUNTS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  /** สถานะของแถวตาม filter รายการ: เลือกรายการ → ใช้สถานะรายการนั้น / ไม่เลือก → worstStatus */
  const rowStatus = useCallback(
    (r: Row): ItemStatus => (itemFilter ? r.itemStatus[itemFilter] : r.worstStatus),
    [itemFilter],
  )

  // ค้นหา + กรองสถานะ (client-side)
  const visible = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return items.filter((r) => {
      if (statusFilter && rowStatus(r) !== statusFilter) return false
      if (!kw) return true
      return [
        r.licensePlate, r.platePlain, r.truckNumber, r.driverName, r.contractCode,
        r.items.insurance?.company, r.items.prb?.company,
      ].some((v) => v?.toLowerCase().includes(kw))
    })
  }, [items, q, statusFilter, rowStatus])

  const pg = usePagination(visible, 50, [q, statusFilter, itemFilter])

  // KPI: ไม่เลือกกรายการ → counts จาก API (worstStatus) / เลือกรายการ → นับจากสถานะรายการนั้น
  const effectiveCounts = useMemo<Counts>(() => {
    if (!itemFilter) return counts
    const c = { total: items.length, active: 0, expiring: 0, expired: 0, none: 0 }
    for (const r of items) c[r.itemStatus[itemFilter]]++
    return c
  }, [counts, items, itemFilter])

  async function handleExportExcel() {
    if (!visible.length) return
    const rows = visible.map((r) => {
      const row: Record<string, unknown> = {
        "ทะเบียน": r.licensePlate,
        "เบอร์รถ": r.truckNumber ?? "",
        "คนขับ": r.driverName ?? "",
      }
      for (const t of ITEM_TYPES) {
        const it = r.items[t]
        row[`วันหมด${ITEM_LABEL[t]}`]   = it?.expiryDate?.slice(0, 10) ?? ""
        row[`จำนวนเงิน${ITEM_LABEL[t]}`] = it?.amount ?? ""
        row[`หัก/เดือน${ITEM_LABEL[t]}`] = it?.monthlyInstallment ?? ""
      }
      row["รวมค่าใช้จ่าย"] = sumAmounts(r) ?? ""
      row["หัก/เดือนรวม"]  = sumMonthly(r) ?? ""
      row["สถานะรวม"]      = STATUS_LABEL[r.worstStatus] ?? r.worstStatus
      return row
    })
    await exportToExcel([{ name: "ภาษี & ประกันภัย", rows }], `insurance-tax-${todayStamp()}`)
  }

  const KPI = [
    { key: "",         label: "ทั้งหมด",        value: effectiveCounts.total,    dot: "bg-zinc-400",    accent: "text-zinc-900 dark:text-zinc-50" },
    { key: "active",   label: "ใช้งาน",          value: effectiveCounts.active,   dot: "bg-emerald-500", accent: "text-emerald-700 dark:text-emerald-400" },
    { key: "expiring", label: "ใกล้หมดอายุ (≤60 วัน)", value: effectiveCounts.expiring, dot: "bg-amber-500",   accent: "text-amber-700 dark:text-amber-400" },
    { key: "expired",  label: "หมดอายุ",         value: effectiveCounts.expired,  dot: "bg-red-500",     accent: "text-red-700 dark:text-red-400" },
    { key: "none",     label: "ยังไม่มีข้อมูล",   value: effectiveCounts.none,     dot: "bg-zinc-300 dark:bg-zinc-600", accent: "text-zinc-500 dark:text-zinc-400" },
  ]


  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            ภาษี &amp; ประกันภัย
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {visible.length} ทะเบียน
            {itemFilter && <> · เฉพาะรายการ <span className="text-zinc-600 dark:text-zinc-300 font-medium">{ITEM_LABEL[itemFilter]}</span></>}
            {statusFilter === "" && effectiveCounts.total > 0 && (
              <> · ใช้งาน <span className="text-emerald-600 font-medium">{effectiveCounts.active}</span> / ใกล้หมด <span className="text-amber-600 font-medium">{effectiveCounts.expiring}</span> / หมดแล้ว <span className="text-red-500 font-medium">{effectiveCounts.expired}</span></>
            )}
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        )}
      </div>

      {/* KPI chips — คลิกเพื่อกรอง */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        {KPI.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setStatusFilter(statusFilter === k.key ? "" : k.key)}
            className={`text-left bg-white dark:bg-zinc-900 border rounded-xl px-4 py-3 transition-colors ${
              statusFilter === k.key
                ? "border-emerald-400 dark:border-emerald-600 ring-1 ring-emerald-400 dark:ring-emerald-600"
                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${k.dot}`} />
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider truncate">{k.label}</p>
            </div>
            <p className={`text-xl font-bold tabular-nums leading-none ${k.accent}`}>{k.value}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* สถานะ */}
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
        {/* รายการ — เลือกแล้วสถานะ/สีจะอิงรายการนั้นแทน worstStatus */}
        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {ITEM_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setItemFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                itemFilter === tab.key
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
            placeholder="ค้นหา ทะเบียน / เบอร์รถ / คนขับ / บริษัท"
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
                <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">ทะเบียน</th>
                <th className="px-2.5 py-2 text-left font-semibold whitespace-nowrap">เบอร์รถ / คนขับ</th>
                {ITEM_TYPES.map((t) => (
                  <th
                    key={t}
                    className={`px-2.5 py-2 text-center font-semibold whitespace-nowrap ${
                      itemFilter === t ? "text-emerald-600 dark:text-emerald-400" : ""
                    }`}
                  >
                    {ITEM_COL_LABEL[t]}
                  </th>
                ))}
                <th className="px-2.5 py-2 text-right font-semibold whitespace-nowrap">รวม / หัก/เดือน</th>
                <th className="px-2.5 py-2 text-center font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-400">กำลังโหลด...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-400">ไม่พบข้อมูล</td></tr>
              ) : pg.paged.map((r) => (
                <tr key={r.licensePlate} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                  {/* ทะเบียน (+ ยี่ห้อ/รุ่น) */}
                  <td className="px-2.5 py-2 align-top">
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-100 text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                      {r.licensePlate}
                    </span>
                    {(r.brand || r.model) && (
                      <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[130px]" title={[r.brand, r.model].filter(Boolean).join(" · ")}>{[r.brand, r.model].filter(Boolean).join(" · ")}</div>
                    )}
                  </td>
                  {/* เบอร์รถ / คนขับ (2 บรรทัด) */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="text-xs text-zinc-700 dark:text-zinc-200 font-medium truncate max-w-[140px]" title={r.truckNumber || ""}>
                      {r.truckNumber || <span className="text-zinc-300 dark:text-zinc-600 font-normal">—</span>}
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[140px]" title={r.driverName || ""}>
                      {r.driverName || "—"}
                    </div>
                  </td>
                  {/* 4 ช่องสถานะรายการ: จุดสี + วันหมดอายุ พ.ศ. สั้น */}
                  {ITEM_TYPES.map((t) => {
                    const it = r.items[t]
                    const st = r.itemStatus[t]
                    const dimmed = itemFilter !== "" && itemFilter !== t
                    return (
                      <td key={t} className={`px-2.5 py-2 text-center whitespace-nowrap align-top ${dimmed ? "opacity-40" : ""}`}>
                        {st === "none" || !it ? (
                          <span className="text-zinc-300 dark:text-zinc-600 text-xs">–</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs ${STATUS_TEXT[st]}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[st]}`} />
                            {it.expiryDate ? shortThaiDate(it.expiryDate) : STATUS_LABEL[st]}
                          </span>
                        )}
                      </td>
                    )
                  })}
                  {/* รวมค่าใช้จ่าย (+ หัก/เดือนรวม) */}
                  <td className="px-2.5 py-2 text-right align-top tabular-nums">
                    {sumAmounts(r) !== null
                      ? <div className="font-semibold text-zinc-800 dark:text-zinc-200">{formatMoney(sumAmounts(r)!)}</div>
                      : <div className="text-zinc-300 dark:text-zinc-600 text-xs">—</div>}
                    <div className="text-[11px] text-zinc-400 mt-0.5" title="หัก/เดือนรวม">
                      {sumMonthly(r) !== null ? `หัก ${formatMoney(sumMonthly(r)!)}/ด.` : "—"}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-center align-top">
                    <Link
                      href={`/partner/insurance-tax/${encodeURIComponent(r.platePlain ?? r.licensePlate)}`}
                      title="จัดการรายการของทะเบียนนี้"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <Settings2 className="w-3 h-3" /> จัดการ
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pg} unit="ทะเบียน" />
      </div>

    </div>
  )
}

export default function InsuranceTaxPage() {
  // useSearchParams ต้องอยู่ใต้ Suspense boundary ตามข้อกำหนด App Router
  return (
    <Suspense fallback={<div className="px-4 py-10 text-center text-sm text-zinc-400">กำลังโหลด...</div>}>
      <InsuranceTaxContent />
    </Suspense>
  )
}
