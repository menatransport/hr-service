"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { prompt } from "@/components/partner/ui/confirm"
import { Breadcrumb } from "@/components/partner/breadcrumb"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText, Upload, CheckCircle2, Search, Pencil, Copy, Phone, CalendarDays, X } from "lucide-react"
import { formatMoney } from "@/lib/partner/utils"
import { SalesPersonSelect } from "@/components/partner/sales-person-select"
import { COMPANY_BANK } from "@/lib/partner/company-bank"
import { DealStepper, DealNextStep, useDealStage, activeStageOf, type DealForPanel } from "@/components/partner/deal-pipeline-panel"
import { STAGE_LABEL, STATUS_LABEL, PHASES, type Stage } from "@/lib/partner/deal-stage"
import { BADGE_CLASS, DOT_COLOR, badgeKind, daysIn, PHASE_BUCKETS } from "@/lib/partner/deal-list"

type Status = "lead" | "quoted" | "booked" | "won" | "lost"
interface Quote {
  _id: string; quotationNo: string; status: Status
  stage?: string; stageEnteredAt?: string; stageBeforeHold?: string; holdReason?: string; nextFollowUpDate?: string
  lossReasonLabel?: string; lossNote?: string; lostAtStage?: string
  screening?: Record<string, unknown>; attachments?: { type: string; url: string; label?: string }[]
  quotationSentAt?: string; viewingDate?: string; reservationAmount?: number
  trainingStartDate?: string; trainingResult?: string; contractDate?: string; deliveryDate?: string; deliveredAt?: string
  customerName: string; customerPhone?: string
  licensePlate: string; vehicleBrand?: string; vehicleModel?: string; truckNumber?: string; vehiclePhotoUrl?: string
  vehiclePhotos?: { front?: string; back?: string; left?: string; right?: string; cabin?: string }
  totalSalePrice: number; downPayment: number; cashDown: number; savingsUsed?: number
  downInstallmentCount: number; downInstallmentAmt: number
  financeAmount: number; financeInstallments: number; monthlyPayment: number
  extras?: string; note?: string; validUntil?: string
  depositAmount?: number; depositSlipUrl?: string; depositSlips?: string[]; depositPaidAt?: string
  salesName: string; salesEmail: string; createdAt: string
  timeline?: { at: string; by: string; action: string; note?: string }[]
}

interface PriceRow {
  licensePlate: string; status: string
  vehicleBrand?: string; vehicleModel?: string; truckNumber?: string; photoUrl?: string
  photos?: { front?: string; back?: string; left?: string; right?: string; cabin?: string }
  totalSalePrice: number; downPayment: number; cashDown: number
  downInstallmentCount: number; financeAmount: number; financeInstallments: number; monthlyPayment: number
}

const PHOTO_SLOTS: { key: string; label: string; short?: string }[] = [
  { key: "front", label: "หน้า" },
  { key: "back", label: "หลัง" },
  { key: "left", label: "ซ้าย" },
  { key: "right", label: "ขวา" },
  { key: "cabin", label: "ห้องผู้โดยสาร", short: "ห้องโดยสาร" },
]

