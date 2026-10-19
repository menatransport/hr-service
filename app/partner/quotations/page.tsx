/* eslint-disable prefer-const, react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { usePartnerSession } from "@/lib/partner/auth/client"
import Link from "next/link"
import { Plus, Search, X, LayoutGrid, List, Phone, Clock, FileDown, UserPlus } from "lucide-react"
import { formatMoney } from "@/lib/partner/utils"
import { SalesPersonSelect } from "@/components/partner/sales-person-select"
import { Skeleton } from "@/components/partner/ui/skeleton"
import { usePagination, PaginationBar } from "@/components/partner/pagination"
import { STATUS_LABEL } from "@/lib/partner/deal-stage"
import {
  PHASE_BUCKETS, SIDE_BUCKETS, BADGE_CLASS, DOT_COLOR, FOLLOW_CLASS,
  badgeKind, bucketOf, bucketStats, stageCounts, daysIn, filterDeals, followTone, kpis,
  progressSegments, sortDeals, stuckClass, type Quick,
} from "@/lib/partner/deal-list"

const stageLabel = (s?: string) => STATUS_LABEL[(s ?? "LEAD") as keyof typeof STATUS_LABEL] ?? s ?? "—"
const millions = (v: number) => `฿${(v / 1e6).toFixed(2)}M`
const shortDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : ""
const initials = (name?: string) => (name ?? "").trim().slice(0, 2) || "—"

interface Quote {
  _id: string; quotationNo: string; status: string
  stage?: string; stageEnteredAt?: string; nextFollowUpDate?: string; lossReasonLabel?: string
  holdReason?: string; timeline?: { at: string; action: string; note?: string }[]
  customerName: string; customerPhone?: string
  licensePlate: string; vehicleBrand?: string; vehicleModel?: string; truckNumber?: string
  totalSalePrice: number; monthlyPayment: number; financeInstallments?: number; depositAmount?: number
  salesName: string; salesEmail?: string; createdAt: string
}

/** บรรทัดล่างของช่องติดตาม — เหตุผลที่พัก หรือบันทึกล่าสุด */
const lastNote = (r: Quote) => {
  if (r.stage === "ON_HOLD" && r.holdReason) return r.holdReason
  if (r.stage === "CLOSED_LOST") return r.lossReasonLabel ?? ""
  const last = [...(r.timeline ?? [])].reverse().find((t) => t.note)
  return last?.note ?? ""
}
interface PriceRow {
  licensePlate: string; status: string; saleStatus: string | null
  vehicleBrand?: string; vehicleModel?: string; truckNumber?: string; photoUrl?: string
  photos?: { front?: string; back?: string; left?: string; right?: string; cabin?: string }
  totalSalePrice: number; downPayment: number; cashDown: number; remainingInstallment: number
  downInstallmentCount: number; downInstallmentAmt: number
  financeAmount: number; financeInstallments: number; monthlyPayment: number
}
interface Customer { _id: string; name: string; phone?: string }

const COLS = "grid-cols-[112px_minmax(150px,1fr)_minmax(150px,1fr)_128px_184px_148px_88px_36px]"

