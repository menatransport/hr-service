"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, PauseCircle, PlayCircle, XCircle, Upload, Check } from "lucide-react"
import { PHASES, STAGES, STAGE_LABEL, STATUS_LABEL, PHASE_COLOR, type Stage } from "@/lib/partner/deal-stage"

/**
 * ไปป์ไลน์บนหน้าดีล — แยกเป็น 3 ส่วนให้หน้าเว็บจัดวางเองได้
 *   useDealStage()  โหลดสถานะ/กติกาจาก API + สั่งงาน
 *   <DealStepper>   แถบ 10 ขั้น จัดกลุ่ม 5 ด่าน (เต็มความกว้าง)
 *   <DealNextStep>  การ์ด "ขั้นถัดไป" — ข้อมูลที่ยังขาด + ปุ่มขยับ/พัก/ปิดดีล
 * กติกาทั้งหมดถามจาก server เสมอ ฝั่งนี้แค่แสดงและส่งคำสั่ง (server ตรวจซ้ำทุกครั้ง)
 */

export interface StageInfo {
  stage: string
  advance: { ok: boolean; to: Stage | null; missing: string[]; error?: string }
  screening: { key: string; label: string; pass: boolean; auto: boolean; detail?: string }[]
  lossReasons: { _id?: string; code: string; label: string; group: string }[]
  /** ดีลที่ระบบปิดเองเพราะเงียบเกิน 30 วัน — ยังไม่มีเหตุผลจริง */
  needsRealReason?: boolean
}

export interface DealForPanel {
  _id: string
  stage?: string
  stageBeforeHold?: string
  holdReason?: string
  nextFollowUpDate?: string
  lossReasonLabel?: string
  lossNote?: string
  lostAtStage?: string
  screening?: Record<string, unknown>
  quotationSentAt?: string
  viewingDate?: string
  reservationAmount?: number
  depositAmount?: number
  depositSlips?: string[]
  depositSlipUrl?: string
  trainingStartDate?: string
  trainingResult?: string
  contractDate?: string
  deliveryDate?: string
  deliveredAt?: string
  sourceChannel?: string
  experienceLevel?: string
  preferredArea?: string
  motivation?: string
  interestedVehicle?: string
  attachments?: { type: string; url: string; label?: string; uploadedAt?: string }[]
}

const ATTACH_LABEL: Record<string, string> = {
  QUOTATION: "ใบเสนอราคา",
  RESERVATION_SLIP: "หลักฐานการโอนเงินจอง",
  SIGNED_CONTRACT: "สัญญาที่ลงนามแล้ว",
  DELIVERY_PHOTO: "รูปลูกค้าคู่กับรถตอนส่งมอบ",
}
const ATTACH_HELP: Record<string, string> = {
  QUOTATION: "ไฟล์ใบเสนอราคาที่ส่งให้ลูกค้า — รูปหรือ PDF",
  RESERVATION_SLIP: "รูปหรือ PDF · สลิปนี้ไปแสดงในส่วนการเงินด้วย",
  SIGNED_CONTRACT: "สแกนสัญญาที่ลงนามครบทุกฝ่ายแล้ว",
  DELIVERY_PHOTO: "ถ่ายตอนลูกค้ารับรถ ใช้เป็นหลักฐานส่งมอบ",
}

type FieldType = "date" | "number" | "select"
interface StageField { key: string; label: string; type: FieldType; help: string }

