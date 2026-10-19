"use client"

import { useCallback, useEffect, useState } from "react"
import { confirm, prompt } from "@/components/partner/ui/confirm"
import { useParams } from "next/navigation"
import Link from "next/link"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { ArrowLeft, CheckCircle2, FileDown, ShieldCheck, Undo2 } from "lucide-react"
import { formatMoney, formatMonth } from "@/lib/partner/utils"

type Phase = "draft" | "checked" | "submitted" | "approved" | "locked"

const FLOW: Phase[] = ["draft", "checked", "submitted", "approved", "locked"]
const PHASE_META: Record<Phase, { label: string; who: string; color: string }> = {
  draft:     { label: "จัดทำข้อมูล",   who: "ธุรการ/ระบบ",   color: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  checked:   { label: "ตรวจแล้ว",      who: "แผนกรถร่วม",    color: "bg-amber-50 text-amber-700 border-amber-200" },
  submitted: { label: "ส่งอนุมัติ",     who: "การเงิน",        color: "bg-sky-50 text-sky-700 border-sky-200" },
  approved:  { label: "อนุมัติแล้ว",    who: "ผู้บริหาร",       color: "bg-blue-50 text-blue-700 border-blue-200" },
  locked:    { label: "ปิดงวด",        who: "ระบบ/แอดมิน",   color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
}
const NEXT_LABEL: Record<Phase, string> = {
  draft: "ตรวจข้อมูลเสร็จ (แผนกรถร่วม)", checked: "ส่งผู้บริหารอนุมัติ (การเงิน)",
  submitted: "อนุมัติจ่ายงวดนี้ (ผู้บริหาร)", approved: "ล็อคปิดงวด", locked: "",
}
const NEXT_ROLES: Record<Phase, string[]> = {
  draft: ["fleet", "admin", "superadmin"], checked: ["finance", "admin", "superadmin"],
  submitted: ["admin", "superadmin"], approved: ["admin", "superadmin"], locked: [],
}

type Brief = { contractCode: string; driverName: string; netPay: number; totalIncome: number; totalDeductions: number; carryIn: number; carryOut: number; workingDays: number; tripCount: number }
interface Summary {
  month: string; phase: Phase
  history: { phase: Phase; by: string; at: string; note?: string; action: string }[]
  totals: { drivers: number; income: number; deductions: number; netPay: number; payable: number; carryIn: number; carryOut: number; trips: number; fuel: number; wht: number; paidNet: number }
  prev: { drivers: number; income: number; netPay: number }
  mom: { income: number | null; netPay: number | null }
  plants: { plant: string; drivers: number; income: number; netPay: number }[]
  topPay: Brief[]; carryList: Brief[]
  anomalies: { type: string; detail: string; row: Brief }[]
  ledger: { debtCount: number; debtOutstanding: number; depositCount: number; depositBalance: number }
}

export default function ApprovalPage() {
  const { month } = useParams<{ month: string }>()
  const { data: session } = usePartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role ?? "viewer"

  const [s, setS] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const load = useCallback(() => {
    fetch(`/api/partner/payroll/${month}/approval-summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setS(d) })
  }, [month])
  useEffect(load, [load])

  const transition = async (action: "advance" | "reject") => {
    if (!s) return
    let note = ""
    if (action === "reject") {
      note = (await prompt("เหตุผลที่ตีกลับ (บังคับ):"))?.trim() ?? ""
      if (!note) return
    } else {
      const msg = s.phase === "submitted"
        ? `ยืนยันอนุมัติจ่ายเงินเดือนงวด ${formatMonth(month)}\nโอนสุทธิรวม ${formatMoney(s.totals.paidNet)} บาท (${s.totals.drivers} คน · หัก WHT ${formatMoney(s.totals.wht)})?`
        : `ยืนยัน: ${NEXT_LABEL[s.phase]}?`
      if (!await confirm(msg)) return
    }
    setBusy(true); setError("")
    const res = await fetch("/api/partner/month-status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action, note }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) setError(d.error ?? "ทำรายการไม่สำเร็จ")
    setBusy(false); load()
  }

  if (!s) return <div className="p-8 text-sm text-zinc-400">กำลังโหลด...</div>

  const meta = PHASE_META[s.phase]
  const canAdvance = NEXT_ROLES[s.phase]?.includes(role)
  const canReject  = s.phase !== "draft" && ["fleet", "finance", "admin", "superadmin"].includes(role) &&
    (s.phase !== "locked" || ["admin", "superadmin"].includes(role))
  const stepIdx = FLOW.indexOf(s.phase)

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/partner/payroll/${month}`} className="text-zinc-400 hover:text-zinc-600"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            สรุปงวดเพื่ออนุมัติ · {formatMonth(month)}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">Executive Summary — ข้อมูลชุดเดียวกับสลิปทุกใบ (engine กลาง)</p>
        </div>
        <span className={`ml-auto text-xs px-3 py-1.5 rounded-full border font-medium ${meta.color}`}>
          {meta.label} · {meta.who}
        </span>
      </div>

      {/* Stepper — ขั้นตอนปิดงวด (draft → ตรวจ → ส่งอนุมัติ → อนุมัติ → ปิดงวด) */}
      <div className="flex items-stretch overflow-x-auto pb-1">
        {FLOW.map((p, i) => {
          const done = i < stepIdx, current = i === stepIdx
          return (
            <div key={p} className="flex items-center shrink-0">
              {i > 0 && <div className={`h-0.5 w-6 sm:w-12 ${i <= stepIdx ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-700"}`} aria-hidden="true" />}
              <div className="flex flex-col items-center gap-1 px-1">
                <div className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold border-2 ${
                  done ? "bg-emerald-500 border-emerald-500 text-white"
                  : current ? "bg-[#C9A227] border-[#C9A227] text-white"
                  : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500"}`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className="text-center leading-tight">
                  <div className={`text-[11px] font-semibold ${current ? "text-[#8C6B1F] dark:text-[#E7C86E]" : done ? "text-emerald-600" : "text-zinc-400 dark:text-zinc-500"}`}>{PHASE_META[p].label}</div>
                  <div className="text-[9px] text-zinc-400 dark:text-zinc-500">{PHASE_META[p].who}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="พขร. ในงวด" value={String(s.totals.drivers)} sub={`${s.totals.trips.toLocaleString()} เที่ยว`} />
        <Card label="รายรับรวม" value={formatMoney(s.totals.income)} sub={momText(s.mom.income)} good />
        <Card label="รายหักรวม" value={formatMoney(s.totals.deductions)} sub={`น้ำมันสุทธิ ${formatMoney(s.totals.fuel)}`} />
        <Card label="สุทธิงวดนี้" value={formatMoney(s.totals.netPay)} sub={momText(s.mom.netPay)} />
        <Card label="ยอดโอนสุทธิ (หลัง WHT)" value={formatMoney(s.totals.paidNet)}
          sub={`WHT 3% ${formatMoney(s.totals.wht)} · ยกไปงวดหน้า ${formatMoney(s.totals.carryOut)}`} strong />
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</div>}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {canAdvance && s.phase !== "locked" && (
          <button onClick={() => transition("advance")} disabled={busy}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
            <CheckCircle2 className="w-4 h-4" /> {NEXT_LABEL[s.phase]}
          </button>
        )}
        {canReject && (
          <button onClick={() => transition("reject")} disabled={busy}
            className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 text-sm px-4 py-2.5 rounded-lg">
            <Undo2 className="w-4 h-4" /> ตีกลับแก้ไข
          </button>
        )}
        <a href={`/api/partner/payroll/${month}/packet`} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-700 text-white text-sm px-4 py-2.5 rounded-lg">
          <FileDown className="w-4 h-4" /> ชุดอนุมัติ PDF
        </a>
        <a href={`/partner/payroll/${month}/print-all`} className="flex items-center gap-2 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm px-4 py-2.5 rounded-lg">
          <FileDown className="w-4 h-4" /> สลิปทั้งงวด
        </a>
        <Link href={`/partner/payroll/${month}/compare`} className="flex items-center gap-2 border border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-sm px-4 py-2.5 rounded-lg">
          ⚖ เทียบไฟล์ (Parallel)
        </Link>
        <Link href="/partner/payroll/sop" className="text-xs text-zinc-400 hover:text-zinc-600 underline ml-auto">SOP/WI การปิดงวด →</Link>
      </div>

      {/* Plant breakdown + carry list */}
      <div className="grid md:grid-cols-2 gap-5">
        <Section title={`แยกต่อแพล้นท์ (${s.plants.length})`}>
          <table className="w-full text-xs">
            <thead><tr className="text-zinc-400 border-b border-zinc-100">
              <th className="text-left py-1.5 font-medium">แพล้นท์</th><th className="text-right font-medium">พขร.</th>
              <th className="text-right font-medium">รายรับ</th><th className="text-right font-medium">สุทธิ</th></tr></thead>
            <tbody className="divide-y divide-zinc-50">
              {s.plants.map((p) => (
                <tr key={p.plant}>
                  <td className="py-1.5">{p.plant}</td><td className="text-right">{p.drivers}</td>
                  <td className="text-right">{formatMoney(p.income)}</td>
                  <td className="text-right font-medium">{formatMoney(p.netPay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title={`หนี้ยกไปงวดหน้า (${s.carryList.length} คน · ${formatMoney(s.totals.carryOut)})`}>
          {s.carryList.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <thead><tr className="text-zinc-400 border-b border-zinc-100">
                <th className="text-left py-1.5 font-medium">พขร.</th><th className="text-right font-medium">สุทธิ</th>
                <th className="text-right font-medium">ยกมา</th><th className="text-right font-medium text-red-500">ยกไป</th></tr></thead>
              <tbody className="divide-y divide-zinc-50">
                {s.carryList.slice(0, 15).map((r) => (
                  <tr key={r.contractCode}>
                    <td className="py-1.5"><Link href={`/partner/drivers/360/${r.contractCode}`} className="hover:text-blue-600 hover:underline">{r.contractCode} · {r.driverName}</Link></td>
                    <td className="text-right">{formatMoney(r.netPay)}</td>
                    <td className="text-right">{formatMoney(r.carryIn)}</td>
                    <td className="text-right text-red-600 font-medium">{formatMoney(r.carryOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={`รายการผิดปกติ (${s.anomalies.length})`}>
          {s.anomalies.length === 0 ? <Empty text="ไม่พบรายการผิดปกติ ✓" /> : (
            <ul className="space-y-1.5 text-xs">
              {s.anomalies.slice(0, 20).map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">{a.type}</span>
                  <span className="text-zinc-600"><Link href={`/partner/drivers/360/${a.row.contractCode}`} className="hover:text-blue-600 hover:underline">{a.row.contractCode} · {a.row.driverName}</Link> — {a.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="ฐานะหนี้/เงินสะสมทั้ง fleet (ledger)">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="border border-zinc-100 rounded-lg py-3">
              <p className="text-lg font-bold text-red-600">{formatMoney(s.ledger.debtOutstanding)}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">หนี้คงค้าง · {s.ledger.debtCount} รายการ</p>
            </div>
            <div className="border border-zinc-100 rounded-lg py-3">
              <p className="text-lg font-bold text-emerald-600">{formatMoney(s.ledger.depositBalance)}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">เงินสะสมรวม · {s.ledger.depositCount} รายการ</p>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 mt-2">เมื่อกด "อนุมัติ" ระบบตัดยอด ledger ของงวดนี้อัตโนมัติ (ยิงซ้ำได้ ไม่ตัดคู่)</p>
        </Section>
      </div>

      {/* Top pay */}
      <Section title="Top 10 จ่ายสูงสุด">
        <table className="w-full text-xs">
          <thead><tr className="text-zinc-400 border-b border-zinc-100">
            <th className="text-left py-1.5 font-medium">พขร.</th><th className="text-right font-medium">วัน/เที่ยว</th>
            <th className="text-right font-medium">รับ</th><th className="text-right font-medium">หัก</th><th className="text-right font-medium">สุทธิ</th></tr></thead>
          <tbody className="divide-y divide-zinc-50">
            {s.topPay.map((r) => (
              <tr key={r.contractCode}>
                <td className="py-1.5"><Link href={`/partner/drivers/360/${r.contractCode}`} className="hover:text-blue-600 hover:underline">{r.contractCode} · {r.driverName}</Link></td>
                <td className="text-right text-zinc-400">{r.workingDays}/{r.tripCount}</td>
                <td className="text-right">{formatMoney(r.totalIncome)}</td>
                <td className="text-right">{formatMoney(r.totalDeductions)}</td>
                <td className="text-right font-semibold">{formatMoney(r.netPay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* History */}
      <Section title="ประวัติการอนุมัติ">
        {s.history.length === 0 ? <Empty text="ยังไม่มีการเปลี่ยนสถานะ" /> : (
          <ul className="space-y-1.5 text-xs">
            {[...s.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-zinc-600">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PHASE_META[h.phase]?.color ?? "bg-zinc-50"}`}>
                  {h.action === "reject" ? "ตีกลับ → " : ""}{PHASE_META[h.phase]?.label ?? h.phase}
                </span>
                <span>{h.by}</span>
                <span className="text-zinc-300">{new Date(h.at).toLocaleString("th-TH")}</span>
                {h.note && <span className="text-zinc-400">— {h.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function momText(v: number | null): string {
  if (v === null) return "ไม่มีเดือนก่อนเทียบ"
  const sign = v > 0 ? "▲" : v < 0 ? "▼" : "•"
  return `${sign} ${Math.abs(v).toFixed(1)}% vs เดือนก่อน`
}

function Card({ label, value, sub, good, strong }: { label: string; value: string; sub?: string; good?: boolean; strong?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${strong ? "border-zinc-800 bg-zinc-900 text-white" : "border-zinc-100 bg-white"}`}>
      <p className={`text-[11px] ${strong ? "text-zinc-300" : "text-zinc-400"}`}>{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${good && !strong ? "text-emerald-600" : ""}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${strong ? "text-zinc-400" : "text-zinc-400"}`}>{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-100 rounded-xl p-4">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  )
}

const Empty = ({ text = "ไม่มีรายการ" }: { text?: string }) => (
  <p className="text-xs text-zinc-300 text-center py-4">{text}</p>
)
