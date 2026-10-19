"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Download, Search, Receipt } from "lucide-react"
import { usePagination, PaginationBar } from "@/components/partner/pagination"

type Cat = "repair" | "pm" | "none"

interface Row {
  date: string; debtAcceptanceNo: string; mr: string; wd: string
  licensePlate: string; truckNumber: string; contractCode: string; driverName: string
  itemName: string; itemCode: string; itemGroup: string; purpose: string
  qty: number; amount: number; promoType: Cat; pmType: string
}
interface Summary {
  total: number; totalCount: number
  repair: number; repairCount: number
  pm: number; pmCount: number
  owe: number; oweCount: number
  debtCount: number
}
interface Payload { month: string; summary: Summary; rows: Row[] }

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]

const baht = (n: number) =>
  "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "YYYY-MM-DD" (ค.ศ.หรือพ.ศ.) → "30 ธ.ค. 68" */
function thaiShort(iso: string) {
  const [y, m, d] = (iso || "").slice(0, 10).split("-")
  if (!y || !m || !d) return iso
  const ce = Number(y) > 2500 ? Number(y) - 543 : Number(y)
  return `${parseInt(d)} ${THAI_MONTHS[parseInt(m) - 1]} ${String(ce).slice(-2)}/${String(ce + 543).slice(-2)}`
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

const CAT_META: Record<Cat, { label: string; cls: string }> = {
  repair: { label: "โปรซ่อม", cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800" },
  pm:     { label: "โปร PM",  cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800" },
  none:   { label: "รับผิด",  cls: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800" },
}

export default function PromoReportPage() {
  const [month, setMonth]   = useState(currentMonth())
  const [data, setData]     = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState("")
  const [q, setQ]           = useState("")
  const [cat, setCat]       = useState<"all" | Cat>("all")

  useEffect(() => {
    setLoading(true); setError("")
    fetch(`/api/partner/reports/promotions?month=${month}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("โหลดข้อมูลไม่สำเร็จ"))))
      .then((d: Payload) => setData(d))
      .catch((e) => { setData(null); setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด") })
      .finally(() => setLoading(false))
  }, [month])

  const rows = data?.rows ?? []
  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (cat !== "all" && r.promoType !== cat) return false
      if (!lq) return true
      return [r.licensePlate, r.debtAcceptanceNo, r.mr, r.wd, r.itemName, r.itemCode, r.driverName, r.contractCode]
        .some((f) => (f ?? "").toLowerCase().includes(lq))
    })
  }, [rows, q, cat])

  const shown = useMemo(() => ({
    total: filtered.reduce((s, r) => s + r.amount, 0),
    qty:   filtered.reduce((s, r) => s + r.qty, 0),
  }), [filtered])

  const pg = usePagination(filtered, 50, [q, cat, month])
  const s = data?.summary

  return (
    <div className="max-w-[1240px]">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">รายงานการเงิน · โปรโมชั่นซ่อม/บำรุง</p>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mt-0.5 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" /> รายงานสรุปยอดโปรโมชั่น
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="bg-transparent outline-none text-sm text-zinc-800 dark:text-zinc-100" aria-label="เลือกเดือน" />
          </label>
          <a href={`/api/partner/reports/promotions?month=${month}&format=xlsx`}
             className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3.5 py-2 text-sm font-semibold">
            <Download className="w-4 h-4" /> ส่งออก Excel
          </a>
        </div>
      </div>

      {/* summary strip */}
      <div className="flex flex-wrap rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden mb-3 shadow-sm">
        {[
          { lab: "ยอดเบิกรวมทั้งเดือน", val: s?.total, sub: `${s?.debtCount ?? 0} ใบ · ${s?.totalCount ?? 0} รายการ`, dot: "" },
          { lab: "เข้าโปรซ่อม", val: s?.repair, sub: `${s?.repairCount ?? 0} รายการ`, dot: "bg-emerald-500", cls: "text-emerald-600" },
          { lab: "เข้าโปร PM", val: s?.pm, sub: `${s?.pmCount ?? 0} รายการ`, dot: "bg-amber-500", cls: "text-amber-600" },
          { lab: "ไม่เข้าโปร (รับผิด)", val: s?.owe, sub: `${s?.oweCount ?? 0} รายการ`, dot: "bg-rose-500", cls: "text-rose-600" },
        ].map((k) => (
          <div key={k.lab} className="flex-1 min-w-[150px] px-4 py-3 border-r last:border-r-0 border-zinc-100 dark:border-zinc-800">
            <p className="text-[11.5px] text-zinc-500 font-medium mb-1 flex items-center gap-1.5">
              {k.dot && <span className={`w-2 h-2 rounded-full ${k.dot}`} />}{k.lab}
            </p>
            <p className={`text-xl font-bold tabular-nums ${k.cls ?? "text-zinc-800 dark:text-zinc-100"}`}>
              {loading ? "—" : baht(k.val ?? 0)}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ทะเบียน / เลขใบ / MR / สินค้า…"
            className="w-full bg-transparent outline-none text-sm text-zinc-800 dark:text-zinc-100 placeholder:text-zinc-400" />
        </div>
        {([["all", "ทั้งหมด"], ["repair", "โปรซ่อม"], ["pm", "โปร PM"], ["none", "รับผิด"]] as const).map(([key, lab]) => (
          <button key={key} type="button" onClick={() => setCat(key)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              cat === key
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
            }`}>
            {lab}
          </button>
        ))}
      </div>

      {/* ledger */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        {error ? (
          <div className="px-4 py-10 text-center text-sm text-rose-600">{error}</div>
        ) : loading ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-400">กำลังโหลดข้อมูล…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-zinc-400">ไม่มีรายการในเดือนนี้</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[1080px]">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-200 dark:border-zinc-700">
                  {["วันที่","เลขใบรับสภาพหนี้","MR","WD","ทะเบียน","ชื่อสินค้า","รหัสสินค้า","กลุ่มสินค้า"].map((h) => (
                    <th key={h} className="text-left font-semibold text-[10.5px] uppercase tracking-wide px-3 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="text-right font-semibold text-[10.5px] uppercase tracking-wide px-3 py-2.5">จ่าย</th>
                  <th className="text-right font-semibold text-[10.5px] uppercase tracking-wide px-3 py-2.5">ยอดเงิน</th>
                  <th className="text-left font-semibold text-[10.5px] uppercase tracking-wide px-3 py-2.5">ประเภท</th>
                </tr>
              </thead>
              <tbody>
                {pg.paged.map((r, i) => {
                  const meta = CAT_META[r.promoType]
                  return (
                    <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="px-3 py-2 whitespace-nowrap">{thaiShort(r.date)}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-zinc-500">{r.debtAcceptanceNo || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-zinc-500 whitespace-nowrap">{r.mr || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11.5px] text-zinc-500 whitespace-nowrap">{r.wd || "—"}</td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{r.licensePlate || "—"}</td>
                      <td className="px-3 py-2 min-w-[200px]">{r.itemName || "—"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-400 whitespace-nowrap">{r.itemCode || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{r.itemGroup || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{baht(r.amount)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                          {meta.label}{r.pmType ? ` ${r.pmType}` : ""}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-bold bg-zinc-50 dark:bg-zinc-800/40">
                  <td colSpan={8} className="px-3 py-2.5 text-zinc-500 text-xs">
                    รวมที่แสดง · {filtered.length} รายการ
                    {cat !== "all" && <span className="font-normal"> (กรอง: {CAT_META[cat as Cat].label})</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{shown.qty}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{baht(shown.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && filtered.length > 0 && <PaginationBar {...pg} unit="รายการ" />}
    </div>
  )
}