/** ข้อมูล + ไฟล์ที่ต้องมีในแต่ละขั้น (ตรงกับกติกาใน lib/deal-stage) */
const STAGE_FORM: Record<string, { fields: StageField[]; attach?: string }> = {
  QUALIFIED: {
    fields: [{ key: "quotationSentAt", label: "วันที่ส่งใบเสนอราคา", type: "date", help: "วันที่ส่งให้ลูกค้าจริง" }],
    attach: "QUOTATION",
  },
  QUOTED: {
    fields: [{ key: "viewingDate", label: "วันนัดดูรถ", type: "date", help: "นัดแล้วระบบจะเตือนในการ์ดนัดถัดไป" }],
  },
  VIEWING_SCHEDULED: {
    fields: [{ key: "reservationAmount", label: "จำนวนเงินจอง (บาท)", type: "number", help: "ใช้ยอดเดียวกับส่วน “การเงิน” ด้านล่าง — กรอกที่เดียว" }],
    attach: "RESERVATION_SLIP",
  },
  RESERVED: {
    fields: [{ key: "trainingStartDate", label: "วันเริ่มฝึกงาน", type: "date", help: "วันที่ลูกค้าเริ่มฝึกกับทีมปฏิบัติการ" }],
  },
  TRAINING: {
    fields: [
      { key: "trainingResult", label: "ผลฝึกงาน", type: "select", help: "ถ้าไม่ผ่าน ให้ปิดดีลพร้อมเหตุผลแทนการขยับขั้น" },
      { key: "contractDate", label: "วันนัดเซ็นสัญญา", type: "date", help: "นัดหลังฝึกผ่านแล้ว" },
    ],
  },
  CONTRACT_SCHEDULED: {
    fields: [{ key: "deliveryDate", label: "วันนัดรับรถ", type: "date", help: "วันที่นัดลูกค้ามารับรถ" }],
    attach: "SIGNED_CONTRACT",
  },
  CONTRACT_SIGNED: {
    fields: [{ key: "deliveredAt", label: "วันที่ส่งมอบจริง", type: "date", help: "นับ 90 วันแรกจากวันนี้" }],
    attach: "DELIVERY_PHOTO",
  },
}

/** ข้อมูลประกอบการขาย เก็บตอนขั้นผู้สนใจ — ไม่บังคับ แต่ใช้วางแผนฝึกงานและดูช่องทางที่มา */
const SOURCE_CHANNELS = ["เพจเฟซบุ๊ก", "TikTok", "เว็บขายรถ", "ลูกค้าเดิมแนะนำ", "พนักงานแนะนำ", "เดินเข้ามาเอง", "อื่น ๆ"]
const EXPERIENCE = [
  { v: "NONE", label: "ไม่เคยขับรถโม่", days: "10–15 วัน" },
  { v: "LT1", label: "ขับโม่มาไม่ถึง 1 ปี", days: "10–15 วัน" },
  { v: "GT1", label: "ขับโม่มามากกว่า 1 ปี", days: "3 วัน" },
]
/** ระยะฝึกที่แนะนำตามประสบการณ์ (คำแนะนำ ไม่ได้บังคับ) */
export const trainingDaysHint = (level?: string) => EXPERIENCE.find((e) => e.v === level)?.days ?? ""

export const hasSlip = (d: DealForPanel) =>
  (d.attachments ?? []).some((a) => a.type === "RESERVATION_SLIP" && a.url)
  || (d.depositSlips ?? []).some(Boolean) || !!d.depositSlipUrl

const fieldValue = (d: DealForPanel, key: string) =>
  key === "reservationAmount" ? (d.reservationAmount ?? d.depositAmount ?? "") : (d as unknown as Record<string, unknown>)[key] ?? ""

const fieldDone = (d: DealForPanel, f: StageField) =>
  f.key === "reservationAmount" ? Number(d.reservationAmount ?? d.depositAmount ?? 0) > 0
  : f.key === "trainingResult" ? d.trainingResult === "PASSED"
  : !!fieldValue(d, f.key)

const attachDone = (d: DealForPanel, type: string) =>
  type === "RESERVATION_SLIP" ? hasSlip(d) : (d.attachments ?? []).some((a) => a.type === type && a.url)

/** ขั้นที่กำลังทำอยู่จริง (ถ้าพักติดตามอยู่ ให้ดูขั้นก่อนพัก) */
export const activeStageOf = (d: DealForPanel) =>
  d.stage === "ON_HOLD" ? String(d.stageBeforeHold ?? "LEAD") : String(d.stage ?? "LEAD")

// ─── hook: สถานะ + คำสั่ง ────────────────────────────────────────────────────

