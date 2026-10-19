import { NextRequest, NextResponse } from "next/server"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

const norm = (s: string) => (s ?? "").replace(/\s+/g, "").replace(/^สบ\.?/, "").trim()

/**
 * GET /api/promotions/master
 *   • ไม่ส่ง plate  → คืน array โปรโมชั่นตั้งต้นทุกคัน (ใช้ใน /contracts/new)
 *   • ส่ง ?plate=   → คืน { found, summary, ... } ของรถคันนั้น (ใช้ในใบเสนอราคา /quotations)
 */
export async function GET(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get("plate")?.trim() ?? ""
  const pdb = await partnerDb()
  const db = pdb
  const all = await partnerColOf(db, "promotionMaster").find({}).sort({ licensePlate: 1 }).toArray()

  // ── ไม่ระบุทะเบียน → array ทั้งหมด (backward-compatible กับ contracts/new) ──
  if (!plate) {
    return NextResponse.json(all.map((d) => ({
      licensePlate:           d.licensePlate,
      pro1FreeCount:          d.pro1FreeCount,
      pro1TotalValue:         d.pro1TotalValue,
      pro1InstallmentValue:   d.pro1InstallmentValue,
      pro1Condition:          d.pro1Condition,
      pro1FreeAtInstallments: d.pro1FreeAtInstallments,
      pro2RepairBudget:       d.pro2RepairBudget,
      pro3AnnualPm:           d.pro3AnnualPm,
    })))
  }

  // ── ระบุทะเบียน → สรุปข้อความพร้อมใช้ในใบเสนอราคา ──
  const m = all.find((p) => norm(p.licensePlate as string) === norm(plate))
  if (!m) return NextResponse.json({ found: false, summary: "" })
  const n = (v: unknown) => (typeof v === "number" ? v : 0)
  const fm = (v: number) => v.toLocaleString("th-TH")
  const lines: string[] = []
  if (n(m.pro1TotalValue) > 0 || m.pro1Condition) {
    const cond = (m.pro1Condition as string) || "ฟรีค่างวด"
    lines.push(`ฟรีค่างวด (${cond})${n(m.pro1FreeCount) ? ` ฟรี ${m.pro1FreeCount} งวด` : ""}${n(m.pro1TotalValue) ? ` รวม ${fm(n(m.pro1TotalValue))} บาท` : ""}`)
  }
  if (n(m.pro2RepairBudget) > 0) lines.push(`ฟรีค่าซ่อมบำรุง วงเงิน ${fm(n(m.pro2RepairBudget))} บาท`)
  if (n(m.pro3AnnualPm) > 0) lines.push(`ฟรี PM (บำรุงรักษาเชิงป้องกัน) ${fm(n(m.pro3AnnualPm))} บาท/ปี ตลอดสัญญา`)
  return NextResponse.json({
    found: true, summary: lines.join(" · "),
    pro1TotalValue: n(m.pro1TotalValue), pro2RepairBudget: n(m.pro2RepairBudget), pro3AnnualPm: n(m.pro3AnnualPm),
  })
}
