"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, CircleUser, Phone, Landmark, AlertTriangle, FileText, Printer } from "lucide-react"
import { formatMoney, formatMonth } from "@/lib/partner/utils"

interface MonthRow {
  month: string; workingDays: number; tripCount: number
  totalIncome: number; totalDeductions: number; netPay: number
  carryIn: number; carryOut: number; payable: number; whtAmount: number; paidNet: number; fuelNet: number
}
interface AttMonth {
  month: string; workDays: number
  days: { c: string; g: string }[]
  counts: { work: number; late: number; half: number; leave: number; absent: number; train: number; other: number }
}
interface Data {
  contractCode: string
  driver: { driverName: string; licensePlate: string; truckNumber: string; plant: string; phone: string; accountNumber: string; bankName: string; status: string; staffCode: string } | null
  contract: { _id: string; buyerName: string; driverName: string; startDate: string | null; status: string; guarantorName: string | null } | null
  installmentInfo: { monthly: number; paidMonths: number | null; totalMonths: number | null; remaining: number | null } | null
  kpi: { incomeAvg3: number; netLast: number; paidNetLast: number; lastMonth: string | null; totalDebtRemaining: number; totalDeposit: number; totalMonthlyDebt: number; carryNow: number }
  months: MonthRow[]
  attendanceMonths: AttMonth[]
  debtsLedger: { debtCode: string; type: string; refLabel: string; principal: number; paid: number; remaining: number; monthly: number; monthsLeft: number | null; startMonth: string; pctPaid: number }[]
  deposits: { debtCode: string; type: string; balance: number; target: number | null; monthly: number }[]
  insurance: { itemType: string; expiry: string | null; collectEnd: string | null; monthly: number; status: string }[]
  promo: { repairBudget: number; repairUsed: number; repairRemaining: number; annualPmCap: number; pmUsed: number; pmWindowFrom: string; pmWindowTo: string } | null
  debtDocs: { no: string; issueDate: string | null; liability: number; outstanding: number; linked: boolean; repairType: string }[]
  risks: { level: "high" | "warn"; label: string; detail: string }[]
}

const DEBT_TYPE_TH: Record<string, string> = {
  vehicle_installment: "ค่างวดรถ", debt_acceptance: "รับสภาพหนี้", down_payment: "ผ่อนเงินดาวน์",
  insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษีทะเบียน", inspection: "ตรวจสภาพ", personal: "ประกันบุคคล",
  tire_deposit: "ค่ายาง", security_deposit: "เงินค้ำประกัน", manual: "อื่นๆ",
}
const INS_TH: Record<string, string> = { insurance: "ประกันภัย", prb: "พรบ.", tax: "ภาษีทะเบียน", inspection: "ตรวจสภาพ", personal: "ประกันบุคคล" }

