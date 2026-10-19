"use client"

import { useEffect, useState } from "react"
import { confirm } from "@/components/partner/ui/confirm"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ActivityHistory } from "@/components/partner/activity-history"
import { ArrowLeft, Warehouse } from "lucide-react"
import { Button } from "@/components/partner/ui/button"
import { Input } from "@/components/partner/ui/input"
import { ThaiDateInput } from "@/components/partner/thai-date-input"
import { Label } from "@/components/partner/ui/label"
import { PromoDetail, RepairClaim, PmRecord } from "@/lib/partner/types"
import { formatMoney, formatDate } from "@/lib/partner/utils"

export default function PromoDetailPage() {
  const { contractCode } = useParams<{ contractCode: string }>()
  const router = useRouter()
  const [data, setData]     = useState<PromoDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // เลข MR ของ claim (ใช้จับคู่รายการเบิกคลัง) — field mr ก่อน fallback description
  const claimMr = (c: RepairClaim) => (c.mr ?? c.description ?? "").trim()

  const currentYear = new Date().getFullYear()
  const [pmYear, setPmYear]   = useState(String(currentYear))
  const [pmType, setPmType]   = useState<"PM1" | "PM2">("PM1")
  const [pmDate, setPmDate]   = useState("")
  const [pmAmt, setPmAmt]     = useState("")
  const [pmNotes, setPmNotes] = useState("")
  const [pmSaving, setPmSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const promoRes = await fetch(`/api/partner/promotions/${contractCode}`)
      if (promoRes.ok) setData(await promoRes.json())
      else setData(null)
    } catch { setData(null) }
    finally { setLoading(false) }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { load() }, [contractCode])

  const handleRepairDelete = async (id: string) => {
    if (!await confirm("ลบรายการนี้?")) return
    const r = await fetch(`/api/partner/promotions/repair/${id}`, { method: "DELETE" })
    if (r.ok) await load()
  }

  // กติกา: ทีมต้องระบุ (ยืนยัน) ก่อน งบโปรฯ ถึงถูกตัด — ยืนยันแล้วถาวร ยกเลิกไม่ได้
  const handleConfirmRepair = async (id: string) => {
    if (!await confirm("เปลี่ยนเป็น actual — ตัดงบโปรโมชั่นสำหรับรายการนี้?\n\n⚠ ตัดงบแล้วถาวร — ยกเลิกไม่ได้")) return
    const r = await fetch(`/api/partner/promotions/repair/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    })
    if (r.ok) await load()
  }

  const handlePmSave = async () => {
    if (!pmDate || !pmAmt) return
    setPmSaving(true)
    try {
      const r = await fetch("/api/partner/promotions/pm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractCode, year: Number(pmYear), type: pmType, date: pmDate, amount: Number(pmAmt), notes: pmNotes }),
      })
      if (r.ok) { setPmDate(""); setPmAmt(""); setPmNotes(""); await load() }
    } catch {} finally { setPmSaving(false) }
  }

  const handlePmDelete = async (id: string) => {
    if (!await confirm("ลบรายการนี้?")) return
    const r = await fetch(`/api/partner/promotions/pm/${id}`, { method: "DELETE" })
    if (r.ok) await load()
  }

  const handleConfirmPm = async (id: string) => {
    if (!await confirm("ยืนยันตัดเพดาน PM สำหรับรายการนี้?\n\n⚠ ตัดงบแล้วถาวร — ยกเลิกไม่ได้")) return
    const r = await fetch(`/api/partner/promotions/pm/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    })
    if (r.ok) await load()
  }

  if (loading) return <div className="text-zinc-400 text-sm py-8">กำลังโหลด...</div>
  if (!data)   return <div className="text-zinc-400 text-sm py-8">ไม่พบข้อมูล</div>

  const repairPct = data.repairBudget > 0 ? Math.min(100, (data.repairUsed / data.repairBudget) * 100) : 0
  const pmPct     = data.annualPmCap > 0  ? Math.min(100, (data.pmUsedThisYear / data.annualPmCap) * 100) : 0
  const repairBarColor = repairPct >= 90 ? "bg-red-500" : repairPct >= 60 ? "bg-amber-500" : "bg-emerald-500"
  // ยอดจองงบ (reserve) — ยังไม่ตัดจริง แต่กันวงเงินไว้ก่อน
  const reserveTotal = data.repairClaims
    .filter((c) => c.reserve && !c.confirmed && !data.dedupedMrs?.includes(claimMr(c)))
    .reduce((s, c) => s + (c.amount ?? 0), 0)
  const pmBarColor     = pmPct >= 90     ? "bg-red-500" : pmPct >= 60     ? "bg-amber-500" : "bg-blue-500"
  // ส่วนที่ใช้เกินวงเงิน/เพดาน (ถ้ามี) — ไม่บล็อก แต่เตือนชัดเจน
  const repairOver = data.repairBudget > 0 && data.repairRemaining < 0 ? -data.repairRemaining : 0
  const pmOver     = data.annualPmCap  > 0 && data.pmRemainingThisYear < 0 ? -data.pmRemainingThisYear : 0

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => router.back()} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 mb-3">
          <ArrowLeft className="w-3 h-3" /> กลับ
        </button>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">
              {data.driverName || data.contractCode}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {data.contractCode} · {data.licensePlate} · {data.truckNumber}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ActivityHistory
              entity="promotion"
              entityId={data.contractCode}
              label="ประวัติตัดงบ"
              actionLabels={{ confirm_repair: "ยืนยันตัดงบซ่อม", confirm_pm: "ยืนยันตัดเพดาน PM" }}
            />
            <Link
              href="/partner/vehicle-cost?tab=merged"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 dark:border-emerald-900 rounded-lg px-3 py-1.5"
            >
              <Warehouse className="w-3.5 h-3.5" /> จัดการหักโปรฯ จากรายการเบิก (ค่าใช้จ่ายรถ)
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Promo 2: Repair Budget ─── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          โปร 2 — วงเงินค่าซ่อมตลอดสัญญา
        </h2>

        {/* Budget bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-zinc-600">
            <span>
              ใช้ไป <span className="font-semibold text-red-500">{formatMoney(data.repairUsed)}</span>
              {reserveTotal > 0 && <> · จองไว้ <span className="font-semibold text-blue-600">{formatMoney(reserveTotal)}</span></>}
            </span>
            <span>วงเงิน {formatMoney(data.repairBudget)}</span>
          </div>
          <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden flex">
            <div className={`h-full transition-all ${repairBarColor}`} style={{ width: `${repairPct}%` }} />
            {reserveTotal > 0 && data.repairBudget > 0 && (
              <div className="h-full bg-blue-300 dark:bg-blue-500/50 transition-all" title="จองงบ (reserve)"
                style={{ width: `${Math.min(100 - repairPct, (reserveTotal / data.repairBudget) * 100)}%` }} />
            )}
          </div>
          <p className="text-sm text-right text-zinc-500">
            คงเหลือ <span className={`font-semibold ${data.repairRemaining < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"}`}>{formatMoney(data.repairRemaining)}</span>
            {reserveTotal > 0 && <> · หลังกันจอง <span className={`font-semibold ${(data.repairRemaining - reserveTotal) < 0 ? "text-red-600 dark:text-red-400" : "text-blue-600"}`}>{formatMoney(data.repairRemaining - reserveTotal)}</span></>}
          </p>
          {repairOver > 0 && (
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
              ⚠️ ใช้เกินวงเงินซ่อม {formatMoney(repairOver)} บาท — ส่วนเกินนี้เกินสิทธิ์ฟรีของโปรฯ ควรเรียกเก็บจากคนขับ (เช่น ทำใบรับสภาพหนี้ / รายการหนี้ใน driver-ledger)
            </p>
          )}
          {(() => {
            const uncovered = data.repairClaims.filter(
              (c) => !c.confirmed && !data.dedupedMrs?.includes(claimMr(c))
            )
            const reserves = uncovered.filter((c) => c.reserve)
            const pending  = uncovered.filter((c) => !c.reserve)
            const sum = (arr: typeof uncovered) => arr.reduce((s, c) => s + (c.amount ?? 0), 0)
            return (
              <>
                {reserves.length > 0 && (
                  <p className="text-xs text-blue-700 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                    🔖 จองงบ (reserve) {reserves.length} รายการ รวม {formatMoney(sum(reserves))} บาท —
                    <b> ยังไม่ตัดจากวงเงินจริง</b> กด “เปลี่ยนเป็น actual” เมื่อยืนยันจากใบ MR (หรือลบทิ้งได้)
                  </p>
                )}
                {pending.length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    ⚠ ประวัติค่าซ่อมรอทีมยืนยัน {pending.length} รายการ รวม {formatMoney(sum(pending))} บาท —
                    <b> ยังไม่ถูกหักจากวงเงิน</b> จนกว่าจะกด “ยืนยันตัดงบ” หรือติ๊กหักจากรายการเบิกในหน้า ค่าใช้จ่ายรถ
                  </p>
                )}
              </>
            )
          })()}
        </div>

        {/* Repair history — คอลัมน์กระชับ: MR+วันที่ / รายละเอียด+สถานะ / ยอด / actions */}
        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="px-2.5 py-2 text-left">MR / วันที่</th>
                <th className="px-2.5 py-2 text-left">รายละเอียด / สถานะ</th>
                <th className="px-2.5 py-2 text-right">ยอด</th>
                <th className="px-2.5 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {data.repairClaims.length === 0 && (data.stockRepairs ?? []).length === 0 ? (
                <tr><td colSpan={4} className="px-2.5 py-4 text-center text-zinc-400 text-xs">ยังไม่มีรายการซ่อม</td></tr>
              ) : (
                <>
                  {data.repairClaims.map((c: RepairClaim) => {
                    const coveredByStock = !!claimMr(c) && data.dedupedMrs?.includes(claimMr(c))
                    const counted = coveredByStock || c.confirmed === true
                    return (
                      <tr key={c._id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${!counted ? "opacity-80" : ""}`}>
                        {/* MR / วันที่ */}
                        <td className="px-2.5 py-2 align-top whitespace-nowrap">
                          {claimMr(c) ? (
                            <Link
                              href={`/partner/vehicle-cost?tab=merged&q=${encodeURIComponent(claimMr(c))}`}
                              title="ดูรายละเอียด ใบรับสภาพหนี้ + รายการเบิก (WD) ของ MR นี้"
                              className="font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-950/60"
                            >
                              MR {claimMr(c)} →
                            </Link>
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                          <div className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">{c.date || "—"}</div>
                        </td>
                        {/* รายละเอียด / สถานะ */}
                        <td className="px-2.5 py-2 align-top">
                          {/* แสดง description เฉพาะเมื่อไม่ซ้ำกับ MR (ประวัติเก่าเก็บ MR ไว้ใน description) */}
                          {c.description && c.description.trim() !== claimMr(c) && (
                            <div className="truncate max-w-[240px]" title={c.description}>{c.description}</div>
                          )}
                          <div className="mt-0.5">
                          {coveredByStock ? (
                            <span
                              title="ทีมติ๊กหักโปรฯ จากรายการเบิกคลังแล้ว — ตัดงบจากคลัง (นับครั้งเดียว)"
                              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5"
                            >
                              <Warehouse className="w-2.5 h-2.5" /> ตัดงบจากคลังแล้ว
                            </span>
                          ) : c.confirmed ? (
                            <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5">
                              ✓ ยืนยันตัดงบแล้ว · ยกเลิกไม่ได้
                            </span>
                          ) : c.reserve ? (
                            <span
                              title="จองงบ (reserve) — บันทึกด้วยมืออิงจากใบ MR ยังไม่ตัดงบจริง"
                              className="inline-block text-[10px] font-semibold text-blue-700 bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800 rounded px-1.5 py-0.5"
                            >
                              จองงบ (reserve) — ยังไม่ตัดจริง
                            </span>
                          ) : (
                            <span
                              title="ประวัติค่าซ่อม — ยังไม่ตัดงบโปรฯ จนกว่าทีมจะยืนยัน"
                              className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5"
                            >
                              รอยืนยัน — ยังไม่ตัดงบ
                            </span>
                          )}
                          </div>
                        </td>
                        <td className={`px-2.5 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap ${!counted ? "text-zinc-400" : ""}`}>{formatMoney(c.amount)}</td>
                        <td className="px-2.5 py-2 text-right align-top whitespace-nowrap">
                          {!coveredByStock && !c.confirmed && (
                            <button onClick={() => handleConfirmRepair(c._id!)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 mr-2">
                              {c.reserve ? "เปลี่ยนเป็น actual" : "ยืนยันตัดงบ"}
                            </button>
                          )}
                          {/* ยืนยันแล้ว = ถาวร ลบไม่ได้ (กันตัดงบแล้วหาย) — reserve/รอยืนยัน ลบได้ */}
                          {!c.confirmed && (
                            <button onClick={() => handleRepairDelete(c._id!)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {/* จากหน้า ค่าใช้จ่ายรถ (ติ๊กหักโปรฯ บนรายการเบิกคลัง) — จัดการที่หน้านั้น */}
                  {(data.stockRepairs ?? []).map((s) => (
                    <tr key={`stock-${s.mr}-${s.date}`} className="bg-emerald-50/40 dark:bg-emerald-950/10">
                      {/* MR / วันที่ */}
                      <td className="px-2.5 py-2 align-top whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <Warehouse className="w-2.5 h-2.5 text-emerald-600" />
                          {s.mr || "เบิกคลัง"}
                        </span>
                        <div className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">{s.date || "—"}</div>
                      </td>
                      {/* รายละเอียด / สถานะ */}
                      <td className="px-2.5 py-2 align-top">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5">
                          <Warehouse className="w-2.5 h-2.5" /> รายการเบิกคลัง
                          {s.itemCount ? <span className="text-zinc-400 font-normal">({s.itemCount} รายการ)</span> : null}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap">{formatMoney(s.amount)}</td>
                      <td className="px-2.5 py-2 text-right align-top">
                        <Link href="/partner/vehicle-cost?tab=merged" className="text-[10px] text-emerald-600 hover:underline whitespace-nowrap">จัดการ →</Link>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* ─── Promo 3: PM ─── */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            โปร 3 — PM เชิงป้องกัน (รีเซ็ตทุก 1 ม.ค.)
          </h2>
          <div className="flex gap-2">
            {(["PM1","PM2"] as const).map((t) => {
              const used = t === "PM1" ? data.pm1UsedThisYear : data.pm2UsedThisYear
              return (
                <span key={t} className={`text-xs px-3 py-1 rounded-full font-medium ${used ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"}`}>
                  {t}: {used ? "ใช้แล้ว" : "ยังไม่ได้ใช้"}
                </span>
              )
            })}
          </div>
        </div>

        {/* PM budget bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-zinc-600">
            <span>ใช้รอบนี้ <span className="font-semibold text-blue-500">{formatMoney(data.pmUsedThisYear)}</span></span>
            <span>เพดาน {formatMoney(data.annualPmCap)}</span>
          </div>
          <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pmBarColor}`} style={{ width: `${pmPct}%` }} />
          </div>
          <p className="text-sm text-right text-zinc-500">
            คงเหลือรอบนี้ <span className={`font-semibold ${data.pmRemainingThisYear < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"}`}>{formatMoney(data.pmRemainingThisYear)}</span>
          </p>
          {data.pmWindowFrom && data.pmWindowTo && (
            <p className="text-[11px] text-zinc-400 text-right">
              รอบปีสัญญา {formatDate(data.pmWindowFrom)} – {formatDate(data.pmWindowTo)} (นับจากวันเริ่มสัญญา)
            </p>
          )}
          {pmOver > 0 && (
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg px-3 py-2">
              ⚠️ ใช้ PM เกินเพดานรอบนี้ {formatMoney(pmOver)} บาท — ส่วนเกินเกินสิทธิ์ฟรี ควรเรียกเก็บจากคนขับ
            </p>
          )}
          {(() => {
            const inRound = (d?: string, y?: number) => data.pmWindowFrom && data.pmWindowTo
              ? !!d && d.slice(0, 10) >= data.pmWindowFrom && d.slice(0, 10) <= data.pmWindowTo
              : y === currentYear
            const pending = data.pmRecords.filter((p) => inRound(p.date, p.year) && p.confirmed !== true)
            const pendingTotal = pending.reduce((s, p) => s + (p.amount ?? 0), 0)
            return pending.length > 0 ? (
              <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                ⚠ บันทึก PM รอทีมยืนยัน {pending.length} รายการ รวม {formatMoney(pendingTotal)} บาท —
                <b> ยังไม่ถูกหักจากเพดาน</b> จนกว่าจะกด “ยืนยันตัดงบ” หรือติ๊กหักจากรายการเบิกในหน้า ค่าใช้จ่ายรถ
              </p>
            ) : null
          })()}
        </div>

        {/* PM history — คอลัมน์กระชับ: ประเภท+สถานะ / วันที่+ปี / ยอด / หมายเหตุ / actions */}
        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="px-2.5 py-2 text-left">ประเภท / สถานะ</th>
                <th className="px-2.5 py-2 text-left">วันที่ / ปี</th>
                <th className="px-2.5 py-2 text-right">ยอด</th>
                <th className="px-2.5 py-2 text-left">หมายเหตุ</th>
                <th className="px-2.5 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(data.stockPm ?? []).map((s) => (
                <tr key={`stockpm-${s.mr}-${s.date}`} className="bg-blue-50/40 dark:bg-blue-950/10">
                  {/* ประเภท / สถานะ */}
                  <td className="px-2.5 py-2 align-top">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                      <Warehouse className="w-3 h-3" /> คลัง{s.pmType ? ` · ${s.pmType}` : ""}
                    </span>
                  </td>
                  {/* วันที่ / ปี */}
                  <td className="px-2.5 py-2 align-top whitespace-nowrap">
                    <div className="tabular-nums text-zinc-500">{s.date || "—"}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      ปี {(s.date ?? "").slice(0, 4)}
                      {data.pmWindowFrom && (s.date ?? "").slice(0, 10) < data.pmWindowFrom && (
                        <span className="ml-1" title="รายการรอบก่อน — ไม่นับในเพดานรอบปัจจุบัน">(รอบก่อน)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2.5 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap">{formatMoney(s.amount)}</td>
                  <td className="px-2.5 py-2 align-top text-zinc-400 text-[11px]">
                    <div className="truncate max-w-[160px]" title={`${s.mr ?? ""}${s.itemCount ? ` (${s.itemCount} รายการ)` : ""}`}>{s.mr}{s.itemCount ? ` (${s.itemCount} รายการ)` : ""}</div>
                    <Link href="/partner/vehicle-cost?tab=merged" className="text-[10px] text-blue-600 hover:underline whitespace-nowrap">จัดการ →</Link>
                  </td>
                  <td className="px-2.5 py-2 w-8" />
                </tr>
              ))}
              {data.pmRecords.length === 0 && (data.stockPm ?? []).length === 0 ? (
                <tr><td colSpan={5} className="px-2.5 py-4 text-center text-zinc-400 text-xs">ยังไม่มีบันทึก PM</td></tr>
              ) : data.pmRecords.map((p: PmRecord) => {
                const counted = p.confirmed === true
                return (
                  <tr key={p._id} className={`hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${!counted ? "opacity-80" : ""}`}>
                    {/* ประเภท / สถานะ */}
                    <td className="px-2.5 py-2 align-top">
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${p.type === "PM1" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {p.type}
                      </span>
                      <div className="mt-0.5">
                      {counted ? (
                        <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded px-1.5 py-0.5">
                          ✓ ยืนยันแล้ว · ยกเลิกไม่ได้
                        </span>
                      ) : (
                        <span className="inline-block text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5">
                          รอยืนยัน — ยังไม่ตัดเพดาน
                        </span>
                      )}
                      </div>
                    </td>
                    {/* วันที่ / ปี */}
                    <td className="px-2.5 py-2 align-top whitespace-nowrap">
                      <div className="tabular-nums text-zinc-500">{p.date || "—"}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">ปี {p.year}</div>
                    </td>
                    <td className={`px-2.5 py-2 text-right align-top font-medium tabular-nums whitespace-nowrap ${!counted ? "text-zinc-400" : ""}`}>{formatMoney(p.amount)}</td>
                    <td className="px-2.5 py-2 align-top text-zinc-400 text-[11px]">
                      <div className="truncate max-w-[160px]" title={p.notes ?? ""}>{p.notes}</div>
                    </td>
                    <td className="px-2.5 py-2 text-right align-top whitespace-nowrap">
                      {!counted && (
                        <>
                          <button onClick={() => handleConfirmPm(p._id!)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 mr-2">ยืนยันตัดงบ</button>
                          <button onClick={() => handlePmDelete(p._id!)} className="text-xs text-red-400 hover:text-red-600">ลบ</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Add PM form */}
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">บันทึก PM (บันทึกโดยทีม = ยืนยันตัดเพดานทันที)</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">ปี (ค.ศ.)</Label>
              <Input type="number" value={pmYear} onChange={(e) => setPmYear(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ประเภท</Label>
              <select
                value={pmType}
                onChange={(e) => setPmType(e.target.value as "PM1" | "PM2")}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="PM1">PM1</option>
                <option value="PM2">PM2</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">วันที่ทำ PM</Label>
              <ThaiDateInput value={pmDate} onChange={(iso) => setPmDate(iso)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ยอด (บาท)</Label>
              <Input type="number" min="0" step="0.01" placeholder="0" value={pmAmt} onChange={(e) => setPmAmt(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">หมายเหตุ</Label>
              <Input placeholder="หมายเหตุ (ถ้ามี)" value={pmNotes} onChange={(e) => setPmNotes(e.target.value)} />
            </div>
          </div>
          <Button
            onClick={handlePmSave}
            disabled={pmSaving || !pmDate || !pmAmt}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {pmSaving ? "กำลังบันทึก..." : "บันทึก PM"}
          </Button>
        </div>
      </div>
    </div>
  )
}
