/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { List, Filter } from "lucide-react"
import { StatsSkeleton } from "@/components/partner/ui/skeleton"
import { PHASES, PHASE_COLOR, STAGES } from "@/lib/partner/deal-stage"

/**
 * แดชบอร์ดไปป์ไลน์ขายรถร่วม — ตัวเลขคำนวณที่ lib/deal-metrics (มีเทสต์) หน้านี้แค่แสดงผล
 * หัวใจของหน้าคือตาราง "ภาพรวมทีละขั้น" — รวม funnel / ค้าง / เวลาเฉลี่ย / หลุด ไว้แถวเดียวกัน
 * จะได้อ่านเทียบกันได้ว่าขั้นไหนคือคอขวด
 */

interface Dash {
  total: number
  openByStage: { stage: string; label: string; active: number; onHold: number }[]
  lostByStage: { stage: string; label: string; count: number }[]
  lossReasonByMonth: { month: string; reasons: { label: string; count: number }[] }[]
  avgDaysPerStage: { stage: string; label: string; days: number; samples: number }[]
  trainingToDelivered: { passed: number; delivered: number; rate: number }
  signedToCompleted: { eligible: number; completed: number; rate: number }
  funnel: { stage: string; label: string; count: number; rateFromPrev: number }[]
  followUpOverdue: { id: string; quotationNo: string; salesName: string; holdReason?: string; nextFollowUpDate: string; overdueDays: number }[]
  salesPeople: string[]
  sourceChannels: string[]
}

const THM = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${THM[mo] ?? mo} ${String((y + 543) % 100).padStart(2, "0")}` }
const pct = (n: number) => `${Math.round(n * 100)}%`
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const thDate = (s: string) => s ? new Date(`${s}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—"

/** ช่วงเวลาสำเร็จรูป — ค่าตั้งต้นคือไตรมาสนี้ */
function presetRange(key: string): { from: string; to: string } {
  const now = new Date()
  const to = iso(now)
  if (key === "30d") { const d = new Date(now); d.setDate(d.getDate() - 29); return { from: iso(d), to } }
  if (key === "month") return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to }
  if (key === "quarter") return { from: iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), to }
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to }
}
const PRESETS = [
  { key: "30d", label: "30 วัน" },
  { key: "month", label: "เดือนนี้" },
  { key: "quarter", label: "ไตรมาสนี้" },
  { key: "year", label: "ปีนี้" },
]

const phaseOfStage = (stage: string) => PHASES.find((p) => (p.stages as string[]).includes(stage))