export function useDealStage(id: string, onChanged: () => void) {
  const [info, setInfo] = useState<StageInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  const load = useCallback(() => {
    let alive = true
    fetch(`/api/partner/quotations/${id}/stage`)
      .then((r) => (r.ok ? r.json() : null))
      // โหลดจาก API ตอน mount — setState อยู่ใน callback ของ fetch ไม่ใช่ cascading render
      .then((d) => { if (alive) setInfo(d) })
    return () => { alive = false }
  }, [id])
  useEffect(() => load(), [load])

  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setErr("")
    try {
      const res = await fetch(`/api/partner/quotations/${id}/stage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error ?? "ทำรายการไม่ได้"); return false }
      load(); onChanged()
      return true
    } finally { setBusy(false) }
  }, [id, load, onChanged])

  const attach = useCallback(async (type: string, file: File) => {
    setBusy(true); setErr("")
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "quotations")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) { setErr("อัปโหลดไฟล์ไม่สำเร็จ"); return false }
      const { url } = await res.json()
      return await act({ action: "attach", type, url, label: ATTACH_LABEL[type] })
    } finally { setBusy(false) }
  }, [act])

  return { info, busy, err, setErr, act, attach, reload: load }
}

// ─── stepper 10 ขั้น ─────────────────────────────────────────────────────────

export function DealStepper({ deal }: { deal: DealForPanel }) {
  const active = activeStageOf(deal)
  const cur = STAGES.indexOf(active as Stage)
  const closed = deal.stage === "CLOSED_LOST"
  return (
    <ol aria-label="ขั้นของดีล 10 ขั้น"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 list-none bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5">
      {PHASES.map((p) => {
        const idxs = p.stages.map((s) => STAGES.indexOf(s))
        const here = !closed && idxs.includes(cur)
        const done = idxs[1] < cur
        return (
          <li key={p.no} className="flex flex-col gap-2 min-w-0">
            <div className={`text-xs font-bold pb-1.5 border-b-[3px] ${here || done ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
              style={{ borderColor: here ? "#C9A227" : done ? PHASE_COLOR[4] : "#E6EDF3" }}>
              {p.no} {p.label}
            </div>
            <div className="flex flex-col gap-1.5">
              {p.stages.map((s) => {
                const i = STAGES.indexOf(s)
                const st = closed ? "todo" : i < cur ? "done" : i === cur ? "here" : "todo"
                return (
                  <div key={s} className="flex items-center gap-2 text-[13px] min-w-0">
                    <span className={`w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      st === "done" ? "bg-[#2A6E56] text-white"
                      : st === "here" ? "bg-[#031B14] text-[#E7C86E] ring-[3px] ring-[#E7C86E]"
                      : "bg-white dark:bg-zinc-900 text-zinc-500 border-[1.5px] border-zinc-200 dark:border-zinc-700"}`}>
                      {st === "done" ? "✓" : i + 1}
                    </span>
                    <span className={`truncate ${st === "here" ? "font-bold" : st === "done" ? "" : "text-zinc-500"}`}>{STAGE_LABEL[s]}</span>
                  </div>
                )
              })}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── การ์ด "ขั้นถัดไป" ───────────────────────────────────────────────────────

type Act = (body: Record<string, unknown>) => Promise<boolean>

export function DealNextStep({ deal, info, busy, err, act, attach }: {
  deal: DealForPanel
  info: StageInfo
  busy: boolean
  err: string
  act: Act
  attach: (type: string, file: File) => Promise<boolean>
}) {
  const [dialog, setDialog] = useState<"" | "hold" | "close" | "reason">("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [attachType, setAttachType] = useState("")

  const onHold = deal.stage === "ON_HOLD"
  const closed = deal.stage === "CLOSED_LOST"
  const active = activeStageOf(deal)
  const form = STAGE_FORM[active]
  const isLead = active === "LEAD"

  // รายการที่ต้องมีก่อนขยับขั้น
  //   ขั้นผู้สนใจ = เช็กลิสต์คัดกรอง 7 ข้อ · ขั้นที่มีฟอร์ม = ฟิลด์ + ไฟล์แนบ
  //   ขั้นที่ไม่มีฟอร์ม (เช่น ส่งมอบแล้ว ต้องรอครบ 90 วัน) = เงื่อนไขที่ server บอกว่ายังขาด
  const reqs = isLead
    ? info.screening.map((c) => ({ ok: c.pass }))
    : form
      ? [...form.fields.map((f) => ({ ok: fieldDone(deal, f) })),
         ...(form.attach ? [{ ok: attachDone(deal, form.attach) }] : [])]
      : info.advance.missing.map(() => ({ ok: false }))
  const total = reqs.length
  const done = reqs.filter((r) => r.ok).length
  const canAdvance = info.advance.ok && !onHold && !closed
  const nextLabel = info.advance.to ? STAGE_LABEL[info.advance.to] : ""
  const finished = active === "COMPLETED_90D"

  const input = "h-[38px] w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"

  return (
    <>
      {onHold && (
        <div className="rounded-xl border border-amber-300 bg-[#FFFCEB] dark:bg-amber-950/20 px-4 py-3 text-sm">
          <p className="font-semibold text-[#7A4E00] dark:text-amber-300">พักติดตามอยู่ · ขั้นเดิม {STAGE_LABEL[active as Stage]}</p>
          <p className="text-zinc-600 dark:text-amber-200/80 mt-0.5">{deal.holdReason} · ติดตามอีกที {deal.nextFollowUpDate}</p>
        </div>
      )}
      {closed && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${info.needsRealReason
          ? "border-[#D4A72C] bg-[#FFFCEB] dark:bg-amber-950/20"
          : "border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50"}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold">ปิดดีล – ไม่สำเร็จ ที่ขั้น {STATUS_LABEL[(deal.lostAtStage ?? "LEAD") as Stage]}</p>
              <p className="text-zinc-600 dark:text-zinc-300 mt-0.5">{deal.lossReasonLabel}{deal.lossNote ? ` · ${deal.lossNote}` : ""}</p>
              {info.needsRealReason && (
                <p className="text-[#7A4E00] dark:text-amber-300 mt-1 text-xs">ระบบปิดให้อัตโนมัติ — ระบุเหตุผลจริงเพื่อให้รายงานใช้ได้</p>
              )}
            </div>
            {info.needsRealReason && (
              <button onClick={() => setDialog("reason")} disabled={busy}
                className="h-[38px] shrink-0 inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-[#D4A72C] text-[#7A4E00] dark:text-amber-300 text-[13px] font-semibold bg-white dark:bg-zinc-900">
                ระบุเหตุผลจริง
              </button>
            )}
          </div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>
      )}

      {!closed && (
      <section aria-labelledby="next-h" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-[#031B14] text-white">
          <h2 id="next-h" className="text-[15px] font-semibold">
            {onHold ? `พักติดตามอยู่ · กลับมาต่อที่ขั้น ${STAGE_LABEL[active as Stage]}`
              : info.advance.to ? `ขั้นถัดไป → ${nextLabel} · ต้องมีข้อมูลครบก่อนขยับ`
              : "ขั้นสุดท้ายของไปป์ไลน์"}
          </h2>
          {total > 0 && <span className="text-xs font-semibold text-[#E7C86E] tabular-nums shrink-0">{done}/{total} รายการครบ</span>}
        </div>

        <>
            {isLead ? (
              <div className="px-4 py-3 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="text-xs text-zinc-500">วันเกิด
                    <input type="date" className={input} defaultValue={String(deal.screening?.birthDate ?? "")}
                      onBlur={(e) => act({ action: "fields", fields: { screening: { birthDate: e.target.value } } })} />
                  </label>
                  <label className="text-xs text-zinc-500">วันออกใบขับขี่
                    <input type="date" className={input} defaultValue={String(deal.screening?.licenseIssueDate ?? "")}
                      onBlur={(e) => act({ action: "fields", fields: { screening: { licenseIssueDate: e.target.value } } })} />
                  </label>
                  <label className="text-xs text-zinc-500">ชนิดใบขับขี่
                    <select className={input} defaultValue={String(deal.screening?.licenseType ?? "")}
                      onChange={(e) => act({ action: "fields", fields: { screening: { licenseType: e.target.value } } })}>
                      <option value="">— เลือก —</option>
                      {["ท.1", "ท.2", "ท.3", "ท.4"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {info.screening.map((c) => (
                    <li key={c.key} className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 items-center py-2.5">
                      <ReqIcon ok={c.pass} />
                      <div>
                        <div className="text-sm font-medium">{c.label}</div>
                        {c.detail && <div className="text-xs text-zinc-500">{c.detail}{c.auto ? " · คำนวณจากวันที่" : ""}</div>}
                      </div>
                      {c.auto ? (
                        <span className="text-xs text-zinc-500">อัตโนมัติ</span>
                      ) : (
                        <input type="checkbox" checked={c.pass} disabled={busy} aria-label={c.label}
                          onChange={(e) => act({ action: "fields", fields: { screening: { [c.key]: e.target.checked } } })}
                          className="w-5 h-5" />
                      )}
                    </li>
                  ))}
                </ul>
                <div className="pt-1">
                  <p className="text-xs font-semibold text-zinc-500">ข้อมูลประกอบการขาย (ไม่บังคับ แต่ช่วยวางแผนฝึกงานและดูช่องทางที่มา)</p>
                  <div className="grid sm:grid-cols-2 gap-3 mt-2">
                    <label className="text-xs text-zinc-500">ช่องทางที่มา
                      <select className={input} defaultValue={String(deal.sourceChannel ?? "")} disabled={busy}
                        onChange={(e) => act({ action: "fields", fields: { sourceChannel: e.target.value } })}>
                        <option value="">— เลือก —</option>
                        {SOURCE_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-zinc-500">ประสบการณ์ขับรถโม่
                      <select className={input} defaultValue={String(deal.experienceLevel ?? "")} disabled={busy}
                        onChange={(e) => act({ action: "fields", fields: { experienceLevel: e.target.value } })}>
                        <option value="">— เลือก —</option>
                        {EXPERIENCE.map((e) => <option key={e.v} value={e.v}>{e.label}</option>)}
                      </select>
                      {trainingDaysHint(deal.experienceLevel) && (
                        <span className="block mt-1 text-[11px] text-[#7A4E00] dark:text-amber-300">แนะนำฝึกงาน {trainingDaysHint(deal.experienceLevel)}</span>
                      )}
                    </label>
                    <label className="text-xs text-zinc-500">พื้นที่ที่สนใจทำงาน
                      <input className={input} defaultValue={String(deal.preferredArea ?? "")} disabled={busy} placeholder="เช่น สระบุรี–ลาดกระบัง"
                        onBlur={(e) => act({ action: "fields", fields: { preferredArea: e.target.value } })} />
                    </label>
                    <label className="text-xs text-zinc-500">รถคันที่สนใจ
                      <input className={input} defaultValue={String(deal.interestedVehicle ?? "")} disabled={busy} placeholder="เช่น ISUZU FXZ77NL"
                        onBlur={(e) => act({ action: "fields", fields: { interestedVehicle: e.target.value } })} />
                    </label>
                    <label className="text-xs text-zinc-500 sm:col-span-2">แรงจูงใจ / เหตุผลที่สนใจซื้อรถร่วม
                      <input className={input} defaultValue={String(deal.motivation ?? "")} disabled={busy} placeholder="เช่น อยากมีรถเป็นของตัวเอง มีรายได้ประจำ"
                        onBlur={(e) => act({ action: "fields", fields: { motivation: e.target.value } })} />
                    </label>
                  </div>
                </div>
              </div>
            ) : form ? (
              <ul className="px-4 py-1">
                {form.fields.map((f) => (
                  <li key={f.key} className="grid grid-cols-[28px_minmax(0,1fr)_220px] gap-3 items-center py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                    <ReqIcon ok={fieldDone(deal, f)} />
                    <div>
                      <div className="text-sm font-semibold">{f.label}</div>
                      <div className="text-xs text-zinc-500">
                        {f.help}
                        {f.key === "trainingStartDate" && trainingDaysHint(deal.experienceLevel) &&
                          <span className="text-[#7A4E00] dark:text-amber-300"> · แนะนำฝึก {trainingDaysHint(deal.experienceLevel)} ตามประสบการณ์ที่กรอกไว้</span>}
                      </div>
                    </div>
                    {f.type === "select" ? (
                      <select className={input} defaultValue={String(deal.trainingResult ?? "")} disabled={busy}
                        onChange={async (e) => {
                          const v = e.target.value
                          await act({ action: "fields", fields: { trainingResult: v } })
                          // ฝึกไม่ผ่าน = ดีลไปต่อไม่ได้ เปิดโมดัลปิดดีลให้เลย จะได้ไม่ค้างเป็นทางตัน
                          if (v === "FAILED") setDialog("close")
                        }}>
                        <option value="">— ยังไม่สรุป —</option>
                        <option value="PASSED">ผ่าน</option>
                        <option value="FAILED">ไม่ผ่าน</option>
                      </select>
                    ) : f.type === "number" ? (
                      <label className="flex items-center border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                        <span className="px-2.5 self-stretch flex items-center text-[13px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800">฿</span>
                        <input type="number" aria-label={f.label} defaultValue={String(fieldValue(deal, f.key))} disabled={busy}
                          onBlur={(e) => act({ action: "fields", fields: { [f.key]: Number(e.target.value) || 0 } })}
                          className="w-full h-[38px] px-2.5 text-sm text-right tabular-nums bg-transparent" />
                      </label>
                    ) : (
                      <input type="date" className={input} aria-label={f.label} defaultValue={String(fieldValue(deal, f.key))} disabled={busy}
                        onBlur={(e) => act({ action: "fields", fields: { [f.key]: e.target.value } })} />
                    )}
                  </li>
                ))}
                {form.attach && (
                  <li className="grid grid-cols-[28px_minmax(0,1fr)_220px] gap-3 items-center py-3">
                    <ReqIcon ok={attachDone(deal, form.attach)} />
                    <div>
                      <div className="text-sm font-semibold">{ATTACH_LABEL[form.attach]}</div>
                      <div className="text-xs text-zinc-500">
                        {attachDone(deal, form.attach) ? "แนบแล้ว · " : "ยังไม่แนบ — "}{ATTACH_HELP[form.attach]}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(deal.attachments ?? []).filter((a) => a.type === form.attach).map((a, i) => (
                          <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="text-xs text-[#7A5C14] dark:text-[#E7C86E] underline underline-offset-2">ไฟล์ที่ {i + 1}</a>
                        ))}
                      </div>
                    </div>
                    <button type="button" disabled={busy}
                      onClick={() => { setAttachType(form.attach!); fileRef.current?.click() }}
                      className={`h-[38px] flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold ${
                        attachDone(deal, form.attach)
                          ? "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700"
                          : "bg-[#FFF8C5] dark:bg-amber-950/30 border border-[#D4A72C] text-[#7A4E00] dark:text-amber-300"}`}>
                      <Upload className="w-[15px] h-[15px]" />
                      {attachDone(deal, form.attach) ? "แนบเพิ่ม / เปลี่ยนไฟล์" : `แนบ${ATTACH_LABEL[form.attach]}`}
                    </button>
                  </li>
                )}
              </ul>
            ) : info.advance.missing.length > 0 ? (
              /* ขั้นที่ไม่มีฟอร์มให้กรอก แต่ยังขยับไม่ได้ (เช่น ต้องรอครบ 90 วัน) — บอกให้เห็นว่าติดอะไร */
              <ul className="px-4 py-1">
                {info.advance.missing.map((m) => (
                  <li key={m} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 items-center py-3">
                    <ReqIcon ok={false} /><span className="text-sm">{m}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-zinc-500">
                {info.advance.to ? "ขั้นนี้ไม่ต้องกรอกข้อมูลเพิ่ม — กดขยับได้เลย" : (info.advance.error ?? "ดีลนี้เดินครบทุกขั้นแล้ว")}
              </p>
            )}

            {err && <p className="mx-4 mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{err}</p>}

            <div className="flex items-center gap-2.5 flex-wrap px-4 py-3.5 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800">
              {onHold ? (
                <button onClick={() => act({ action: "resume" })} disabled={busy}
                  className="h-10 inline-flex items-center gap-2 gold-grad text-[#3F3000] text-sm font-semibold px-4 rounded-lg disabled:opacity-50">
                  <PlayCircle className="w-4 h-4" /> กลับมาดำเนินการต่อ
                </button>
              ) : info.advance.to && (
                <>
                  <button onClick={() => act({ action: "advance" })} disabled={busy || !canAdvance}
                    className={`h-10 inline-flex items-center gap-2 text-sm font-semibold px-[18px] rounded-lg ${
                      canAdvance ? "gold-grad text-[#3F3000]" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed"}`}>
                    <ArrowRight className="w-4 h-4" /> ขยับเป็น &ldquo;{nextLabel}&rdquo;
                  </button>
                  <span className={`text-[13px] font-semibold ${canAdvance ? "text-emerald-700 dark:text-emerald-400" : "text-[#9A6700] dark:text-amber-400"}`}>
                    {canAdvance ? "พร้อมขยับ" : `ขาดอีก ${Math.max(total - done, info.advance.missing.length)} รายการ`}
                  </span>
                </>
              )}
              {/* ดีลที่เดินครบ 90 วันแล้วถือว่าจบ — ไม่ควรกดพัก/ปิดว่าไม่สำเร็จได้อีก */}
              {!finished && (
                <div className="ml-auto flex gap-2">
                  {!onHold && (
                    <button onClick={() => setDialog("hold")} disabled={busy}
                      className="h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-[#D4A72C] text-[#7A4E00] dark:text-amber-300 text-[13px] font-semibold bg-white dark:bg-zinc-900">
                      <PauseCircle className="w-[15px] h-[15px]" /> พักติดตาม
                    </button>
                  )}
                  <button onClick={() => setDialog("close")} disabled={busy}
                    className="h-[38px] inline-flex items-center gap-1.5 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-300 text-[13px] font-semibold bg-white dark:bg-zinc-900">
                    <XCircle className="w-[15px] h-[15px]" /> ปิดดีล–ไม่สำเร็จ
                  </button>
                </div>
              )}
            </div>
        </>
      </section>
      )}

      {dialog === "hold" && (
        <HoldDialog busy={busy} onClose={() => setDialog("")}
          onSubmit={async (holdReason, nextFollowUpDate) => { if (await act({ action: "hold", holdReason, nextFollowUpDate })) setDialog("") }} />
      )}
      {dialog === "close" && (
        <CloseDialog busy={busy} reasons={info.lossReasons} onClose={() => setDialog("")}
          onSubmit={async (lossReasonId, lossNote) => { if (await act({ action: "close", lossReasonId, lossNote })) setDialog("") }} />
      )}
      {dialog === "reason" && (
        <CloseDialog busy={busy} reasons={info.lossReasons} title="ระบุเหตุผลจริงที่ดีลหลุด" submitLabel="บันทึกเหตุผล"
          onClose={() => setDialog("")}
          onSubmit={async (lossReasonId, lossNote) => { if (await act({ action: "reason", lossReasonId, lossNote })) setDialog("") }} />
      )}

      <input ref={fileRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && attachType) attach(attachType, f); e.target.value = ""; setAttachType("") }} />
    </>
  )
}

function ReqIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span aria-label="ครบแล้ว" className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
      <Check className="w-3 h-3" strokeWidth={3} />
    </span>
  ) : (
    <span aria-label="ยังขาด" className="w-6 h-6 rounded-full border-2 border-dashed border-[#D4A72C]" />
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  )
}

function HoldDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (reason: string, date: string) => void }) {
  const [reason, setReason] = useState("")
  const [date, setDate] = useState("")
  const input = "h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
  return (
    <Modal title="พักติดตามดีล" onClose={onClose}>
      <label className="text-xs block">เหตุผลที่พัก
        <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลูกค้าขอคิดดูก่อน" />
      </label>
      <label className="text-xs block">วันติดตามครั้งถัดไป
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-sm px-3 py-1.5">ยกเลิก</button>
        <button disabled={busy || !reason.trim() || !date} onClick={() => onSubmit(reason, date)}
          className="bg-amber-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-40">พักติดตาม</button>
      </div>
    </Modal>
  )
}

function CloseDialog({ busy, reasons, onClose, onSubmit, title = "ปิดดีล – ไม่สำเร็จ", submitLabel = "ปิดดีล" }: {
  busy: boolean
  reasons: { _id?: string; code: string; label: string }[]
  onClose: () => void
  onSubmit: (reasonId: string, note: string) => void
  title?: string
  submitLabel?: string
}) {
  const [reasonId, setReasonId] = useState("")
  const [note, setNote] = useState("")
  const input = "h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm"
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-zinc-500">เลือกเหตุผลที่ดีลหลุด (เห็นเฉพาะเหตุผลของขั้นที่ดีลอยู่)</p>
      <select className={input} value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
        <option value="">— เลือกเหตุผล —</option>
        {reasons.map((r) => <option key={r._id ?? r.code} value={String(r._id ?? r.code)}>{r.label}</option>)}
      </select>
      <label className="text-xs block">หมายเหตุเพิ่มเติม (ไม่บังคับ)
        <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="text-sm px-3 py-1.5">ยกเลิก</button>
        <button disabled={busy || !reasonId} onClick={() => onSubmit(reasonId, note)}
          className="bg-zinc-800 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-40">{submitLabel}</button>
      </div>
    </Modal>
  )
}
