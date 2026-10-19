"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Trophy, Target, Coins, TrendingUp, AlertTriangle } from "lucide-react"
import { formatMoney } from "@/lib/partner/utils"
import { Skeleton, TableSkeleton, StatsSkeleton } from "@/components/partner/ui/skeleton"
import { COMMISSION_TIERS, tierLabel, type CommissionSummary } from "@/lib/partner/commission"

type Resp = {
  role: string
  myEmail: string
  myName: string
  me: CommissionSummary | null
  all: CommissionSummary[]
  canSeeAll: boolean
}

const fmtDate = (iso: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" })
}

export default function CommissionPage() {
  const [d, setD] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [pick, setPick] = useState<string>("")   // key ของเซลที่แอดมินเลือกดู

  useEffect(() => {
    fetch("/api/partner/quotations/commission")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json())?.error ?? "โหลดข้อมูลไม่สำเร็จ"))))
      .then((j: Resp) => { setD(j); setPick(j.me?.key ?? j.all?.[0]?.key ?? "") })
      .catch((e) => setErr(String(e.message ?? e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <Skeleton className="h-8 w-52" />
      <StatsSkeleton count={4} />
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5"><TableSkeleton rows={6} cols={5} /></div>
    </div>
  )

  if (err) return (
    <div className="p-6 max-w-5xl mx-auto">
      <p className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">{err}</p>
    </div>
  )

  const shown = d?.canSeeAll ? (d.all.find((r) => r.key === pick) ?? d.me ?? d.all[0] ?? null) : d?.me ?? null
  const isMe = !!shown && !!d?.me && shown.key === d.me.key

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/partner/quotations" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"><ArrowLeft className="w-4 h-4" /></Link>
        <h1 className="text-lg font-semibold">ยอดขาย & ค่าคอมมิชชั่น</h1>
      </div>

      {/* ── สรุปของคนที่กำลังดู ── */}
      {shown ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {isMe ? "ของฉัน · " : ""}<span className="font-semibold text-zinc-800 dark:text-zinc-100">{shown.name}</span>
            </p>
            {d?.canSeeAll && d.all.length > 1 && (
              <select value={pick} onChange={(e) => setPick(e.target.value)}
                className="h-9 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 bg-white dark:bg-zinc-900">
                {d.all.map((r) => <option key={r.key} value={r.key}>{r.name} ({r.count} คัน)</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={<Trophy className="w-4 h-4" />} label="ขายแล้ว" value={`${shown.count} คัน`} sub={`มูลค่า ${formatMoney(shown.salesValue)}`} />
            <Stat icon={<Coins className="w-4 h-4" />} label="ค่าคอมสะสม" value={formatMoney(shown.total)} sub="บาท (ยอดรวมทั้งหมด)" accent />
            <Stat icon={<TrendingUp className="w-4 h-4" />} label="อัตราคันถัดไป" value={formatMoney(shown.currentRate)} sub="บาท/คัน" />
            <Stat icon={<Target className="w-4 h-4" />} label="ขั้นถัดไป"
              value={shown.next ? `อีก ${shown.next.carsToNext} คัน` : "สูงสุดแล้ว"}
              sub={shown.next ? `ขึ้นเป็น ${formatMoney(shown.next.nextRate)} บาท/คัน` : "ได้อัตราสูงสุด 5,000 บาท/คัน"} />
          </div>

          {shown.unassigned && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" /> ใบเสนอราคากลุ่มนี้ไม่ได้ระบุผู้ขาย — ยังไม่ถูกนับเป็นค่าคอมของใคร กรุณาเติมชื่อผู้ขายในใบ
            </p>
          )}

          {/* ── รายคัน ── */}
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <p className="px-4 py-2.5 text-sm font-semibold border-b border-zinc-100 dark:border-zinc-800">รายการที่ปิดการขาย</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-[11px] uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-50/60 dark:bg-zinc-900/40">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">คันที่</th>
                    <th className="text-left px-3 py-2 font-semibold">วันปิดการขาย</th>
                    <th className="text-left px-3 py-2 font-semibold">ใบเสนอราคา</th>
                    <th className="text-left px-3 py-2 font-semibold">ลูกค้า</th>
                    <th className="text-left px-3 py-2 font-semibold">รถ</th>
                    <th className="text-right px-3 py-2 font-semibold">ราคาขาย</th>
                    <th className="text-right px-3 py-2 font-semibold">ค่าคอม</th>
                    <th className="text-right px-4 py-2 font-semibold">สะสม</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.sales.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-zinc-400">ยังไม่มีรายการปิดการขาย</td></tr>
                  )}
                  {shown.sales.map((s) => (
                    <tr key={`${s.quotationNo}-${s.nth}`} className="border-t border-zinc-100 dark:border-zinc-800/70">
                      <td className="px-4 py-2 font-semibold tabular-nums">{s.nth}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{fmtDate(s.wonAt)}</td>
                      <td className="px-3 py-2">
                        {s.quotationId
                          ? <Link href={`/partner/quotations/${s.quotationId}`} className="text-emerald-700 dark:text-emerald-400 hover:underline">{s.quotationNo}</Link>
                          : s.quotationNo}
                      </td>
                      <td className="px-3 py-2">{s.customerName || "—"}</td>
                      <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        {s.licensePlate || "—"}{s.truckNumber ? ` · ${s.truckNumber}` : ""}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{formatMoney(s.salePrice)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(s.commission)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{formatMoney(s.cumulative)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-6 text-sm text-zinc-500 text-center">
          ยังไม่มีใบเสนอราคาที่ปิดการขายในชื่อคุณ — ปิดดีลแรกแล้วยอดจะขึ้นที่นี่
        </p>
      )}

      {/* ── สรุปทุกคน (แอดมิน) ── */}
      {d?.canSeeAll && d.all.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <p className="px-4 py-2.5 text-sm font-semibold border-b border-zinc-100 dark:border-zinc-800">สรุปทุกคน</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[11px] uppercase text-zinc-400 dark:text-zinc-500 bg-zinc-50/60 dark:bg-zinc-900/40">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">พนักงานขาย</th>
                  <th className="text-right px-3 py-2 font-semibold">ขายได้</th>
                  <th className="text-right px-3 py-2 font-semibold">มูลค่าขาย</th>
                  <th className="text-right px-3 py-2 font-semibold">อัตราถัดไป</th>
                  <th className="text-right px-4 py-2 font-semibold">ค่าคอมสะสม</th>
                </tr>
              </thead>
              <tbody>
                {d.all.map((r) => (
                  <tr key={r.key}
                    onClick={() => setPick(r.key)}
                    className={`border-t border-zinc-100 dark:border-zinc-800/70 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40 ${r.key === pick ? "bg-emerald-50/60 dark:bg-emerald-900/10" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      {r.name}
                      {r.unassigned && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">ไม่ระบุผู้ขาย</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.count} คัน</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{formatMoney(r.salesValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-500 dark:text-zinc-400">{formatMoney(r.currentRate)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── กติกา ── */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
        <p className="text-sm font-semibold mb-2">อัตราค่าคอมมิชชั่น (สะสมตลอด ไม่รีเซ็ตรอบ)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {COMMISSION_TIERS.map((t, i) => (
            <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-800 px-3 py-2">
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{tierLabel(i)}</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(t.rate)} <span className="text-[11px] font-normal text-zinc-400">บาท/คัน</span></p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
          นับเมื่อใบเสนอราคาเปลี่ยนเป็น “ปิดการขาย” · แต่ละคันได้อัตราตามช่วงของคันนั้น (ไม่ย้อนปรับคันเก่า)
        </p>
      </div>
    </div>
  )
}

function Stat({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent?: boolean
}) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${accent
      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10"
      : "border-zinc-200 dark:border-zinc-800"}`}>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">{icon} {label}</p>
      <p className={`text-xl font-bold tabular-nums mt-0.5 ${accent ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{sub}</p>}
    </div>
  )
}