export default function PipelineDashboardPage() {
  const [d, setD] = useState<Dash | null>(null)
  const [loading, setLoading] = useState(true)
  const init = presetRange("quarter")
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [sales, setSales] = useState("")
  const [source, setSource] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (sales) p.set("sales", sales)
    if (source) p.set("source", source)
    fetch(`/api/partner/deals/dashboard?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      // โหลดข้อมูลตอน mount/เปลี่ยนตัวกรอง — ไม่ใช่ cascading render
      // eslint-disable-next-line react-hooks/set-state-in-effect
      .then(setD)
      .finally(() => setLoading(false))
  }, [from, to, sales, source])
  useEffect(() => { load() }, [load])

  const activePreset = PRESETS.find((p) => { const r = presetRange(p.key); return r.from === from && r.to === to })?.key ?? ""
  const pickPreset = (key: string) => { const r = presetRange(key); setFrom(r.from); setTo(r.to) }

  // ─── ตารางภาพรวมทีละขั้น ───
  const rows = useMemo(() => {
    if (!d) return []
    return STAGES.map((stage) => {
      const f = d.funnel.find((x) => x.stage === stage)
      const open = d.openByStage.find((x) => x.stage === stage)
      const avg = d.avgDaysPerStage.find((x) => x.stage === stage)
      const lost = d.lostByStage.find((x) => x.stage === stage)
      return {
        stage, label: f?.label ?? stage,
        reached: f?.count ?? 0,
        rate: f?.rateFromPrev ?? 1,
        active: open?.active ?? 0, onHold: open?.onHold ?? 0,
        days: avg?.days ?? null, samples: avg?.samples ?? 0,
        lost: lost?.count ?? 0,
      }
    })
  }, [d])

  const max = {
    reached: Math.max(1, ...rows.map((r) => r.reached)),
    open: Math.max(1, ...rows.map((r) => r.active + r.onHold)),
    days: Math.max(1, ...rows.map((r) => r.days ?? 0)),
    lost: Math.max(1, ...rows.map((r) => r.lost)),
  }

  // คอขวด = ขั้นที่อัตราผ่านจากขั้นก่อนต่ำสุด (ไม่นับขั้นแรกที่ไม่มีขั้นก่อน)
  const bottleneck = useMemo(() => {
    const cand = rows.slice(1).filter((r) => r.reached > 0 || r.rate < 1)
    if (!cand.length || !d) return null
    const worst = cand.reduce((a, b) => (b.rate < a.rate ? b : a))
    if (worst.rate >= 1) return null
    const prev = rows[STAGES.indexOf(worst.stage as never) - 1]
    const topReason = d.lossReasonByMonth[0]?.reasons[0]
    return { worst, prev, lostAtPrev: prev?.lost ?? 0, topReason }
  }, [rows, d])

  // ตารางความร้อน: 3 เดือนล่าสุด (เก่า → ใหม่) × เหตุผล เรียงตามยอดรวม
  const heat = useMemo(() => {
    if (!d) return null
    const months = d.lossReasonByMonth.slice(0, 3).reverse()
    if (!months.length) return null
    const totals = new Map<string, number>()
    for (const m of months) for (const r of m.reasons) totals.set(r.label, (totals.get(r.label) ?? 0) + r.count)
    const labels = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
    return {
      months,
      rows: labels.map((label) => ({
        label,
        cells: months.map((m) => m.reasons.find((r) => r.label === label)?.count ?? 0),
        total: totals.get(label) ?? 0,
      })),
    }
  }, [d])

  const input = "h-9 rounded-lg border border-hairline bg-surface px-2 text-[13px]"
  const rangeLabel = `${thDate(from)} – ${thDate(to)}`
  const openTotal = rows.reduce((s, r) => s + r.active + r.onHold, 0)
  const holdTotal = rows.reduce((s, r) => s + r.onHold, 0)
  const lead = d?.funnel[0]?.count ?? 0
  const delivered = d?.funnel.find((f) => f.stage === "DELIVERED")?.count ?? 0

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs font-semibold text-soft tracking-wider">ระบบขาย</p>
          <h1 className="text-[26px] leading-tight font-bold mt-0.5">แดชบอร์ดไปป์ไลน์ขาย</h1>
          <p className="text-[13px] text-soft mt-0.5">
            ดีลที่สร้างในช่วง <span className="font-semibold text-foreground">{rangeLabel}</span>
            {d ? ` · ${d.total} ใบ` : ""}
          </p>
        </div>
        <Link href="/partner/quotations" className="h-10 px-4 flex items-center gap-2 bg-surface border border-hairline rounded-lg text-sm font-semibold">
          <List className="w-4 h-4" /> ไปหน้ารายการดีล
        </Link>
      </header>

      {/* ตัวกรอง */}
      <div className="flex flex-wrap items-center gap-2.5 bg-surface border border-hairline rounded-xl px-3 py-2.5">
        <Filter className="w-4 h-4 text-soft shrink-0" />
        <div role="group" aria-label="ช่วงเวลา" className="flex border border-hairline rounded-lg overflow-hidden">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => pickPreset(p.key)} aria-pressed={activePreset === p.key}
              className={`h-9 px-3 text-[13px] ${activePreset === p.key ? "bg-ink-deep text-white font-semibold" : "bg-surface"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[13px] text-soft">ตั้งแต่
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-[13px] text-soft">ถึง
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <span className="w-px h-6 bg-hairline" />
        <label className="flex items-center gap-1.5 text-[13px] text-soft">เซลล์
          <select className={input} value={sales} onChange={(e) => setSales(e.target.value)}>
            <option value="">ทุกคน</option>
            {d?.salesPeople.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {(d?.sourceChannels.length ?? 0) > 0 && (
          <label className="flex items-center gap-1.5 text-[13px] text-soft">ช่องทาง
            <select className={input} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">ทุกช่องทาง</option>
              {d?.sourceChannels.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <button onClick={() => { const r = presetRange("quarter"); setFrom(r.from); setTo(r.to); setSales(""); setSource("") }}
          className="ml-auto h-9 px-3 text-[13px] font-semibold text-brand-ink">ล้างตัวกรอง</button>
      </div>

      {loading || !d ? <StatsSkeleton /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="ผู้สนใจ → ส่งมอบรถ" value={pct(lead ? delivered / lead : 0)} hint={`ส่งมอบ ${delivered} จากผู้สนใจ ${lead} ใบ`} />
            <Kpi title="ดีลที่ยังเดินอยู่" value={String(openTotal)} hint={`ในนั้นพักติดตาม ${holdTotal} ใบ`} />
            <Kpi title="ผ่านฝึกงาน → รับรถจริง" value={pct(d.trainingToDelivered.rate)} good
              hint={`ผ่านฝึก ${d.trainingToDelivered.passed} · รับรถแล้ว ${d.trainingToDelivered.delivered} ใบ`} />
            <Kpi title="เซ็นสัญญา → อยู่ครบ 90 วัน" value={pct(d.signedToCompleted.rate)} good
              hint={`นับที่เซ็นเกิน 90 วัน ${d.signedToCompleted.eligible} · ครบ ${d.signedToCompleted.completed} ใบ`} />
          </div>

          {bottleneck && (
            <div role="note" className="flex items-center gap-3.5 flex-wrap px-4 py-3.5 bg-ink-deep text-white rounded-xl">
              <span className="w-9 h-9 shrink-0 rounded-[10px] bg-[var(--brand-on-ink)]/15 text-[var(--brand-on-ink)] flex items-center justify-center"><Filter className="w-[18px] h-[18px]" /></span>
              <div className="flex-1 min-w-[260px]">
                <div className="text-xs font-bold tracking-wider text-[var(--brand-on-ink)]">คอขวดของช่วงนี้</div>
                <div className="text-[15px] mt-0.5">
                  <b>{bottleneck.prev?.label} → {bottleneck.worst.label}</b> ผ่านแค่ <b className="tabular-nums">{pct(bottleneck.worst.rate)}</b> (ต่ำสุด)
                  {bottleneck.lostAtPrev > 0 && <> และดีลหลุดที่ขั้น{bottleneck.prev?.label} <b className="tabular-nums">{bottleneck.lostAtPrev}</b> ใบ</>}
                  {bottleneck.topReason && <> — เหตุผลหลัก &ldquo;{bottleneck.topReason.label}&rdquo;</>}
                </div>
              </div>
              <Link href={`/partner/quotations?stage=${bottleneck.prev?.stage ?? ""}`}
                className="h-9 px-3.5 flex items-center rounded-lg gold-grad text-[var(--gold-ink)] text-[13px] font-semibold whitespace-nowrap">
                ดูดีลที่{bottleneck.prev?.label} {bottleneck.prev ? bottleneck.prev.active + bottleneck.prev.onHold : 0} ใบ
              </Link>
            </div>
          )}

          {/* ภาพรวมทีละขั้น — แทนการ์ดกราฟแท่ง 4 ใบเดิม */}
          <section aria-labelledby="stage-h" className="bg-surface border border-hairline rounded-xl overflow-hidden">
            <div className="flex items-end justify-between gap-4 flex-wrap px-4 pt-4 pb-3">
              <div>
                <h2 id="stage-h" className="text-base font-semibold">ภาพรวมทีละขั้น</h2>
                <p className="text-xs text-soft mt-0.5">รวม 4 มุมมองเดิม (funnel · ค้าง · เวลาเฉลี่ย · หลุด) ในตารางเดียว อ่านเทียบกันได้ในแถวเดียว</p>
              </div>
              <div className="flex gap-3.5 text-xs text-soft">
                <Legend color="var(--ok-fill)">กำลังเดิน</Legend>
                <Legend color="var(--warn-fill)">พักติดตาม</Legend>
                <Legend color="var(--bad-fill)">อัตราผ่าน &lt; 70%</Legend>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[196px_minmax(0,1.3fr)_104px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-2 bg-surface-2 border-y border-hairline text-xs font-semibold text-soft">
                  <div>ขั้น</div><div>เคยถึงขั้นนี้</div><div className="text-right">ผ่านจากขั้นก่อน</div>
                  <div>ค้างอยู่ตอนนี้</div><div>เวลาเฉลี่ยในขั้น</div><div>หลุดที่ขั้นนี้</div>
                </div>
                {rows.map((r, i) => {
                  const phase = phaseOfStage(r.stage)!
                  const isPhaseHead = phase.stages[0] === r.stage
                  const worst = bottleneck?.worst.stage === r.stage
                  const noDays = r.stage === "DELIVERED" || r.stage === "COMPLETED_90D" || r.samples === 0
                  return (
                    <div key={r.stage}>
                      {isPhaseHead && (
                        <div className="flex items-center gap-2 px-4 pt-2.5 pb-1 text-xs font-bold text-soft">
                          <span className="w-2 h-2 rounded-sm" style={{ background: PHASE_COLOR[phase.no] }} />
                          {phase.no} {phase.label}
                        </div>
                      )}
                      <div className={`grid grid-cols-[196px_minmax(0,1.3fr)_104px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 items-center px-4 py-2 ${
                        worst ? "bg-bad-tint" : ""}`}>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="w-5 text-xs text-soft tabular-nums">{i + 1}</span>{r.label}
                        </div>
                        <Bar value={r.reached} max={max.reached} color={PHASE_COLOR[phase.no]} text={String(r.reached)} w="w-8" />
                        <div className={`text-right text-[13px] tabular-nums ${r.rate < 0.7 ? "text-bad font-bold" : ""}`}>
                          {i === 0 ? "—" : pct(r.rate)}
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 flex h-3.5 rounded bg-track overflow-hidden">
                            <div style={{ width: `${(r.active / max.open) * 100}%`, background: "var(--ok-fill)" }} />
                            <div style={{ width: `${(r.onHold / max.open) * 100}%`, background: "var(--warn-fill)" }} />
                          </div>
                          <span className="w-11 text-right text-[13px] tabular-nums">{r.active}{r.onHold ? ` +${r.onHold}` : ""}</span>
                        </div>
                        {noDays ? (
                          <div className="text-[13px] text-soft">—</div>
                        ) : (
                          <Bar value={r.days ?? 0} max={max.days} color={(r.days ?? 0) > 10 ? "var(--warn-fill)" : "var(--soft)"} text={`${r.days} วัน`} w="w-14" />
                        )}
                        <Bar value={r.lost} max={max.lost} color="var(--soft)" text={String(r.lost)} w="w-7" />
                      </div>
                    </div>
                  )
                })}
                <div className="h-2" />
              </div>
            </div>
          </section>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <section className="bg-surface border border-hairline rounded-xl overflow-hidden">
              <div className="px-4 pt-4 pb-2.5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  ดีลพักติดตามที่เลยวันนัด
                  <span className="px-2 rounded-full bg-bad-tint-2 text-bad-ink text-xs font-bold tabular-nums">{d.followUpOverdue.length}</span>
                </h2>
                <p className="text-xs text-soft mt-0.5">เรียงค้างนานสุดก่อน · กดเลขที่เพื่อเปิดดีล</p>
              </div>
              {d.followUpOverdue.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-soft">ไม่มีดีลที่เลยวันติดตาม</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[124px_minmax(0,1fr)_96px_90px_72px] gap-3 px-4 py-2 bg-surface-2 border-t border-hairline text-xs font-semibold text-soft">
                      <div>เลขที่</div><div>เหตุผลที่พัก</div><div>เซลล์</div><div>นัดไว้</div><div className="text-right">เลยมา</div>
                    </div>
                    {d.followUpOverdue.map((r) => (
                      <div key={r.id} className="grid grid-cols-[124px_minmax(0,1fr)_96px_90px_72px] gap-3 items-center px-4 py-2.5 border-t border-hairline text-[13px]">
                        <Link href={`/partner/quotations/${r.id}`} className="font-mono font-semibold text-brand-ink hover:underline">{r.quotationNo}</Link>
                        <span className="truncate">{r.holdReason || "—"}</span>
                        <span className="text-soft truncate">{r.salesName}</span>
                        <span className="text-soft tabular-nums">{thDate(r.nextFollowUpDate)}</span>
                        <span className={`text-right tabular-nums font-semibold ${r.overdueDays > 14 ? "text-bad" : "text-warn"}`}>
                          {r.overdueDays} วัน
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="bg-surface border border-hairline rounded-xl overflow-hidden">
              <div className="px-4 pt-4 pb-2.5">
                <h2 className="text-base font-semibold">เหตุผลที่ดีลหลุด รายเดือน</h2>
                <p className="text-xs text-soft mt-0.5">สีเข้ม = หลุดมาก · อ่านแนวนอนเพื่อดูว่าเหตุผลไหนเพิ่มขึ้น</p>
              </div>
              {!heat ? (
                <p className="px-4 pb-4 text-sm text-soft">ยังไม่มีดีลที่ปิดไม่สำเร็จในช่วงนี้</p>
              ) : (
                <>
                  <div className="grid gap-1.5 px-4 py-2 bg-surface-2 border-t border-hairline text-xs font-semibold text-soft"
                    style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${heat.months.length}, 64px) 56px` }}>
                    <div>เหตุผล</div>
                    {heat.months.map((m) => <div key={m.month} className="text-center">{monthLabel(m.month)}</div>)}
                    <div className="text-right">รวม</div>
                  </div>
                  {heat.rows.map((r) => (
                    <div key={r.label} className="grid gap-1.5 items-center px-4 py-1.5 border-t border-hairline text-[13px]"
                      style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${heat.months.length}, 64px) 56px` }}>
                      <span className="truncate" title={r.label}>{r.label}</span>
                      {r.cells.map((c, i) => <span key={i} className={`py-1 text-center rounded tabular-nums ${heatClass(c)}`}>{c || ""}</span>)}
                      <span className="text-right font-bold tabular-nums">{r.total}</span>
                    </div>
                  ))}
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

/** ระดับสีของตารางความร้อน — ไล่ตามจำนวนดีลที่หลุดด้วยเหตุผลนั้นในเดือนนั้น */
function heatClass(n: number) {
  if (n === 0) return "bg-[var(--heat-0)] text-soft"
  if (n <= 2) return "bg-[var(--heat-1)] text-[var(--heat-1-ink)]"
  if (n <= 4) return "bg-[var(--heat-2)] text-[var(--heat-2-ink)]"
  if (n <= 6) return "bg-[var(--heat-3)] text-[var(--heat-on)]"
  return "bg-[var(--heat-4)] text-[var(--heat-on)]"
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{children}</span>
}

function Bar({ value, max, color, text, w }: { value: number; max: number; color: string; text: string; w: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-3.5 rounded bg-track overflow-hidden">
        <div className="h-full" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
      </div>
      <span className={`${w} text-right text-[13px] tabular-nums font-medium`}>{text}</span>
    </div>
  )
}

function Kpi({ title, value, hint, good }: { title: string; value: string; hint: string; good?: boolean }) {
  return (
    <div className="p-4 bg-surface border border-hairline rounded-xl">
      <div className="text-[13px] font-semibold text-soft">{title}</div>
      <div className={`text-[30px] leading-none font-bold mt-1.5 tabular-nums ${good ? "text-ok" : ""}`}>{value}</div>
      <div className="text-xs text-soft mt-1 tabular-nums">{hint}</div>
    </div>
  )
}