/** นัดถัดไปของแต่ละขั้น — ใช้ฟิลด์วันที่ของขั้นนั้นเป็นตัวตั้ง */
const APPOINTMENT: Record<string, { key: keyof Quote; label: string }> = {
  QUOTED: { key: "viewingDate", label: "นัดดูรถ" },
  VIEWING_SCHEDULED: { key: "viewingDate", label: "นัดดูรถ" },
  RESERVED: { key: "trainingStartDate", label: "วันเริ่มฝึกงาน" },
  TRAINING: { key: "contractDate", label: "นัดเซ็นสัญญา" },
  CONTRACT_SCHEDULED: { key: "deliveryDate", label: "นัดรับรถ" },
  CONTRACT_SIGNED: { key: "deliveryDate", label: "นัดรับรถ" },
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const dayDiff = (d?: string) => d ? Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${todayStr()}T00:00:00`).getTime()) / 86400000) : null
const relLabel = (n: number) => n === 0 ? "วันนี้" : n === 1 ? "พรุ่งนี้" : n > 0 ? `อีก ${n} วัน` : `เลยมา ${-n} วัน`
const thDate = (d?: string) => d ? new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : ""
const dotOf = (action: string) =>
  action.includes("ขยับ") ? "#2A6E56" : action.includes("แนบไฟล์") || action.includes("เงินจอง") ? "#C9A227"
  : action.includes("พัก") || action.includes("ปิดดีล") ? "#D4A72C" : "#8C959F"

export default function DealPage() {
  const { id } = useParams<{ id: string }>()
  const [q, setQ] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [depAmt, setDepAmt] = useState("")
  const [savAmt, setSavAmt] = useState("")   // เงินสะสม พจส. (บันทึกไว้เฉย ๆ ไม่หักยอด)
  const [savedAt, setSavedAt] = useState(0)  // เวลาที่ auto-save สำเร็จ — ใช้โชว์ "บันทึกแล้ว"
  const [noteText, setNoteText] = useState("")
  const [copiedBank, setCopiedBank] = useState(false)
  const [reschedule, setReschedule] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoSlot, setPhotoSlot] = useState<string>("")
  // ── editor รถ/ราคา/โปรฯ (ใช้ตอน lead เลือกรถ + ทำใบเสนอ / อัพเดทโปรฯ) ──
  const [editing, setEditing] = useState(false)
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [plateQ, setPlateQ] = useState("")
  const [plateOpen, setPlateOpen] = useState(false)
  const [ePlate, setEPlate] = useState("")
  const [eSnap, setESnap] = useState<Record<string, number>>({})
  const [eCash, setECash] = useState(0)
  const [eSales, setESales] = useState("")
  const [eExtras, setEExtras] = useState("")
  const [ePromoNote, setEPromoNote] = useState("")

  const load = useCallback(() => {
    fetch(`/api/partner/quotations/${id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d?._id) { setQ(d); setDepAmt(d.depositAmount ? String(d.depositAmount) : ""); setSavAmt(d.savingsUsed ? String(d.savingsUsed) : "") } })
  }, [id])
  useEffect(load, [load])
  useEffect(() => { fetch("/api/partner/price-list").then((r) => r.ok ? r.json() : []).then(setPrices) }, [])

  // กติกา/สถานะขั้น — server เป็นเจ้าของความจริง
  const stageApi = useDealStage(id, load)

  // คัดลอกบัญชีรับโอนเป็นข้อความ — เซลส์ส่งต่อให้ลูกค้าทางแชทได้เลย
  const copyBank = async () => {
    const text = `${COMPANY_BANK.bank}\nชื่อบัญชี ${COMPANY_BANK.accountName}\nเลขบัญชี ${COMPANY_BANK.accountNo}\nประเภทบัญชี ${COMPANY_BANK.accountType}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedBank(true)
      setTimeout(() => setCopiedBank(false), 1800)
    } catch { setErr("คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง") }
  }

  function openEditor() {
    if (q) { setEPlate(q.licensePlate ?? ""); setPlateQ(q.licensePlate ?? ""); setEExtras(q.extras ?? "")
      setESnap({ totalSalePrice: q.totalSalePrice, downPayment: q.downPayment, downInstallmentCount: q.downInstallmentCount,
        financeAmount: q.financeAmount, financeInstallments: q.financeInstallments, monthlyPayment: q.monthlyPayment })
      setECash(q.cashDown ?? 0); setESales(q.salesName ?? "") }
    setEditing(true)
  }
  // เลือกรถใน editor → เติม snapshot + โปรฯ
  useEffect(() => {
    if (!editing || !ePlate) return
    const row = prices.find((p) => p.licensePlate === ePlate)
    if (row) { setESnap({ totalSalePrice: row.totalSalePrice, downPayment: row.downPayment, downInstallmentCount: row.downInstallmentCount,
        financeAmount: row.financeAmount, financeInstallments: row.financeInstallments, monthlyPayment: row.monthlyPayment }); setECash(row.cashDown) }
    fetch(`/api/partner/promotions/master?plate=${encodeURIComponent(ePlate)}`).then((r) => r.ok ? r.json() : null).then((d) => {
      setEPromoNote(d?.found ? "ดึงจากโปรโมชั่นของรถคันนี้" : "รถคันนี้ยังไม่ตั้งโปรฯ")
      if (d?.summary) setEExtras(d.summary)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ePlate, editing])

  async function patch(body: Record<string, unknown>, ok?: string) {
    setBusy(true); setErr("")
    try {
      const r = await fetch(`/api/partner/quotations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? "ทำรายการไม่สำเร็จ"); return }
      setQ(d); if (ok) setNoteText("")
    } finally { setBusy(false) }
  }

  /** auto-save เงินจอง/เงินสะสม ตอนคลิกออกจากช่อง — ส่งเฉพาะฟิลด์ที่ค่าเปลี่ยนจริง
   *  (depositAmount ที่ส่งทุกครั้งจะไปสร้าง event "บันทึกเงินจอง" ใน timeline ทุกรอบ) */
  async function saveDeposit() {
    if (!q || busy) return
    const dep = Number(depAmt) || 0
    const sav = Number(savAmt) || 0
    const depChanged = dep !== (q.depositAmount ?? 0)
    const savChanged = sav !== (q.savingsUsed ?? 0)
    if (!depChanged && !savChanged) return
    await patch({
      ...(depChanged ? { depositAmount: dep, depositPaidAt: todayStr() } : {}),
      ...(savChanged ? { savingsUsed: sav } : {}),
      ...(depChanged && dep > 0 && (q.status === "lead" || q.status === "quoted") ? { status: "booked" } : {}),
    })
    setSavedAt(Date.now())
  }

  // แก้ชื่อลูกค้า (กรณีสะกดผิด) — PDF ดึงจาก DB ทุกครั้ง ชื่อใหม่จึงไปโผล่ในใบเสนอเอง
  async function editCustomerName() {
    if (!q) return
    const name = await prompt({ title: "แก้ไขชื่อลูกค้า", description: "ใช้กรณีสะกดชื่อผิด — ชื่อใหม่จะแสดงในใบเสนอ PDF ทันที", defaultValue: q.customerName, placeholder: "ชื่อลูกค้า" })
    if (name === null) return
    const trimmed = name.trim()
    if (!trimmed || trimmed === q.customerName) return
    await patch({ customerName: trimmed })
  }

  function allSlips(): string[] {
    const arr = [...(q?.depositSlips ?? [])]
    if (q?.depositSlipUrl && !arr.includes(q.depositSlipUrl)) arr.unshift(q.depositSlipUrl)
    return arr
  }
  async function uploadSlip(file: File) {
    const cur = allSlips()
    if (cur.length >= 10) { setErr("แนบสลิปได้สูงสุด 10 ใบ"); return }
    setBusy(true); setErr("")
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "quotations")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) { setErr("อัปโหลดสลิปไม่สำเร็จ"); return }
      const { url } = await res.json()
      await patch({ depositSlips: [...cur, url] })
    } finally { setBusy(false) }
  }
  async function removeSlip(url: string) {
    await patch({ depositSlips: allSlips().filter((u) => u !== url), ...(q?.depositSlipUrl === url ? { depositSlipUrl: "" } : {}) })
  }

  // รูปรถ 5 มุม — legacy vehiclePhotoUrl แสดงเป็นมุม "หน้า"
  function photoOf(slot: string): string {
    const p = q?.vehiclePhotos as Record<string, string> | undefined
    return (p?.[slot]) || (slot === "front" ? (q?.vehiclePhotoUrl ?? "") : "")
  }
  function pickPhoto(slot: string) { setPhotoSlot(slot); photoRef.current?.click() }
  async function uploadPhoto(file: File) {
    if (!photoSlot) return
    setBusy(true); setErr("")
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "quotations")
      const res = await fetch("/api/partner/upload", { method: "POST", body: fd })
      if (!res.ok) { setErr("อัปโหลดรูปไม่สำเร็จ"); return }
      const { url } = await res.json()
      await patch({ vehiclePhotos: { ...(q?.vehiclePhotos ?? {}), [photoSlot]: url } })
    } finally { setBusy(false); setPhotoSlot("") }
  }
  async function removePhoto(slot: string) {
    await patch({ vehiclePhotos: { ...(q?.vehiclePhotos ?? {}), [slot]: "" }, ...(slot === "front" && q?.vehiclePhotoUrl ? { vehiclePhotoUrl: "" } : {}) })
  }

  const eSel = prices.find((p) => p.licensePlate === ePlate)
  const eRemain = Math.max(0, (eSnap.downPayment ?? 0) - eCash)
  const ePerInst = eSnap.downInstallmentCount ? Math.round(eRemain / eSnap.downInstallmentCount) : 0
  // เลือกได้ทุกคัน — ค้นได้ทั้งทะเบียนและเบอร์รถ
  const ePlateQuery = plateQ.replace(/[\s.\-]/g, "").toLowerCase()
  const ePlateMatches = prices.filter((p) =>
    `${p.licensePlate}${p.truckNumber ?? ""}`.replace(/[\s.\-]/g, "").toLowerCase().includes(ePlateQuery)
  ).slice(0, 25)
  async function saveVehicle(alsoQuote: boolean) {
    if (!ePlate) { setErr("เลือกรถก่อน"); return }
    await patch({
      licensePlate: ePlate, vehicleBrand: eSel?.vehicleBrand ?? "", vehicleModel: eSel?.vehicleModel ?? "",
      truckNumber: eSel?.truckNumber ?? "", vehiclePhotoUrl: eSel?.photoUrl ?? "", vehiclePhotos: eSel?.photos ?? undefined,
      totalSalePrice: eSnap.totalSalePrice ?? 0, downPayment: eSnap.downPayment ?? 0, cashDown: eCash,
      ...(eSales && eSales !== q?.salesName ? { salesName: eSales } : {}),
      downInstallmentCount: eSnap.downInstallmentCount ?? 0, downInstallmentAmt: ePerInst,
      financeAmount: eSnap.financeAmount ?? 0, financeInstallments: eSnap.financeInstallments ?? 0, monthlyPayment: eSnap.monthlyPayment ?? 0,
      extras: eExtras, ...(alsoQuote && q?.status === "lead" ? { status: "quoted" } : {}),
    })
    setEditing(false)
    if (alsoQuote) window.open(`/api/partner/quotations/${id}/pdf`, "_blank")
  }

  const screening = stageApi.info?.screening ?? []
  const screenPass = screening.filter((c) => c.pass).length
  const active = q ? activeStageOf(q as unknown as DealForPanel) : "LEAD"
  const phase = useMemo(() => PHASES.find((p) => (p.stages as string[]).includes(active)), [active])
  const appt = APPOINTMENT[active]
  // ดีลพักติดตามใช้วันนัดติดตามแทนวันของขั้น
  const apptDate = q ? (q.stage === "ON_HOLD" ? q.nextFollowUpDate : (appt ? String(q[appt.key] ?? "") : q.nextFollowUpDate)) : ""
  const apptLabel = q?.stage === "ON_HOLD" ? "นัดติดตาม" : appt?.label ?? "นัดติดตาม"
  const apptDiff = dayDiff(apptDate || undefined)

  if (!q) return <div className="p-8 text-sm text-zinc-400 dark:text-zinc-500">กำลังโหลด...</div>
  // ดาวน์ที่ต้องชำระเลย หักด้วยเงินจอง + เงินสะสม พจส. ที่ยกมาใช้
  // ระหว่างเปิด editor ใช้ค่าที่กำลังพิมพ์ (eCash) ยอดจะได้ตรงกับที่เห็นด้านบน
  const cashDownNow = editing ? eCash : (q.cashDown ?? 0)
  const cashDownDirty = editing && eCash !== (q.cashDown ?? 0)
  const cashLeft = cashDownNow - (Number(depAmt) || 0) - (Number(savAmt) || 0)
  const stageDays = daysIn(q.stageEnteredAt)
  const kind = badgeKind(q.stage)
  const dot = DOT_COLOR[kind] || PHASE_BUCKETS.find((b) => b.stages.includes(q.stage ?? ""))?.color || "#8C959F"
  const showContractCta = ["CONTRACT_SCHEDULED", "CONTRACT_SIGNED", "DELIVERED", "COMPLETED_90D"].includes(q.stage ?? "")
  // เงินจอง/สลิปกรอกที่การ์ด "ขั้นถัดไป" ตอนอยู่ขั้นนัดดูรถ — ที่นี่จึงแสดงอย่างเดียว กันกรอกซ้ำสองที่
  const moneyInNextStep = active === "VIEWING_SCHEDULED" && q.stage !== "CLOSED_LOST"

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "ระบบขาย", href: "/partner/quotations" }, { label: "ดีล & ใบเสนอราคา", href: "/partner/quotations" }, { label: q.quotationNo }]} />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-3.5 items-start min-w-0">
          <Link href="/partner/quotations" aria-label="กลับไปหน้ารายการ"
            className="w-10 h-10 shrink-0 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 rounded-[10px] bg-white dark:bg-zinc-900">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-mono text-2xl font-semibold text-[#7A5C14] dark:text-[#E7C86E]">{q.quotationNo}</h1>
              <span className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-0.5 rounded-full text-xs font-semibold ${BADGE_CLASS[kind]}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                {STATUS_LABEL[(q.stage ?? "LEAD") as keyof typeof STATUS_LABEL] ?? q.stage}
              </span>
              <span className="text-xs text-zinc-500">
                {q.stage === "CLOSED_LOST"
                  ? `หลุดที่ขั้น ${STAGE_LABEL[(q.lostAtStage ?? "LEAD") as Stage] ?? "—"}`
                  : q.stage === "ON_HOLD"
                    ? `พักจากขั้น ${STAGE_LABEL[active as Stage]}${q.nextFollowUpDate ? ` · ติดตาม ${thDate(q.nextFollowUpDate)}` : ""}`
                    : `ด่าน ${phase ? `${phase.no} ${phase.label}` : "—"}${stageDays !== null ? ` · ค้างขั้นนี้ ${stageDays} วัน` : ""}`}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-sm text-zinc-500">
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{q.customerName}</span>
              <button onClick={editCustomerName} disabled={busy}
                className="h-7 px-2 inline-flex items-center gap-1 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs bg-white dark:bg-zinc-900">
                <Pencil className="w-3 h-3" /> แก้ชื่อ
              </button>
              {q.customerPhone && <><span>·</span><a href={`tel:${q.customerPhone.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:underline">{q.customerPhone}</a></>}
              <span>·</span><span>เซลล์ {q.salesName}</span>
            </div>
          </div>
        </div>
        <a href={`/api/partner/quotations/${q._id}/pdf`} target="_blank" rel="noreferrer"
          className="h-10 px-4 flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm font-semibold">
          <FileText className="w-4 h-4 text-[#7A5C14] dark:text-[#E7C86E]" /> ใบเสนอ PDF
        </a>
      </div>

      <DealStepper deal={q as unknown as DealForPanel} />

      {err && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg px-4 py-2">{err}</div>}

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        {/* ───── คอลัมน์ซ้าย: ขั้นถัดไป → รถ & ราคา → การเงิน ───── */}
        <div className="w-full xl:w-[736px] xl:shrink-0 space-y-4">
          {stageApi.info ? (
            <DealNextStep deal={q as unknown as DealForPanel} info={stageApi.info} busy={stageApi.busy}
              err={stageApi.err} act={stageApi.act} attach={stageApi.attach} />
          ) : <div className="text-sm text-zinc-500">กำลังโหลดสถานะ…</div>}

          {showContractCta && (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/partner/contracts/new?plate=${encodeURIComponent(q.licensePlate)}`}
                className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg">
                สร้างสัญญาจากดีลนี้ →
              </Link>
              <Link href={`/partner/drivers?new=1&name=${encodeURIComponent(q.customerName ?? "")}&phone=${encodeURIComponent(q.customerPhone ?? "")}`}
                className="flex items-center gap-2 border border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-sm font-semibold px-4 py-2 rounded-lg">
                สร้างข้อมูลคนขับ →
              </Link>
            </div>
          )}

          <Section title="รถ & ราคา" action={!editing && (
            <button onClick={openEditor} className="h-[34px] px-3 flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[13px] font-semibold bg-white dark:bg-zinc-900">
              <Pencil className="w-3.5 h-3.5" /> {q.licensePlate ? "แก้รถ / ราคา / โปรโมชั่น" : "เลือกรถ + ออกใบเสนอราคา"}
            </button>
          )}>
            {!editing ? (
              q.licensePlate ? (
                <div className="grid sm:grid-cols-[240px_minmax(0,1fr)] gap-5">
                  <div className="flex flex-col gap-2">
                    {photoOf("front") ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <a href={photoOf("front")} target="_blank" rel="noreferrer"><img src={photoOf("front")} alt="รูปรถมุมหน้า" className="w-full h-[150px] object-cover rounded-[10px] border border-zinc-200 dark:border-zinc-700" /></a>
                        <button onClick={() => removePhoto("front")} disabled={busy} aria-label="ลบรูปหน้า"
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => pickPhoto("front")} disabled={busy} aria-label="อัปโหลดรูปมุมหน้า"
                        className="w-full h-[150px] rounded-[10px] border border-dashed border-zinc-300 dark:border-zinc-600 flex flex-col items-center justify-center gap-1 text-zinc-500 text-xs">
                        <Upload className="w-5 h-5" /> เพิ่มรูปมุมหน้า
                      </button>
                    )}
                    <div className="grid grid-cols-4 gap-1.5">
                      {PHOTO_SLOTS.slice(1).map((s) => {
                        const url = photoOf(s.key)
                        return url ? (
                          <div key={s.key} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={s.label} className="w-full h-11 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700" /></a>
                            <button onClick={() => removePhoto(s.key)} disabled={busy} aria-label={`ลบรูป${s.label}`}
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">×</button>
                          </div>
                        ) : (
                          <button key={s.key} onClick={() => pickPhoto(s.key)} disabled={busy} aria-label={`อัปโหลดรูป${s.label}`}
                            className="h-11 rounded-lg border border-dashed border-zinc-400 dark:border-zinc-600 text-[11px] text-zinc-500 bg-white dark:bg-zinc-900">+ {s.short ?? s.label}</button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-zinc-500">
                      รูป {PHOTO_SLOTS.filter((s) => photoOf(s.key)).length}/5 มุม · กดรูปเพื่อเปิด · กด × เพื่อลบ
                    </p>
                    <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = "" }} />
                  </div>

                  <div className="min-w-0">
                    <div className="flex gap-5 flex-wrap pb-3 border-b border-zinc-100 dark:border-zinc-800">
                      <Fact k="ทะเบียน" v={q.licensePlate} />
                      <Fact k="ยี่ห้อ / รุ่น" v={`${q.vehicleBrand ?? "-"} ${q.vehicleModel ?? ""}`.trim()} />
                      <Fact k="เบอร์รถ" v={q.truckNumber || "-"} />
                    </div>
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-[7px] mt-3 text-sm tabular-nums">
                      <dt className="text-zinc-500">ราคาขายรวม</dt><dd className="font-bold text-base text-[#7A5C14] dark:text-[#E7C86E]">{formatMoney(q.totalSalePrice)}</dd>
                      <dt className="text-zinc-500">เงินดาวน์รวม</dt><dd>{formatMoney(q.downPayment)}</dd>
                      <dt className="text-zinc-500 pl-3.5">• ดาวน์ชำระเลย</dt><dd>{formatMoney(q.cashDown ?? 0)}</dd>
                      <dt className="text-zinc-500 pl-3.5">• ดาวน์ผ่อน {q.downInstallmentCount || 0} งวด</dt><dd>{formatMoney(q.downInstallmentAmt ?? 0)} / งวด</dd>
                      <dt className="text-zinc-500">ยอดจัดไฟแนนซ์</dt><dd>{formatMoney(q.financeAmount)}</dd>
                      <dt className="text-zinc-500">ค่างวด / เดือน</dt><dd className="font-semibold">{formatMoney(q.monthlyPayment)} × {q.financeInstallments} งวด</dd>
                      {!!q.savingsUsed && (<><dt className="text-zinc-500">ใช้เงินสะสม พจส.</dt><dd>{formatMoney(q.savingsUsed)}</dd></>)}
                    </dl>
                    {q.extras && (
                      <p className="mt-3 px-3 py-2.5 rounded-lg bg-[#FBF4DD] dark:bg-amber-950/20 text-[13px] text-[#5C4510] dark:text-amber-200/90">
                        <span className="font-semibold">ของแถม / โปรโมชั่น:</span> {q.extras}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">ยังไม่ได้เลือกรถ (Lead) — เลือกรถเพื่อออกใบเสนอราคา</p>
              )
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-xs text-zinc-500 mb-1">เลือกรถ (พิมพ์ทะเบียนหรือเบอร์รถ)</label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input value={plateQ} onChange={(e) => { setPlateQ(e.target.value); setPlateOpen(true); setEPlate("") }} onFocus={() => setPlateOpen(true)}
                      className="w-full h-9 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg pl-8 pr-3" placeholder="ค้นหาทะเบียน" />
                  </div>
                  {plateOpen && plateQ && !ePlate && ePlateMatches.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
                      {ePlateMatches.map((p) => (
                        <button key={p.licensePlate} onClick={() => { setEPlate(p.licensePlate); setPlateQ(p.licensePlate); setPlateOpen(false) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/50 flex justify-between">
                          <span className="font-medium">
                            {p.licensePlate}
                            {p.truckNumber && <span className="text-zinc-500 font-normal"> · {p.truckNumber}</span>}
                            {p.status === "contract" && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">มีสัญญาแล้ว</span>}
                          </span>
                          <span className="text-zinc-500 text-xs">{p.vehicleBrand} · {formatMoney(p.totalSalePrice)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* ผู้ขายอยู่นอกบล็อกรถ — เปลี่ยนเซลได้เสมอ ไม่ต้องรอเลือกรถ */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">ผู้ขาย (Sale)</label>
                  <SalesPersonSelect value={eSales} onChange={setESales} />
                </div>
                {eSel && (
                  <div className="text-sm space-y-1">
                    <Row k="ราคาขายรวม" v={formatMoney(eSnap.totalSalePrice ?? 0)} bold />
                    <Row k="เงินดาวน์รวม" v={formatMoney(eSnap.downPayment ?? 0)} />
                    <div className="flex items-center justify-between bg-amber-50/60 dark:bg-amber-950/20 rounded-lg px-2 py-1.5">
                      <span className="text-sm">ดาวน์ชำระเลย <span className="text-[10px] text-amber-600 dark:text-amber-400">(แก้ได้)</span></span>
                      <input type="number" value={eCash} onChange={(e) => setECash(Number(e.target.value) || 0)} className="w-28 h-8 text-sm border border-amber-300 rounded-lg px-2 text-right tabular-nums bg-white dark:bg-zinc-900" />
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-[#7A5C14] dark:text-[#E7C86E]"><span>→ ดาวน์/งวด (คำนวณ)</span><span>{formatMoney(ePerInst)} × {eSnap.downInstallmentCount ?? 0} งวด</span></div>
                    <Row k="ค่างวด/เดือน" v={`${formatMoney(eSnap.monthlyPayment ?? 0)} × ${eSnap.financeInstallments ?? 0} งวด`} />
                    <div>
                      <label className="block text-xs text-zinc-500 mt-2 mb-1">ของแถม / โปรโมชั่น {ePromoNote && <span className="text-[10px] text-emerald-600">· {ePromoNote}</span>}</label>
                      <textarea value={eExtras} onChange={(e) => setEExtras(e.target.value)} rows={2} className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5" />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)} className="text-sm text-zinc-500 px-3 py-1.5">ยกเลิก</button>
                  {q.status === "lead" ? (
                    <button onClick={() => saveVehicle(true)} disabled={busy || !ePlate} className="flex-1 bg-emerald-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">บันทึก + ออกใบเสนอราคา</button>
                  ) : (
                    <>
                      <button onClick={() => saveVehicle(false)} disabled={busy || !ePlate} className="flex-1 bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">บันทึก</button>
                      <button onClick={() => saveVehicle(true)} disabled={busy || !ePlate} className="bg-emerald-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">บันทึก + เปิด PDF</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section title="การเงิน: เงินจอง & ดาวน์ที่ต้องชำระ" action={
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {busy ? "กำลังบันทึก…" : savedAt ? "✓ บันทึกแล้ว" : "บันทึกอัตโนมัติ"}
            </span>
          }>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
              <div className="space-y-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2 items-center p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 rounded-[10px] text-sm tabular-nums">
                  <span className="text-zinc-500">
                    ดาวน์ชำระเลย{cashDownDirty && <span className="text-[10px] text-amber-600 ml-1">(กำลังแก้ ยังไม่บันทึก)</span>}
                  </span>
                  <span className="text-right">{formatMoney(cashDownNow)}</span>

                  <span className="text-zinc-500">− เงินจอง</span>
                  {moneyInNextStep ? (
                    <span className="text-right">{formatMoney(Number(depAmt) || 0)}</span>
                  ) : (
                    <input type="number" value={depAmt} onChange={(e) => setDepAmt(e.target.value)} aria-label="ยอดเงินจอง"
                      onBlur={saveDeposit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                      className="w-[110px] h-[30px] justify-self-end border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-right tabular-nums bg-white dark:bg-zinc-900" />
                  )}

                  <label htmlFor="sav" className="text-zinc-500">− ใช้เงินสะสม พจส. <span className="text-[11px] text-sky-600 dark:text-sky-400">(บันทึกไว้ ไม่หักยอดไฟแนนซ์)</span></label>
                  <input id="sav" type="number" value={savAmt} onChange={(e) => setSavAmt(e.target.value)}
                    onBlur={saveDeposit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }}
                    className="w-[110px] h-[30px] justify-self-end border border-zinc-200 dark:border-zinc-700 rounded-md px-2 text-right tabular-nums bg-white dark:bg-zinc-900" />

                  <span className="font-bold pt-2 border-t border-zinc-200 dark:border-zinc-700">= คงเหลือต้องชำระ</span>
                  <span className={`text-right font-bold pt-2 border-t border-zinc-200 dark:border-zinc-700 ${cashLeft <= 0 ? "text-emerald-600" : "text-[#7A5C14] dark:text-[#E7C86E]"}`}>
                    {formatMoney(cashLeft)}{cashLeft <= 0 && <span className="text-[10px] font-normal ml-1">ครบแล้ว</span>}
                  </span>
                </div>

                {moneyInNextStep && (
                  <p className="text-xs text-zinc-500">ยอดเงินจองและสลิปกรอกที่การ์ด &ldquo;ขั้นถัดไป&rdquo; ด้านบน — ที่เดียวกันทั้งระบบ</p>
                )}
                {!!q.depositAmount && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ วางจอง {formatMoney(q.depositAmount)} บาท{q.depositPaidAt ? ` เมื่อ ${thDate(q.depositPaidAt)}` : ""}</p>
                )}

                <div>
                  <div className="text-[13px] font-semibold mb-1.5">สลิปเงินจอง ({allSlips().length}/10)</div>
                  {allSlips().length > 0 ? (
                    <ul className="space-y-1.5">
                      {allSlips().map((u, i) => (
                        <li key={u} className="flex items-center gap-2.5 px-2.5 py-2 border border-zinc-100 dark:border-zinc-800 rounded-lg text-[13px]">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <a href={u} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">สลิปที่ {i + 1}</a>
                          <button onClick={() => removeSlip(u)} disabled={busy} className="h-7 px-2.5 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-[#A40E26] dark:text-red-400">ลบ</button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-zinc-500">{moneyInNextStep ? "ยังไม่มีสลิป — แนบได้จากการ์ด “ขั้นถัดไป” ด้านบน" : "ยังไม่มีสลิป"}</p>
                  )}
                  <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSlip(f); e.target.value = "" }} />
                  {!moneyInNextStep && (
                    <button onClick={() => fileRef.current?.click()} disabled={busy || allSlips().length >= 10}
                      className="mt-2 flex items-center gap-2 text-[13px] border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                      <Upload className="w-3.5 h-3.5" /> แนบสลิป
                    </button>
                  )}
                </div>
              </div>

              {/* ช่องทางการโอนเงิน — ตรงกับกล่องในใบเสนอ PDF (lib/company-bank.ts) */}
              <div className="p-3.5 border border-[#E7C86E] bg-[#FBF7EC] dark:bg-amber-950/10 rounded-[10px] h-fit">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#7A5C14] dark:text-[#E7C86E]">ช่องทางการโอนเงิน</span>
                  <button onClick={copyBank} className="h-[30px] px-2.5 flex items-center gap-1 border border-[#E7C86E] bg-white dark:bg-zinc-900 rounded-md text-xs font-semibold text-[#7A5C14] dark:text-[#E7C86E]">
                    {copiedBank ? <><CheckCircle2 className="w-3 h-3" /> คัดลอกแล้ว</> : <><Copy className="w-3 h-3" /> คัดลอกเลขบัญชี</>}
                  </button>
                </div>
                <p className="text-[15px] font-semibold mt-2">{COMPANY_BANK.bank}</p>
                <dl className="mt-1.5 grid grid-cols-[84px_1fr] gap-y-1 text-[13px]">
                  <dt className="text-zinc-500">ชื่อบัญชี</dt><dd>{COMPANY_BANK.accountName}</dd>
                  <dt className="text-zinc-500">เลขบัญชี</dt><dd className="font-bold tabular-nums tracking-wide">{COMPANY_BANK.accountNo}</dd>
                  <dt className="text-zinc-500">ประเภท</dt><dd>{COMPANY_BANK.accountType}</dd>
                </dl>
              </div>
            </div>
          </Section>
        </div>

        {/* ───── คอลัมน์ขวา: นัดถัดไป → ลูกค้า & คัดกรอง → กิจกรรม ───── */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <section className="rounded-xl border border-[#EAC54F] bg-[#FFFCEB] dark:bg-amber-950/20 p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-[#7A4E00] dark:text-amber-300">
              <CalendarDays className="w-[15px] h-[15px]" />
              นัดถัดไป{apptDiff !== null ? ` · ${relLabel(apptDiff)}` : ""}
            </h2>
            <div className="text-base font-semibold mt-1.5">
              {apptDate ? `${apptLabel} ${thDate(apptDate)}` : "ยังไม่มีนัดถัดไป"}
            </div>
            <div className="text-[13px] text-zinc-600 dark:text-zinc-400">
              {apptDate ? "วันที่บันทึกไว้ตอนขยับขั้น" : appt ? `ใส่${appt.label}เพื่อขยับขั้นถัดไป` : "ขั้นนี้ยังไม่มีวันนัด"}
            </div>
            <div className="flex gap-2 mt-3">
              {q.customerPhone && (
                <a href={`tel:${q.customerPhone.replace(/[^\d+]/g, "")}`}
                  className="flex-1 h-10 flex items-center justify-center gap-1.5 bg-[#031B14] text-white rounded-lg text-[13px] font-semibold">
                  <Phone className="w-3.5 h-3.5" /> โทรหาลูกค้า
                </a>
              )}
              {appt && q.stage !== "CLOSED_LOST" && (
                <button onClick={() => setReschedule((v) => !v)}
                  className="h-10 px-3.5 bg-white dark:bg-zinc-900 border border-[#D4A72C] rounded-lg text-[13px] font-semibold text-[#7A4E00] dark:text-amber-300">
                  {reschedule ? "ปิด" : "เลื่อนนัด"}
                </button>
              )}
            </div>
            {reschedule && appt && (
              <input type="date" defaultValue={apptDate ?? ""} aria-label={`แก้${appt.label}`}
                onChange={async (e) => { if (await stageApi.act({ action: "fields", fields: { [appt.key]: e.target.value } })) setReschedule(false) }}
                className="mt-2 h-9 w-full rounded-lg border border-[#D4A72C] bg-white dark:bg-zinc-900 px-3 text-sm" />
            )}
          </section>

          <Section title="ลูกค้า & คัดกรอง">
            <dl className="grid grid-cols-[92px_1fr] gap-y-[7px] text-[13px]">
              <dt className="text-zinc-500">ชื่อ</dt><dd className="font-medium">{q.customerName}</dd>
              <dt className="text-zinc-500">โทร</dt><dd className="tabular-nums">{q.customerPhone || "—"}</dd>
              <dt className="text-zinc-500">อายุ</dt><dd>{screening.find((c) => c.key === "age")?.detail ?? "—"}</dd>
              <dt className="text-zinc-500">ใบขับขี่</dt><dd>{screening.find((c) => c.key === "license")?.detail ?? "—"}</dd>
              <dt className="text-zinc-500">เซลล์</dt><dd>{q.salesName}</dd>
            </dl>
            {screening.length > 0 && (
              <details className="mt-3 group">
                <summary className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] font-semibold cursor-pointer ${
                  screenPass === screening.length ? "bg-[#E8F3EE] dark:bg-[#12362B] text-[#165443] dark:text-emerald-300" : "bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300"}`}>
                  {screenPass === screening.length ? "✓" : "•"} ผ่านเช็กลิสต์คัดกรอง {screenPass}/{screening.length}
                  <span className="ml-auto text-xs font-normal text-zinc-500 group-open:hidden">ดูรายละเอียด</span>
                </summary>
                <ul className="mt-2 space-y-1.5 text-[13px]">
                  {screening.map((c) => (
                    <li key={c.key} className="flex gap-2">
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${c.pass ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                      <span className={c.pass ? "" : "text-zinc-500"}>{c.label}{c.detail ? ` — ${c.detail}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section title="กิจกรรม / บันทึกการติดตาม">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} aria-label="บันทึกการติดตาม"
              placeholder="บันทึกการโทร / นัด / ต่อรอง…"
              className="w-full text-[13px] border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-2 resize-y bg-white dark:bg-zinc-900" />
            <div className="flex justify-between items-center gap-2 mt-2 flex-wrap">
              <div className="flex gap-1.5">
                {["โทร", "LINE", "พบลูกค้า"].map((t) => (
                  <button key={t} onClick={() => setNoteText((v) => v.startsWith(`${t}: `) ? v : `${t}: ${v.replace(/^(โทร|LINE|พบลูกค้า): /, "")}`)}
                    className="h-[30px] px-2.5 border border-zinc-200 dark:border-zinc-700 rounded-full text-xs bg-white dark:bg-zinc-900">{t}</button>
                ))}
              </div>
              <button onClick={() => noteText.trim() && patch({ note: noteText.trim() }, "note")} disabled={busy || !noteText.trim()}
                className="h-[34px] px-3.5 bg-[#031B14] text-white rounded-lg text-[13px] font-semibold disabled:opacity-50">บันทึก</button>
            </div>
            <ol className="mt-4 space-y-3.5 text-[13px]">
              {[...(q.timeline ?? [])].reverse().map((t, i) => (
                <li key={i} className="grid grid-cols-[12px_1fr] gap-2.5">
                  <span className="w-2 h-2 mt-1.5 rounded-full" style={{ background: dotOf(t.action) }} />
                  <div className="min-w-0">
                    <div>{t.action}{t.note ? ` — ${t.note}` : ""}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(t.at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} · {t.by}
                    </div>
                  </div>
                </li>
              ))}
              {(q.timeline ?? []).length === 0 && <li className="text-zinc-500">ยังไม่มีกิจกรรม</li>}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{k}</div>
      <div className="text-[15px] font-semibold">{v}</div>
    </div>
  )
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{k}</span>
      <span className={bold ? "font-bold text-[#7A5C14] dark:text-[#E7C86E]" : ""}>{v}</span>
    </div>
  )
}
