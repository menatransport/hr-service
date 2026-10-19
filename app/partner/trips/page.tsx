"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { confirm } from "@/components/partner/ui/confirm"
import { usePartnerSession } from "@/lib/partner/auth/client"
import Link from "next/link"
import { PlusCircle, Search, Upload, Trash2, Download } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { formatMoney, formatMonth } from "@/lib/partner/utils"
import { exportToExcel } from "@/lib/partner/export-excel"
import type { Trip } from "@/lib/partner/types"

function buildMonthOptions() {
  const now = new Date()
  const opts = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    opts.push({ value: v, label: formatMonth(v) })
  }
  return opts
}

export default function TripsPage() {
  const { data: session }   = usePartnerSession()
  const options             = buildMonthOptions()
  const [month, setMonth]   = useState(options[0].value)
  const [q, setQ]           = useState("")
  const [plant, setPlant]   = useState("")
  const [items, setItems]   = useState<Trip[]>([])
  const [loading, setLoading] = useState(false)

  // Default to latest month with data
  useEffect(() => {
    fetch("/api/partner/payroll/months")
      .then((r) => r.ok ? r.json() : [])
      .then((ms: string[]) => { if (ms.length > 0) setMonth(ms[0]) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams({ month })
    if (q) params.set("contractCode", q)
    if (plant) params.set("plant", plant)
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/partner/trips?${params.toString()}`)
        if (r.ok) {
          const d = await r.json()
          setItems(d)
        } else {
          setItems([])
        }
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [month, q, plant])

  async function handleDelete(id: string) {
    if (!await confirm("ลบเที่ยวนี้?")) return
    try {
      const r = await fetch(`/api/partner/trips/${id}`, { method: "DELETE" })
      if (r.ok) {
        setItems((p) => p.filter((t) => t._id !== id))
      } else {
        toast.error("ลบไม่สำเร็จ กรุณาลองใหม่")
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่")
    }
  }

  const pg = usePagination(items, 50, [month, q, plant])

  async function handleExportExcel() {
    if (items.length === 0) return
    const rows = items.map((t) => ({
      "รหัสสัญญา": t.contractCode,
      "วันที่": t.date?.slice(0, 10) ?? "",
      "เลขที่ LDT": t.ldtNumber,
      "แพล้นท์": t.plant,
      "บริการ": t.serviceType,
      "Route": t.routeCode,
      "ปลายทาง": t.destinationName,
      "อำเภอ": t.district,
      "จังหวัด": t.province,
      "โซน": t.zone,
      "ค่าเที่ยว": t.tripFee,
    }))
    await exportToExcel([{ name: "รายเที่ยว", rows }], `trips-${month}${q ? "-" + q : ""}`)
  }

  async function handleBulkDelete() {
    const label = q ? `${items.length} เที่ยวของ ${q} เดือน ${month}` : `${items.length} เที่ยวเดือน ${month}`
    if (!await confirm(`ลบ${label}ทั้งหมด? การกระทำนี้ไม่สามารถยกเลิกได้`)) return
    try {
      const params = new URLSearchParams({ month })
      if (q) params.set("contractCode", q)
      const r = await fetch(`/api/partner/trips?${params.toString()}`, { method: "DELETE" })
      if (r.ok) {
        const d = await r.json()
        setItems([])
        toast.success(`ลบแล้ว ${d.deleted} รายการ`)
      } else {
        toast.error("ลบไม่สำเร็จ กรุณาลองใหม่")
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่")
    }
  }

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-4 py-2.5 mb-4">
        ⚠ หน้านี้เป็นข้อมูลเก่า (legacy) — เงินเดือนใช้ข้อมูลจากเมนู <a href="/partner/trip-fuel" className="underline font-semibold">ค่าเที่ยว &amp; เชื้อเพลิง</a> (อัปโหลดไฟล์) แล้ว การแก้ไขที่หน้านี้ไม่มีผลต่อ payroll
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">รายเที่ยว</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {items.length} รายการ{items.length >= 500 ? " (จำกัด 500 แรก — กรอง contractCode เพื่อดูทั้งหมด)" : ""}
            {items.length > 0 && (
              <> · ค่าเที่ยวรวม <span className="text-zinc-600 font-medium">
                {formatMoney(items.reduce((s, t) => s + (t.tripFee ?? 0), 0))}
              </span></>
            )}
          </p>
        </div>
        {["admin", "superadmin"].includes(session?.user?.role ?? "") && (
          <div className="flex gap-2">
            {items.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-2"
                title={`ลบ ${items.length} รายการที่แสดงอยู่`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                ลบทั้งหมด ({items.length})
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
                title={`ดาวน์โหลด ${items.length} รายการเป็น Excel`}
              >
                <Download className="w-3.5 h-3.5" />
                Excel
              </button>
            )}
            <Link
              href="/partner/trips/import"
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg px-3 py-2"
            >
              <Upload className="w-3.5 h-3.5" />
              นำเข้า CSV
            </Link>
            <Link href="/partner/trips/new">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <PlusCircle className="w-4 h-4 mr-2" /> เพิ่มรายเที่ยว
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Plant summary */}
      {!q && !plant && items.length > 0 && (() => {
        const plantMap: Record<string, { count: number; total: number }> = {}
        for (const t of items) {
          const p = t.plant || "ไม่ระบุ"
          if (!plantMap[p]) plantMap[p] = { count: 0, total: 0 }
          plantMap[p].count += 1
          plantMap[p].total += t.tripFee ?? 0
        }
        const plants = Object.entries(plantMap).sort((a, b) => b[1].total - a[1].total)
        if (plants.length < 2) return null
        return (
          <div className="mb-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">แพล้นท์</span>
            </div>
            <div className="flex flex-wrap">
              {plants.map(([p, stats]) => (
                <button
                  key={p}
                  onClick={() => setPlant(p)}
                  className="px-4 py-2.5 text-left border-r border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{p}</div>
                  <div className="text-xs text-zinc-400">{stats.count} เที่ยว · {formatMoney(stats.total)}</div>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      <div className="flex items-center gap-3 mb-4">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm bg-white dark:bg-zinc-900 dark:border-zinc-700"
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-400" />
          <Input
            placeholder="รหัสสัญญา (MTL003)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-48"
          />
        </div>
        <Input
          placeholder="แพล้นท์"
          value={plant}
          onChange={(e) => setPlant(e.target.value)}
          className="max-w-36"
        />
        {plant && (
          <button onClick={() => setPlant("")} className="text-xs text-zinc-400 hover:text-zinc-600">
            ✕ ล้าง
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="px-2.5 py-2 text-left whitespace-nowrap">วันที่</th>
                <th className="px-2.5 py-2 text-left">รหัส / LDT</th>
                <th className="px-2.5 py-2 text-left">แพล้นท์</th>
                <th className="px-2.5 py-2 text-left">ปลายทาง / จังหวัด</th>
                <th className="px-2.5 py-2 text-right">ค่าเที่ยว</th>
                {["admin", "superadmin"].includes(session?.user?.role ?? "") && <th className="px-2.5 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {loading ? (
                <tr><td colSpan={["admin", "superadmin"].includes(session?.user?.role ?? "") ? 6 : 5} className="px-4 py-8 text-center text-zinc-400">กำลังโหลด...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={["admin", "superadmin"].includes(session?.user?.role ?? "") ? 6 : 5} className="px-4 py-8 text-center text-zinc-400">ไม่พบข้อมูล</td></tr>
              ) : pg.paged.map((t) => (
                <tr key={t._id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  {/* วันที่ */}
                  <td className="px-2.5 py-2 align-top text-zinc-500 tabular-nums whitespace-nowrap">{t.date?.slice(0, 10)}</td>

                  {/* รหัส / LDT */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate max-w-[120px]" title={t.contractCode}>{t.contractCode}</div>
                    {t.ldtNumber && <div className="font-mono text-[10px] text-zinc-400 mt-0.5 truncate max-w-[120px]" title={t.ldtNumber}>{t.ldtNumber}</div>}
                  </td>

                  {/* แพล้นท์ */}
                  <td className="px-2.5 py-2 align-top text-zinc-500 truncate max-w-[110px]" title={t.plant}>{t.plant}</td>

                  {/* ปลายทาง / จังหวัด */}
                  <td className="px-2.5 py-2 align-top">
                    <div className="text-zinc-700 dark:text-zinc-200 truncate max-w-[220px]" title={t.destinationName}>{t.destinationName}</div>
                    {t.province && <div className="text-[10px] text-zinc-400 mt-0.5 truncate max-w-[220px]" title={t.province}>{t.province}</div>}
                  </td>

                  {/* ค่าเที่ยว */}
                  <td className="px-2.5 py-2 align-top text-right tabular-nums whitespace-nowrap">{formatMoney(t.tripFee)}</td>

                  {["admin", "superadmin"].includes(session?.user?.role ?? "") && (
                    <td className="px-2.5 py-2 align-top text-right">
                      <div className="flex items-center justify-end gap-2.5">
                        <Link href={`/partner/trips/${t._id}`} className="text-xs text-zinc-500 hover:underline">แก้ไข</Link>
                        <button onClick={() => handleDelete(t._id!)} className="text-xs text-red-500 hover:underline">ลบ</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pg} unit="เที่ยว" note="(API จำกัด 500 รายการล่าสุด)" />
      </div>
    </div>
  )
}