function QuotationsInner() {
  const sp = useSearchParams()
  const { data: session } = usePartnerSession()
  const [rows, setRows] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  // ?stage=<ขั้น> — ลิงก์จากแบนเนอร์คอขวดในแดชบอร์ด เปิดมาพร้อมกรองด่านนั้นไว้แล้ว
  const [bucket, setBucket] = useState(() => bucketOf(sp.get("stage") ?? ""))
  const [quick, setQuick] = useState<Quick>("")     // ตัวกรองด่วนจากการ์ด KPI
  const [mine, setMine] = useState(false)
  const [q, setQ] = useState("")
  const [qSent, setQSent] = useState("")
  const [formMode, setFormMode] = useState<"lead" | "quote" | null>(null)
  const [view, setView] = useState<"list" | "board">("list")

  // ค้นหาเท่านั้นที่ส่งให้ server (หน่วง 250ms) — ด่าน/ตัวกรองด่วนทำฝั่งนี้ ตัวเลขจะได้ไม่เพี้ยน
  useEffect(() => {
    const t = setTimeout(() => setQSent(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (qSent) p.set("q", qSent)
    fetch(`/api/partner/quotations?${p}`).then((r) => r.ok ? r.json() : []).then((d) => setRows(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [qSent])
  useEffect(load, [load])

  // deep-link จาก price-list: /quotations?vehicle=<ทะเบียน> → เปิดฟอร์มพร้อมรถ
  const presetPlate = sp.get("vehicle") ?? ""
  useEffect(() => { if (presetPlate) setFormMode("quote") }, [presetPlate])

  const me = useMemo(() => ({ email: session?.user?.email, name: session?.user?.name }), [session])
  // ฐานของตัวนับ = ทุกดีลที่โหลดมา (กรองเฉพาะ "ดีลของฉัน") — ไม่ผูกกับด่านที่เลือก
  const base = useMemo(() => filterDeals(rows, { mine, me }), [rows, mine, me])
  const stats = useMemo(() => bucketStats(base), [base])
  const byStage = useMemo(() => stageCounts(base), [base])
  const k = useMemo(() => kpis(rows), [rows])
  const shown = useMemo(() => sortDeals(filterDeals(base, { bucket, quick })), [base, bucket, quick])

  const pg = usePagination(shown, 50, [qSent, bucket, quick, mine, view])
  const quickLabel = quick === "followup" ? "ต้องติดตามวันนี้" : "ค้างขั้นเกิน 30 วัน"
  const toggle = (next: Quick) => setQuick((cur) => (cur === next ? "" : next))

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold text-zinc-500 tracking-wider">ระบบขาย</p>
          <h1 className="text-[26px] leading-tight font-bold mt-0.5">ดีล &amp; ใบเสนอราคา</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">เลือกรถพร้อมขาย → ออกใบเสนอราคา → ติดตามดีลจนส่งมอบครบ 90 วัน · ทั้งทีมเห็นทุกดีล</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setFormMode("lead")} className="h-10 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-sm font-semibold px-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
            <UserPlus className="w-4 h-4" /> ลูกค้าสนใจ (Lead)
          </button>
          <button onClick={() => setFormMode("quote")} className="h-10 flex items-center gap-2 gold-grad text-[#3F3000] text-sm font-semibold px-[18px] rounded-lg">
            <Plus className="w-4 h-4" /> สร้างใบเสนอราคา
          </button>
        </div>
      </header>

      {/* KPI — คิดจากดีลทั้งหมด สองใบแรกกดเพื่อกรองได้ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button onClick={() => toggle("followup")} aria-pressed={quick === "followup"}
          className={`flex flex-col items-start gap-1 px-4 py-3.5 rounded-xl text-left bg-[#FFFCEB] dark:bg-amber-950/20 ${quick === "followup" ? "border-2 border-[#031B14] dark:border-amber-300" : "border border-[#EAC54F]"}`}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[#7A4E00] dark:text-amber-300"><Phone className="w-4 h-4" /> ต้องติดตามวันนี้</span>
          <span className="text-[26px] leading-none font-bold tabular-nums">{k.followUpToday}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">รวมเลยกำหนด {k.followUpOverdue} ดีล · กดเพื่อกรอง</span>
        </button>
        <button onClick={() => toggle("stuck")} aria-pressed={quick === "stuck"}
          className={`flex flex-col items-start gap-1 px-4 py-3.5 rounded-xl text-left bg-[#FFF5F4] dark:bg-red-950/20 ${quick === "stuck" ? "border-2 border-[#031B14] dark:border-red-300" : "border border-[#FFCECB]"}`}>
          <span className="flex items-center gap-2 text-[13px] font-semibold text-[#A40E26] dark:text-red-300"><Clock className="w-4 h-4" /> ค้างขั้นเกิน 30 วัน</span>
          <span className="text-[26px] leading-none font-bold tabular-nums">{k.stuck}</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">ควรขยับ พัก หรือปิดดีล · กดเพื่อกรอง</span>
        </button>
        <div className="flex flex-col gap-1 px-4 py-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <span className="text-[13px] font-semibold text-zinc-500">มูลค่า pipeline (ยังไม่ปิด)</span>
          <span className="text-[26px] leading-none font-bold tabular-nums">฿{Math.round(k.openValue).toLocaleString("en-US")}</span>
          <span className="text-xs text-zinc-500">{k.openCount} ดีลที่ยังเดินอยู่</span>
        </div>
        <div className="flex flex-col gap-1 px-4 py-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <span className="text-[13px] font-semibold text-zinc-500">ส่งมอบ / ครบ 90 วัน</span>
          <span className="text-[26px] leading-none font-bold tabular-nums text-[#165443] dark:text-emerald-300">{k.delivered + k.completed} ดีล</span>
          <Link href="/partner/quotations/pipeline" className="text-xs font-semibold text-[#7A5C14] dark:text-[#E7C86E] hover:underline">ดูแดชบอร์ดไปป์ไลน์ →</Link>
        </div>
      </div>

      {/* แถบด่าน — ตัวเลขคิดจาก base เสมอ เลือกด่านหนึ่งแล้วด่านอื่นไม่เปลี่ยน */}
      <div className="flex flex-col xl:flex-row items-stretch gap-3">
        <div role="group" aria-label="กรองตามด่าน"
          className="flex-1 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <PhaseTab label="ทั้งหมด" parts={[]} count={base.length} on={bucket === ""} onClick={() => setBucket("")} />
          {PHASE_BUCKETS.map((b) => (
            <PhaseTab key={b.key} color={b.color} label={b.label}
              parts={b.stages.map((s) => ({ label: stageLabel(s), count: byStage[s] ?? 0 }))}
              count={stats[b.key].count}
              on={bucket === b.key} onClick={() => setBucket(bucket === b.key ? "" : b.key)} />
          ))}
        </div>
        <div className="flex xl:flex-col gap-2 xl:w-[170px]">
          {SIDE_BUCKETS.map((b) => (
            <button key={b.key} onClick={() => setBucket(bucket === b.key ? "" : b.key)} aria-pressed={bucket === b.key}
              className={`flex-1 flex items-center gap-2 h-9 xl:h-auto px-3 rounded-[10px] text-[13px] font-semibold border ${
                bucket === b.key ? "bg-[#031B14] text-white border-[#031B14]" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
              {b.label}
              <span className="ml-auto tabular-nums">{stats[b.key].count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        {/* แถบเครื่องมือ */}
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <label className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-zinc-500" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาดีล"
              placeholder="ค้นหา เลขที่ / ลูกค้า / ทะเบียน / เซลล์"
              className="w-full sm:w-[300px] h-[38px] text-sm pl-9 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50" />
          </label>
          <div role="group" aria-label="เจ้าของดีล" className="flex border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {[{ v: false, t: "ทุกคน" }, { v: true, t: "ดีลของฉัน" }].map((o) => (
              <button key={o.t} onClick={() => setMine(o.v)} aria-pressed={mine === o.v}
                className={`h-9 px-3 text-[13px] ${mine === o.v ? "bg-[#031B14] text-white font-semibold" : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"}`}>
                {o.t}
              </button>
            ))}
          </div>
          {quick && (
            <button onClick={() => setQuick("")} className="h-8 px-2.5 flex items-center gap-1.5 rounded-full border border-[#D4A72C] bg-[#FFF8C5] text-[#7A4E00] text-xs font-semibold">
              {quickLabel} <X className="w-3 h-3" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[13px] text-zinc-500 hidden sm:inline">เรียง: ติดตามถัดไป</span>
            <div role="group" aria-label="มุมมอง" className="flex border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
              <button onClick={() => setView("list")} aria-label="มุมมองตาราง" aria-pressed={view === "list"}
                className={`w-[38px] h-9 flex items-center justify-center ${view === "list" ? "bg-[#031B14] text-white" : "bg-white dark:bg-zinc-900 text-zinc-500"}`}><List className="w-4 h-4" /></button>
              <button onClick={() => setView("board")} aria-label="มุมมองกระดานดีล" aria-pressed={view === "board"}
                className={`w-[38px] h-9 flex items-center justify-center ${view === "board" ? "bg-[#031B14] text-white" : "bg-white dark:bg-zinc-900 text-zinc-500"}`}><LayoutGrid className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {view === "list" ? (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[1040px]">
                <div className={`grid ${COLS} gap-3 items-center px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800 text-xs font-semibold text-zinc-500`}>
                  <div>เลขที่</div><div>ลูกค้า</div><div>รถ</div><div className="text-right">ราคาขาย / ค่างวด</div>
                  <div>ขั้นของดีล</div><div>ติดตามถัดไป</div><div>เซลล์</div><div />
                </div>
                {loading ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={`sk${i}`} className={`grid ${COLS} gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800`}>
                    {Array.from({ length: 8 }).map((_, c) => <Skeleton key={c} className="h-5" />)}
                  </div>
                )) : pg.paged.map((r) => <DealRow key={r._id} r={r} />)}
                {!loading && shown.length === 0 && (
                  <p className="py-14 text-center text-sm text-zinc-500">ไม่พบดีลที่ตรงเงื่อนไข — ลองล้างตัวกรอง หรือกด &quot;สร้างใบเสนอราคา&quot;</p>
                )}
              </div>
            </div>
            {!loading && shown.length > 0 && <PaginationBar {...pg} unit="ดีล" />}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 p-4 bg-zinc-50 dark:bg-zinc-900/40">
              {PHASE_BUCKETS.map((b) => {
                const cards = shown.filter((r) => b.stages.includes(r.stage ?? ""))
                return (
                  <div key={b.key} className="flex flex-col gap-2.5 min-w-0">
                    <div className="pb-2 px-1 border-b-2" style={{ borderColor: b.color }}>
                      <div className="flex items-center gap-2 text-[13px] font-bold">
                        {b.label}<span className="ml-auto font-semibold text-zinc-500 tabular-nums">{cards.length}</span>
                      </div>
                      <div className="text-xs text-zinc-500 tabular-nums">{millions(cards.reduce((s, r) => s + (r.totalSalePrice ?? 0), 0))}</div>
                    </div>
                    {cards.map((r) => <BoardCard key={r._id} r={r} />)}
                  </div>
                )
              })}
            </div>
            <p className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/40 text-xs text-zinc-500">
              ขยับขั้นทำได้จากหน้าดีลเท่านั้น (ต้องมีข้อมูลบังคับครบ) · ดีลพักติดตามและปิดไม่สำเร็จ ดูได้จากปุ่มด้านขวาของแถบด่าน
            </p>
          </>
        )}
      </div>

      {formMode && (
        <QuoteForm mode={formMode} presetPlate={presetPlate} onClose={() => setFormMode(null)} onSaved={() => { setFormMode(null); load() }} />
      )}
    </div>
  )
}

export default function QuotationsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-zinc-400 dark:text-zinc-500">กำลังโหลด...</div>}>
      <QuotationsInner />
    </Suspense>
  )
}

function PhaseTab({ color, label, parts, count, on, onClick }: {
  color?: string; label: string; parts: { label: string; count: number }[]; count: number; on: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`flex flex-col items-start gap-0.5 min-w-0 px-3.5 py-2.5 text-left border-r border-zinc-100 dark:border-zinc-800 last:border-r-0 ${
        on ? "bg-[#031B14] text-white shadow-[inset_0_-3px_0_#C9A227]" : "bg-white dark:bg-zinc-900"}`}>
      <span className={`flex items-center gap-1.5 text-xs font-semibold ${on ? "text-[#E7C86E]" : "text-zinc-500"}`}>
        {color && <span className="w-2 h-2 rounded-sm" style={{ background: color }} />}{label}
      </span>
      <span className="text-lg font-bold tabular-nums">{count}</span>
      {/* ขั้นย่อยของด่าน — บรรทัดละขั้น ตัวเลขชิดขวา อ่านง่ายกว่าเอามาต่อกันแล้วโดนตัด */}
      <span className={`w-full flex flex-col gap-px text-[11px] ${on ? "text-white/70" : "text-zinc-500"}`}>
        {parts.length === 0 ? "ทุกด่าน" : parts.map((p) => (
          <span key={p.label} className="flex justify-between gap-2">
            <span className="truncate">{p.label}</span>
            <span className={`shrink-0 tabular-nums font-semibold ${p.count === 0 ? "" : on ? "text-white" : "text-zinc-900 dark:text-zinc-100"}`}>{p.count}</span>
          </span>
        ))}
      </span>
    </button>
  )
}

function StageBadge({ stage }: { stage?: string }) {
  const kind = badgeKind(stage)
  const dot = DOT_COLOR[kind] || PHASE_BUCKETS.find((b) => b.stages.includes(stage ?? ""))?.color || "#8C959F"
  return (
    <span className={`inline-flex self-start items-center gap-1.5 pl-2 pr-2.5 py-0.5 rounded-full text-xs font-semibold ${BADGE_CLASS[kind]}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />{stageLabel(stage)}
    </span>
  )
}

function StageProgress({ r }: { r: Quote }) {
  const days = daysIn(r.stageEnteredAt)
  return (
    <div className="flex items-center gap-2">
      <div aria-hidden className="flex gap-0.5">
        {progressSegments(r.stage).map((c, i) => (
          <span key={i} className="w-[9px] h-1.5 rounded-sm" style={{ background: c }} />
        ))}
      </div>
      <span className={`text-[11px] ${stuckClass(days)}`}>
        {r.stage === "CLOSED_LOST" ? "ปิดแล้ว" : days === null ? "" : `ค้าง ${days} วัน`}
      </span>
    </div>
  )
}

function DealRow({ r }: { r: Quote }) {
  const tone = followTone(r.nextFollowUpDate)
  return (
    <div className={`grid ${COLS} gap-3 items-center px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/40`}>
      <div>
        <Link href={`/partner/quotations/${r._id}`} className="font-mono text-[13px] font-semibold text-[#7A5C14] dark:text-[#E7C86E] hover:underline">{r.quotationNo}</Link>
        <div className="text-xs text-zinc-500">{shortDate(r.createdAt)}</div>
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">{r.customerName}</div>
        <div className="text-xs text-zinc-500 tabular-nums">{r.customerPhone ?? ""}</div>
      </div>
      <div className="min-w-0">
        <div className={r.licensePlate ? "font-medium truncate" : "italic text-zinc-500"}>{r.licensePlate || "ยังไม่เลือกรถ"}</div>
        <div className="text-xs text-zinc-500 truncate">
          {[r.vehicleBrand, r.truckNumber ? `เบอร์รถ ${r.truckNumber}` : ""].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="text-right tabular-nums">
        <div className="font-semibold">{r.totalSalePrice ? formatMoney(r.totalSalePrice) : "—"}</div>
        <div className="text-xs text-zinc-500">
          {r.monthlyPayment ? `${formatMoney(r.monthlyPayment)} × ${r.financeInstallments ?? 0}` : "ยังไม่ออกใบเสนอ"}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <StageBadge stage={r.stage} />
        <StageProgress r={r} />
      </div>
      <div className="min-w-0">
        <div className={`text-[13px] ${FOLLOW_CLASS[tone]}`}>
          {tone === "none" ? "—" : tone === "today" ? "วันนี้" : tone === "overdue"
            ? `เลยกำหนด ${daysIn(`${r.nextFollowUpDate}T00:00:00`)} วัน` : shortDate(r.nextFollowUpDate)}
        </div>
        <div className="text-xs text-zinc-500 truncate">{lastNote(r)}</div>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-6 h-6 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-[#165443] dark:text-emerald-300 flex items-center justify-center">{initials(r.salesName)}</span>
        <span className="text-xs text-zinc-500 truncate">{r.salesName}</span>
      </div>
      <a href={`/api/partner/quotations/${r._id}/pdf`} target="_blank" rel="noreferrer" aria-label={`เปิดใบเสนอ PDF ${r.quotationNo}`} title="ใบเสนอ PDF"
        className="w-9 h-9 flex items-center justify-center rounded-lg text-[#7A5C14] dark:text-[#E7C86E] hover:bg-zinc-100 dark:hover:bg-zinc-800">
        <FileDown className="w-[17px] h-[17px]" />
      </a>
    </div>
  )
}

function BoardCard({ r }: { r: Quote }) {
  const days = daysIn(r.stageEnteredAt)
  const tone = followTone(r.nextFollowUpDate)
  return (
    <Link href={`/partner/quotations/${r._id}`} className="block p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[10px] hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-[#7A5C14] dark:text-[#E7C86E]">{r.quotationNo}</span>
        <span className={`text-[11px] ${stuckClass(days)}`}>{days === null ? "" : `ค้าง ${days} วัน`}</span>
      </div>
      <div className="text-sm font-semibold mt-1">{r.customerName}</div>
      <div className="text-xs text-zinc-500 truncate">{[r.licensePlate, r.vehicleBrand].filter(Boolean).join(" · ") || "ยังไม่เลือกรถ"}</div>
      <div className="mt-2"><StageBadge stage={r.stage} /></div>
      <div className="flex items-center justify-between gap-2 mt-2 text-xs">
        <span className="text-sm font-bold tabular-nums shrink-0">{r.totalSalePrice ? formatMoney(r.totalSalePrice) : "—"}</span>
        <span className="text-zinc-500 truncate min-w-0">{r.salesName}</span>
      </div>
      {r.nextFollowUpDate && (
        <div className={`mt-2 px-2 py-0.5 rounded-md text-[11px] font-semibold inline-block ${
          tone === "overdue" ? "bg-[#FFEBE9] text-[#A40E26] dark:bg-red-950/40 dark:text-red-300"
            : tone === "today" ? "bg-[#FFF8C5] text-[#7A4E00] dark:bg-amber-950/40 dark:text-amber-300"
            : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500"}`}>
          {tone === "today" ? "ติดตามวันนี้" : `ติดตาม ${shortDate(r.nextFollowUpDate)}`}
        </div>
      )}
    </Link>
  )
}

function QuoteForm({ mode, presetPlate, onClose, onSaved }: { mode: "lead" | "quote"; presetPlate: string; onClose: () => void; onSaved: () => void }) {
  const isLead = mode === "lead"
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [plate, setPlate] = useState(presetPlate)
  const [plateQ, setPlateQ] = useState(presetPlate)
  const [plateOpen, setPlateOpen] = useState(false)
  const [custQ, setCustQ] = useState("")
  const [custList, setCustList] = useState<Customer[]>([])
  const [custId, setCustId] = useState("")
  const [custName, setCustName] = useState("")
  const [custPhone, setCustPhone] = useState("")
  const [salesName, setSalesName] = useState("")
  const { data: session } = usePartnerSession()
  useEffect(() => { if (session?.user?.name) setSalesName((s) => s || session.user!.name!) }, [session])
  const [snap, setSnap] = useState<Record<string, number>>({})
  const [cashDown, setCashDown] = useState(0)
  const [savingsUsed, setSavingsUsed] = useState(0)   // เงินสะสม พจส. (บันทึกไว้เฉย ๆ)
  const [extras, setExtras] = useState("")
  const [extrasAuto, setExtrasAuto] = useState(true)
  const [promoNote, setPromoNote] = useState("")
  const [note, setNote] = useState("")
  const [validUntil, setValidUntil] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => { fetch("/api/partner/price-list").then((r) => r.ok ? r.json() : []).then((d: PriceRow[]) => setPrices(d)) }, [])
  useEffect(() => {
    const row = prices.find((p) => p.licensePlate === plate)
    if (row) {
      setSnap({ totalSalePrice: row.totalSalePrice, downPayment: row.downPayment, cashDown: row.cashDown,
        downInstallmentCount: row.downInstallmentCount, financeAmount: row.financeAmount,
        financeInstallments: row.financeInstallments, monthlyPayment: row.monthlyPayment })
      setCashDown(row.cashDown)
    }
  }, [plate, prices])
  useEffect(() => {
    const t = setTimeout(() => fetch(`/api/partner/customers?q=${encodeURIComponent(custQ)}`).then((r) => r.ok ? r.json() : []).then(setCustList), 250)
    return () => clearTimeout(t)
  }, [custQ])
  useEffect(() => {
    if (!plate) { setPromoNote(""); return }
    fetch(`/api/partner/promotions/master?plate=${encodeURIComponent(plate)}`).then((r) => r.ok ? r.json() : null).then((d) => {
      setPromoNote(d?.found ? "ดึงจากโปรโมชั่นของรถคันนี้อัตโนมัติ" : "รถคันนี้ยังไม่ตั้งโปรโมชั่นใน /promotions")
      if (extrasAuto) setExtras(d?.summary ?? "")
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate])

  const sel = prices.find((p) => p.licensePlate === plate)
  // ดาวน์ต่องวด = (ดาวน์รวม − ดาวน์ชำระเลย) / จำนวนงวดดาวน์ (คำนวณอัตโนมัติ)
  const remainDown = Math.max(0, (snap.downPayment ?? 0) - cashDown)
  const downPerInstallment = snap.downInstallmentCount ? Math.round(remainDown / snap.downInstallmentCount) : 0
  // เลือกได้ทุกคัน — ไม่ติดเงื่อนไขสถานะสัญญา
  const plateMatches = prices.filter((p) => p.licensePlate.replace(/\s/g, "").includes(plateQ.replace(/\s/g, ""))).slice(0, 25)
  const fmtNum = (n: number) => (n ?? 0).toLocaleString("th-TH")

  async function submit() {
    if (!isLead && !plate) { setErr("เลือกรถก่อน"); return }
    if (!custName.trim() && !custId) { setErr("ระบุลูกค้า"); return }
    setSaving(true); setErr("")
    try {
      let cid = custId, cname = custName.trim(), cphone = custPhone.trim()
      if (!cid && cname) {
        const cr = await fetch("/api/partner/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: cname, phone: cphone }) })
        if (cr.ok) cid = (await cr.json())._id
      }
      const body = {
        status: isLead ? "lead" : "quoted",
        licensePlate: plate,
        vehicleBrand: sel?.vehicleBrand ?? "", vehicleModel: sel?.vehicleModel ?? "", truckNumber: sel?.truckNumber ?? "",
        vehiclePhotoUrl: sel?.photoUrl ?? "",
        vehiclePhotos: sel?.photos ?? undefined,
        customerId: cid, customerName: cname, customerPhone: cphone,
        salesName: salesName.trim(), savingsUsed,
        totalSalePrice: snap.totalSalePrice ?? 0, downPayment: snap.downPayment ?? 0, cashDown,
        downInstallmentCount: snap.downInstallmentCount ?? 0, downInstallmentAmt: downPerInstallment,
        financeAmount: snap.financeAmount ?? 0, financeInstallments: snap.financeInstallments ?? 0, monthlyPayment: snap.monthlyPayment ?? 0,
        extras, note, validUntil,
      }
      const r = await fetch("/api/partner/quotations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? "บันทึกไม่สำเร็จ"); return }
      if (!isLead) window.open(`/api/partner/quotations/${d._id}/pdf`, "_blank")
      onSaved()
    } finally { setSaving(false) }
  }

  const ro = (label: string, value: string) => (
    <div className="flex justify-between text-sm py-1">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span><span className="font-medium tabular-nums">{value}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h2 className="font-bold">{isLead ? "บันทึกลูกค้าสนใจ (Lead)" : "สร้างใบเสนอราคา"}</h2>
          <button onClick={onClose} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* เลือกรถ — auto search */}
          <div className="relative">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">เลือกรถพร้อมขาย {isLead && <span className="text-zinc-300">(ไม่บังคับ)</span>}</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
              <input value={plateQ} onChange={(e) => { setPlateQ(e.target.value); setPlateOpen(true); setPlate("") }} onFocus={() => setPlateOpen(true)}
                placeholder="พิมพ์ทะเบียนเพื่อค้นหา" className="w-full h-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3" />
            </div>
            {plateOpen && plateQ && !plate && plateMatches.length > 0 && (
              <div className="absolute z-20 left-0 right-0 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg mt-1 max-h-52 overflow-y-auto shadow-lg">
                {plateMatches.map((p) => (
                  <button key={p.licensePlate} onClick={() => { setPlate(p.licensePlate); setPlateQ(p.licensePlate); setPlateOpen(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex justify-between">
                    <span className="font-medium">{p.licensePlate}</span>
                    <span className="text-zinc-400 dark:text-zinc-500 text-xs">{p.vehicleBrand} · {fmtNum(p.totalSalePrice)}</span>
                  </button>
                ))}
              </div>
            )}
            {sel && (
              <div className="flex items-center gap-3 mt-2">
                {sel.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sel.photoUrl} alt="รถ" className="w-16 h-12 object-cover rounded-md border border-zinc-200 dark:border-zinc-700" />
                )}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{sel.vehicleBrand || "-"} {sel.vehicleModel || ""} · เบอร์รถ {sel.truckNumber || "-"}{!sel.photoUrl && " · (รถคันนี้ยังไม่มีรูป)"}</p>
              </div>
            )}
          </div>

          {/* ลูกค้า */}
          <div className="border-t pt-4">
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">ลูกค้า</label>
            <input value={custName} onChange={(e) => { setCustName(e.target.value); setCustQ(e.target.value); setCustId("") }}
              placeholder="พิมพ์ชื่อลูกค้า (ใหม่/ค้นหาเดิม)" className="w-full h-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3" />
            {custQ && custList.length > 0 && !custId && (
              <div className="border border-zinc-100 dark:border-zinc-800 rounded-lg mt-1 max-h-32 overflow-y-auto">
                {custList.map((c) => (
                  <button key={c._id} onClick={() => { setCustId(c._id); setCustName(c.name); setCustPhone(c.phone ?? ""); setCustQ("") }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50">{c.name}<span className="text-zinc-400 dark:text-zinc-500 text-xs">{c.phone ? ` · ${c.phone}` : ""}</span></button>
                ))}
              </div>
            )}
            <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="เบอร์โทร" className="w-full h-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 mt-2" />
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1 mt-3">พนักงานขาย (เซล)</label>
            <SalesPersonSelect value={salesName} onChange={setSalesName}
              className="w-full h-10 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 bg-white dark:bg-zinc-900" />
            {custId && <p className="text-[11px] text-emerald-600 mt-1">✓ ลูกค้าเดิมในระบบ</p>}
          </div>

          {/* ราคา — แก้ได้แค่ดาวน์ชำระเลย ที่เหลือ read-only + คำนวณดาวน์/งวด */}
          {sel && (
            <div className="border-t pt-4">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">ราคา</label>
              {ro("ราคาขายรวม", `${fmtNum(snap.totalSalePrice)} บาท`)}
              {ro("เงินดาวน์รวม", `${fmtNum(snap.downPayment)} บาท`)}
              <div className="flex items-center justify-between py-1.5 bg-amber-50/60 rounded-lg px-2 my-1">
                <span className="text-sm text-zinc-600 dark:text-zinc-300">ดาวน์ชำระเลย <span className="text-[10px] text-amber-600">(แก้ได้)</span></span>
                <input type="number" value={cashDown} onChange={(e) => setCashDown(Number(e.target.value) || 0)}
                  className="w-32 h-8 text-sm border border-amber-300 rounded-lg px-2 text-right tabular-nums bg-white dark:bg-zinc-900" />
              </div>
              {ro(`ดาวน์คงเหลือ (ผ่อน ${snap.downInstallmentCount || 0} งวด)`, `${fmtNum(remainDown)} บาท`)}
              <div className="flex justify-between text-sm py-1 font-semibold text-[#8C6B1F]">
                <span>→ ดาวน์/งวด (คำนวณ)</span><span className="tabular-nums">{fmtNum(downPerInstallment)} บาท</span>
              </div>
              <div className="border-t border-zinc-100 dark:border-zinc-800 my-1" />
              {ro("ยอดจัดไฟแนนซ์", `${fmtNum(snap.financeAmount)} บาท`)}
              {ro("ค่างวด/เดือน", `${fmtNum(snap.monthlyPayment)} × ${snap.financeInstallments || 0} งวด`)}
              <div className="flex items-center justify-between py-1.5 bg-sky-50/60 dark:bg-sky-950/20 rounded-lg px-2 my-1">
                <span className="text-sm text-zinc-600 dark:text-zinc-300">ใช้เงินสะสม พจส. <span className="text-[10px] text-sky-600">(บันทึกไว้ ไม่หักยอด)</span></span>
                <input type="number" value={savingsUsed} onChange={(e) => setSavingsUsed(Number(e.target.value) || 0)}
                  className="w-32 h-8 text-sm border border-sky-300 rounded-lg px-2 text-right tabular-nums bg-white dark:bg-zinc-900" />
              </div>
            </div>
          )}

          {/* ของแถม/โปรโมชั่น */}
          {sel && (
          <div className="border-t pt-4 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">ของแถม / โปรโมชั่น</label>
                {plate && !extrasAuto && (
                  <button type="button" onClick={() => { setExtrasAuto(true); fetch(`/api/partner/promotions/master?plate=${encodeURIComponent(plate)}`).then((r) => r.ok ? r.json() : null).then((d) => setExtras(d?.summary ?? "")) }}
                    className="text-[10px] text-[#C9A227] hover:underline">↺ ดึงโปรฯ ของรถอีกครั้ง</button>
                )}
              </div>
              <textarea value={extras} onChange={(e) => { setExtras(e.target.value); setExtrasAuto(false) }} rows={3}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2" placeholder="เลือกรถแล้วระบบจะดึงโปรโมชั่นให้อัตโนมัติ (แก้เพิ่มได้)" />
              {promoNote && <p className={`text-[10px] mt-0.5 ${extrasAuto ? "text-emerald-600" : "text-zinc-400 dark:text-zinc-500"}`}>{extrasAuto ? "✓ " : ""}{promoNote}</p>}
            </div>
          </div>
          )}

          <div className="border-t pt-4 space-y-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">{isLead ? "โน้ต / ความสนใจ" : "หมายเหตุ"}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full h-9 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3" />
            </div>
            {!isLead && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">ยืนราคาถึง</label>
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="h-9 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2" />
              </div>
            )}
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
        </div>
        <div className="sticky bottom-0 bg-white dark:bg-zinc-900 border-t px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-zinc-500 dark:text-zinc-400 px-4 py-2">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="bg-emerald-600 text-white text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : isLead ? "บันทึกลูกค้าสนใจ" : "สร้าง + เปิด PDF"}
          </button>
        </div>
      </div>
    </div>
  )
}