export default function Driver360Page() {
  const { contractCode } = useParams<{ contractCode: string }>()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState("")

  useEffect(() => {
    fetch(`/api/partner/drivers/summary360/${contractCode}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "โหลดไม่สำเร็จ"); setD(j) })
      .catch((e) => setErr(e.message))
  }, [contractCode])

  if (err) return <div className="p-8 text-sm text-red-500">{err}</div>
  if (!d) return <div className="p-8 text-sm text-zinc-400 animate-pulse">กำลังรวมข้อมูล 360°...</div>

  const name = d.driver?.driverName ?? d.contract?.driverName ?? d.contractCode
  const inst = d.installmentInfo
  const maxBar = Math.max(...d.months.map((m) => Math.max(m.totalIncome, m.totalDeductions)), 1)

  return (
    <div className="max-w-6xl space-y-5 print:text-[12px]">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Link href="/partner/drivers" className="text-zinc-400 hover:text-zinc-600 mt-1"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CircleUser className="w-6 h-6 text-blue-600" /> {name}
            <span className="text-sm font-mono font-normal text-zinc-400">{d.contractCode}</span>
          </h1>
          <p className="text-xs text-zinc-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{d.driver?.licensePlate ?? "-"} · {d.driver?.truckNumber ?? "-"} · แพล้นท์ {d.driver?.plant ?? "-"}</span>
            {d.driver?.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{d.driver.phone}</span>}
            {d.driver?.accountNumber && <span className="inline-flex items-center gap-1"><Landmark className="w-3 h-3" />{d.driver.bankName ?? ""} {d.driver.accountNumber}</span>}
          </p>
          {inst && inst.paidMonths !== null && inst.totalMonths && (
            <div className="mt-2 max-w-sm">
              <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                <span>สัญญาเดือนที่ {inst.paidMonths}/{inst.totalMonths} ({Math.round(((inst.paidMonths ?? 0) / inst.totalMonths) * 100)}%)</span>
                <span>งวดละ {formatMoney(inst.monthly)} · เหลือ {formatMoney(inst.remaining ?? 0)}</span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, ((inst.paidMonths ?? 0) / inst.totalMonths) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {d.risks.length > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> สัญญาณเสี่ยง {d.risks.length}
            </span>
          )}
          <button onClick={() => window.print()} className="text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded-lg p-2"><Printer className="w-4 h-4" /></button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card label="รายรับเฉลี่ย 3 งวด" value={formatMoney(d.kpi.incomeAvg3)} />
        <Card label={`สุทธิงวดล่าสุด${d.kpi.lastMonth ? ` (${formatMonth(d.kpi.lastMonth)})` : ""}`} value={formatMoney(d.kpi.netLast)} tone={d.kpi.netLast < 0 ? "bad" : "good"} sub={`โอนจริง ${formatMoney(d.kpi.paidNetLast)}`} />
        <Card label="หนี้คงเหลือรวม" value={formatMoney(d.kpi.totalDebtRemaining)} sub={`หัก ${formatMoney(d.kpi.totalMonthlyDebt)}/เดือน`} />
        <Card label="เงินสะสมรวม" value={formatMoney(d.kpi.totalDeposit)} tone="good" />
        <Card label="หนี้ยกยอดปัจจุบัน" value={formatMoney(d.kpi.carryNow)} tone={d.kpi.carryNow > 0 ? "bad" : undefined} />
      </div>

      {/* Bar chart งวดย้อนหลัง */}
      <Section title={`แนวโน้ม ${d.months.length} งวดล่าสุด`}>
        {d.months.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <div className="min-w-fit">
              {/* legend */}
              <div className="flex items-center gap-4 text-[10px] text-zinc-500 mb-2">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> รายรับ</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> รายหัก</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5 bg-zinc-800" /> สุทธิ</span>
              </div>
              <div className="relative h-44">
                {/* gridlines */}
                {[0, 25, 50, 75].map((p) => (
                  <div key={p} className="absolute left-0 right-0 border-t border-zinc-100" style={{ bottom: `${p}%` }} />
                ))}
                <div className="relative flex items-end gap-5 h-full px-1">
                  {d.months.map((m) => (
                    <div key={m.month} className="w-16 shrink-0 h-full flex flex-col justify-end items-center group relative">
                      <div className="absolute -top-1 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 whitespace-nowrap bg-white border border-zinc-200 shadow-sm rounded px-1.5 py-0.5 z-10">
                        รับ {formatMoney(m.totalIncome)} · หัก {formatMoney(m.totalDeductions)} · สุทธิ {formatMoney(m.netPay)}{m.carryOut > 0 ? ` · ยกไป ${formatMoney(m.carryOut)}` : ""}
                      </div>
                      <div className="flex items-end gap-1 w-full justify-center" style={{ height: "85%" }}>
                        <div className="flex flex-col items-center justify-end h-full">
                          <span className="text-[8px] text-emerald-600 mb-0.5">{kFmt(m.totalIncome)}</span>
                          <div className="w-5 bg-emerald-500 rounded-t-sm" style={{ height: `${(m.totalIncome / maxBar) * 100}%`, minHeight: m.totalIncome > 0 ? 2 : 0 }} />
                        </div>
                        <div className="flex flex-col items-center justify-end h-full">
                          <span className="text-[8px] text-red-500 mb-0.5">{kFmt(m.totalDeductions)}</span>
                          <div className="w-5 bg-red-400 rounded-t-sm" style={{ height: `${(m.totalDeductions / maxBar) * 100}%`, minHeight: m.totalDeductions > 0 ? 2 : 0 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* แกน x: เดือน + สุทธิ */}
              <div className="flex gap-5 px-1 border-t border-zinc-200 pt-1">
                {d.months.map((m) => (
                  <div key={m.month} className="w-16 shrink-0 text-center">
                    <p className="text-[10px] text-zinc-500">{shortMonth(m.month)}</p>
                    <p className={`text-[10px] font-semibold ${m.netPay < 0 ? "text-red-600" : "text-zinc-700"}`}>{kFmt(m.netPay)}</p>
                    {m.carryOut > 0 && <p className="text-[8px] text-red-500">ยกไป {kFmt(m.carryOut)}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* เที่ยว + วันทำงาน + ปฏิทินขาดลามาสาย */}
      <Section title="การมาทำงาน & เที่ยววิ่ง รายเดือน">
        {d.months.length === 0 && d.attendanceMonths.length === 0 ? <Empty /> : (
          <div className="space-y-4">
            {/* combo bars: เที่ยว (ม่วง) + วันทำงาน (ฟ้า) */}
            <div className="overflow-x-auto">
              <div className="min-w-fit">
                <div className="flex items-center gap-4 text-[10px] text-zinc-500 mb-2">
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> เที่ยว</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> วันทำงาน</span>
                </div>
                <div className="relative h-32">
                  {[0, 50].map((p) => <div key={p} className="absolute left-0 right-0 border-t border-zinc-100" style={{ bottom: `${p}%` }} />)}
                  <div className="relative flex items-end gap-5 h-full px-1">
                    {d.months.map((m) => {
                      const maxTrip = Math.max(...d.months.map((x) => x.tripCount), 1)
                      return (
                        <div key={m.month} className="w-16 shrink-0 h-full flex items-end justify-center gap-1">
                          <div className="flex flex-col items-center justify-end h-full">
                            <span className="text-[8px] text-violet-600 mb-0.5">{m.tripCount}</span>
                            <div className="w-5 bg-violet-500 rounded-t-sm" style={{ height: `${(m.tripCount / maxTrip) * 88}%`, minHeight: m.tripCount > 0 ? 2 : 0 }} />
                          </div>
                          <div className="flex flex-col items-center justify-end h-full">
                            <span className="text-[8px] text-sky-600 mb-0.5">{m.workingDays}</span>
                            <div className="w-5 bg-sky-400 rounded-t-sm" style={{ height: `${(m.workingDays / 31) * 88}%`, minHeight: m.workingDays > 0 ? 2 : 0 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-5 px-1 border-t border-zinc-200 pt-1">
                  {d.months.map((m) => (
                    <div key={m.month} className="w-16 shrink-0 text-center text-[10px] text-zinc-500">{shortMonth(m.month)}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* heatmap ปฏิทินรายวัน */}
            {d.attendanceMonths.length > 0 && (
              <div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 mb-2">
                  <span className="font-semibold text-zinc-600">ปฏิทินรายวัน:</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" /> มา</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400" /> มาสาย</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-200" /> ครึ่งวัน</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-300" /> ลา/ป่วย/กิจ</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-500" /> ขาด</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-300" /> ฝึกอบรม</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-violet-300" /> อื่นๆ</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-zinc-100 border border-zinc-200" /> ไม่มีข้อมูล</span>
                </div>
                <div className="space-y-1.5 overflow-x-auto">
                  {[...d.attendanceMonths].reverse().map((am) => (
                    <div key={am.month} className="flex items-center gap-2 min-w-fit">
                      <span className="text-[10px] text-zinc-500 w-14 shrink-0 text-right">{shortMonth(am.month)}</span>
                      <div className="flex gap-[3px]">
                        {am.days.map((dy, i) => (
                          <span key={i} title={`วันที่ ${i + 1}: ${dy.c || "ไม่มีข้อมูล"}`}
                            className={`w-3.5 h-3.5 rounded-sm ${GCOLOR[dy.g] ?? "bg-violet-300"}`} />
                        ))}
                      </div>
                      <span className="text-[10px] text-zinc-400 whitespace-nowrap pl-1">
                        มา {am.counts.work}{am.counts.late > 0 && <span className="text-orange-500"> · สาย {am.counts.late}</span>}{am.counts.leave > 0 && <span className="text-amber-600"> · ลา {am.counts.leave}</span>}{am.counts.absent > 0 && <span className="text-red-600 font-semibold"> · ขาด {am.counts.absent}</span>}{am.counts.train > 0 && <span className="text-blue-500"> · ฝึก {am.counts.train}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-5">
        {/* หนี้รายก้อน */}
        <Section title={`หนี้รายก้อน (${d.debtsLedger.length}) · คงเหลือ ${formatMoney(d.kpi.totalDebtRemaining)}`}>
          {d.debtsLedger.length === 0 ? <Empty text="ไม่มีหนี้ 🎉" /> : (
            <div className="space-y-2.5">
              {d.debtsLedger.map((l) => (
                <div key={l.debtCode}>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-600 truncate pr-2">{DEBT_TYPE_TH[l.type] ?? l.type} <span className="text-zinc-300 font-mono text-[10px]">{l.debtCode}</span></span>
                    <span className="font-medium whitespace-nowrap">เหลือ {formatMoney(l.remaining)}{l.monthly > 0 && <span className="text-zinc-400 font-normal"> · {formatMoney(l.monthly)}/ด.{l.monthsLeft ? ` · อีก ${l.monthsLeft} งวด` : ""}</span>}</span>
                  </div>
                  <div className="h-1 bg-zinc-100 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-zinc-400" style={{ width: `${l.pctPaid}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {d.deposits.length > 0 && (
            <div className="mt-4 pt-3 border-t border-zinc-100 space-y-1.5">
              {d.deposits.map((dep) => (
                <div key={dep.debtCode} className="flex justify-between text-xs">
                  <span className="text-emerald-700">{DEBT_TYPE_TH[dep.type] ?? dep.type}</span>
                  <span className="font-medium text-emerald-700">{formatMoney(dep.balance)}{dep.target ? ` / ${formatMoney(dep.target)}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* สัญญาณเสี่ยง */}
        <Section title={`สัญญาณเสี่ยง (${d.risks.length})`}>
          {d.risks.length === 0 ? <Empty text="ไม่พบสัญญาณเสี่ยง ✓" /> : (
            <ul className="space-y-2">
              {d.risks.map((r, i) => (
                <li key={i} className={`text-xs rounded-lg px-3 py-2 border ${r.level === "high" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  <p className="font-semibold">{r.level === "high" ? "🔴" : "🟡"} {r.label}</p>
                  <p className="mt-0.5 opacity-80">{r.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* ประกัน/ภาษีรถ */}
        <Section title="ประกัน / ภาษี / ตรวจสภาพ">
          {d.insurance.length === 0 ? <Empty text="ยังไม่มีข้อมูลในโมดูลประกัน" /> : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-zinc-50">
                {d.insurance.map((i, idx) => (
                  <tr key={idx}>
                    <td className="py-1.5">{INS_TH[i.itemType] ?? i.itemType}</td>
                    <td className="text-right text-zinc-400">หมด {i.expiry ? i.expiry.slice(0, 10) : "-"}</td>
                    <td className="text-right">{i.monthly > 0 ? `${formatMoney(i.monthly)}/ด. ถึง ${i.collectEnd ?? "-"}` : <span className="text-zinc-300">ไม่หักงวด</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* โปรโมชั่น */}
        <Section title="สิทธิ์โปรโมชั่นคงเหลือ">
          {!d.promo ? <Empty text="ไม่มีงบโปรโมชั่นตั้งไว้" /> : (
            <div className="space-y-3 text-xs">
              <Budget label="ฟรีค่าซ่อม (pro2)" used={d.promo.repairUsed} budget={d.promo.repairBudget} />
              <Budget label={`PM รอบสัญญา ${d.promo.pmWindowFrom?.slice(0, 10) ?? ""} → ${d.promo.pmWindowTo?.slice(0, 10) ?? ""}`} used={d.promo.pmUsed} budget={d.promo.annualPmCap} />
              <Link href={`/partner/promotions/${d.contractCode}`} className="text-blue-600 hover:underline text-[11px]">ดูรายละเอียดโปรโมชั่น →</Link>
            </div>
          )}
        </Section>
      </div>

      {/* งวดย้อนหลัง */}
      <Section title="งวดเงินเดือนย้อนหลัง">
        {d.months.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead><tr className="text-zinc-400 border-b border-zinc-100">
                {["งวด", "วัน", "เที่ยว", "รายรับ", "น้ำมัน", "รายหัก", "สุทธิ", "ยกมา", "ยกไป", "WHT", "โอนจริง", ""].map((h) => (
                  <th key={h} className="text-right first:text-left py-1.5 px-2 font-medium">{h}</th>))}
              </tr></thead>
              <tbody className="divide-y divide-zinc-50">
                {[...d.months].reverse().map((m) => (
                  <tr key={m.month} className={m.netPay < 0 ? "bg-red-50/50" : ""}>
                    <td className="py-1.5 px-2">{formatMonth(m.month)}</td>
                    <td className="text-right px-2">{m.workingDays}</td>
                    <td className="text-right px-2">{m.tripCount}</td>
                    <td className="text-right px-2">{formatMoney(m.totalIncome)}</td>
                    <td className="text-right px-2 text-zinc-400">{formatMoney(m.fuelNet)}</td>
                    <td className="text-right px-2">{formatMoney(m.totalDeductions)}</td>
                    <td className={`text-right px-2 font-medium ${m.netPay < 0 ? "text-red-600" : ""}`}>{formatMoney(m.netPay)}</td>
                    <td className="text-right px-2 text-zinc-400">{m.carryIn ? formatMoney(m.carryIn) : "-"}</td>
                    <td className={`text-right px-2 ${m.carryOut ? "text-red-600" : "text-zinc-300"}`}>{m.carryOut ? formatMoney(m.carryOut) : "-"}</td>
                    <td className="text-right px-2 text-zinc-400">{m.whtAmount ? formatMoney(m.whtAmount) : "-"}</td>
                    <td className="text-right px-2 font-semibold">{formatMoney(m.paidNet)}</td>
                    <td className="px-2 print:hidden"><Link href={`/partner/payroll/${m.month}/${d.contractCode}/print`} className="text-blue-500 hover:underline">สลิป</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ใบรับสภาพหนี้ + เอกสาร */}
      <div className="grid md:grid-cols-2 gap-5">
        <Section title={`ใบรับสภาพหนี้ (${d.debtDocs.length})`}>
          {d.debtDocs.length === 0 ? <Empty /> : (
            <table className="w-full text-xs">
              <tbody className="divide-y divide-zinc-50">
                {d.debtDocs.map((doc) => (
                  <tr key={doc.no}>
                    <td className="py-1.5 font-mono text-[10px]">{doc.no}</td>
                    <td className="text-zinc-400">{doc.repairType}</td>
                    <td className="text-right">{formatMoney(doc.outstanding)} <span className="text-zinc-300">/ {formatMoney(doc.liability)}</span></td>
                    <td className="text-right">{doc.linked
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">เดินใน ledger</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-400 border border-zinc-100">ยังไม่แปลง</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
        <Section title="ทางลัด">
          <div className="flex flex-wrap gap-2 text-xs">
            {d.contract && <Shortcut href={`/partner/contracts/${d.contract._id}`} label="สัญญา + เอกสาร PDF" icon={<FileText className="w-3.5 h-3.5" />} />}
            <Shortcut href={`/partner/driver-ledger?q=${d.contractCode}`} label="บัญชีหนี้/เงินสะสม" />
            <Shortcut href={`/partner/trip-fuel`} label="ค่าเที่ยว & เชื้อเพลิง" />
            <Shortcut href={`/partner/vehicle-cost?tab=merged&q=${d.driver?.licensePlate ?? ""}`} label="ประวัติซ่อม/เบิกคลัง" />
            {d.kpi.lastMonth && <Shortcut href={`/partner/payroll/${d.kpi.lastMonth}/${d.contractCode}`} label="แก้ไขงวดล่าสุด" />}
          </div>
        </Section>
      </div>
    </div>
  )
}

const GCOLOR: Record<string, string> = {
  work: "bg-emerald-500", late: "bg-orange-400", half: "bg-emerald-200",
  leave: "bg-amber-300", absent: "bg-red-500", train: "bg-blue-300",
  other: "bg-violet-300", none: "bg-zinc-100 border border-zinc-200",
}

const TH_S = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
// ป้ายแกนกราф: ปีคู่แบบย่อ "26/69"
const shortMonth = (mm: string) => {
  const [y, m] = mm.split("-").map(Number)
  return `${TH_S[m - 1]} ${String(y).slice(-2)}/${String(y + 543).slice(-2)}`
}

const kFmt = (n: number) => {
  const a = Math.abs(n)
  const s = a >= 1000 ? `${(n / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : String(Math.round(n))
  return s
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="bg-white border border-zinc-100 rounded-xl px-4 py-3">
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-100 rounded-xl p-4 break-inside-avoid">
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">{title}</h2>
      {children}
    </div>
  )
}
function Budget({ label, used, budget }: { label: string; used: number; budget: number }) {
  const pct = budget > 0 ? Math.min(100, (used / budget) * 100) : 0
  const over = used > budget && budget > 0
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-zinc-500">{label}</span>
        <span className={over ? "text-red-600 font-medium" : "text-zinc-600"}>{formatMoney(used)} / {formatMoney(budget)}</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
const Empty = ({ text = "ไม่มีข้อมูล" }: { text?: string }) => <p className="text-xs text-zinc-300 text-center py-4">{text}</p>
function Shortcut({ href, label, icon }: { href: string; label: string; icon?: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 border border-zinc-200 rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
      {icon}{label}
    </Link>
  )
}
