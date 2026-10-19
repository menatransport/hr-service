import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { settleLedgerMonth } from "@/lib/partner/driver-ledger"

const DB = PARTNER_DB

/**
 * สถานะรอบเดือนเงินเดือน — 5 ขั้น (ตาม SOP ปิดงวด):
 *   draft (ธุรการจัดทำ) → checked (แผนกรถร่วมตรวจ) → submitted (การเงินส่งอนุมัติ)
 *   → approved (ผู้บริหารอนุมัติ) → locked (ปิดงวด/จ่ายแล้ว)
 * legacy "review" (v1) = checked
 */
export type MonthPhase = "draft" | "checked" | "submitted" | "approved" | "locked"

export const PHASE_FLOW: MonthPhase[] = ["draft", "checked", "submitted", "approved", "locked"]

/** บทบาทที่กด "ไปขั้นถัดไป" ได้ ต่อขั้นปลายทาง */
const ADVANCE_ROLES: Record<Exclude<MonthPhase, "draft">, string[]> = {
  checked:   ["fleet", "admin", "superadmin"],   // แผนกรถร่วมตรวจข้อมูล
  submitted: ["finance", "admin", "superadmin"], // การเงินรวบรวมส่งอนุมัติ
  approved:  ["admin", "superadmin"],            // ผู้บริหาร (C-level)
  locked:    ["admin", "superadmin"],            // ปิดงวดถาวร
}
/** ตีกลับ → draft: บทบาทในสายงาน (ต้องใส่เหตุผล) */
const REJECT_ROLES = ["fleet", "finance", "admin", "superadmin"]

const normalizePhase = (p: string): MonthPhase => (p === "review" ? "checked" : p) as MonthPhase

interface HistoryItem { phase: MonthPhase; by: string; at: string; note?: string; action: "advance" | "reject" | "set" }

/** GET /api/month-status?month=YYYY-MM */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  const client = await clientPromise
  const db     = client.db(DB)

  if (!month) {
    const docs = await db.collection("month_status").find({}).sort({ month: -1 }).toArray()
    return NextResponse.json(docs.map((d) => ({ ...d, phase: normalizePhase(d.phase as string) })))
  }

  const doc = await db.collection("month_status").findOne({ month })
  if (!doc) return NextResponse.json({ month, phase: "draft" as MonthPhase, history: [] })
  return NextResponse.json({ ...doc, phase: normalizePhase(doc.phase as string) })
}

/**
 * POST /api/month-status
 * body: { month, action: "advance" | "reject" | "set", phase?, note? }
 *  - advance: เดินหน้าหนึ่งขั้นตาม flow (ตรวจสิทธิ์ตามขั้นปลายทาง)
 *  - reject : ตีกลับเป็น draft (note บังคับ)
 *  - set    : เซ็ตตรงๆ (admin+ — ใช้แก้สถานการณ์/legacy {month, phase})
 */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const role  = (session.user as { role?: string } | undefined)?.role ?? "viewer"
  const email = session.user?.email ?? "unknown"

  const body = await req.json() as { month?: string; action?: string; phase?: string; note?: string; notes?: string }
  const month = body.month ?? ""
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const client = await clientPromise
  const db     = client.db(DB)
  const now    = new Date().toISOString()
  const cur    = await db.collection("month_status").findOne({ month })
  const curPhase: MonthPhase = cur ? normalizePhase(cur.phase as string) : "draft"
  const note = (body.note ?? body.notes ?? "").trim()
  const action = body.action ?? "set"
  let phase: MonthPhase

  if (action === "advance") {
    const idx = PHASE_FLOW.indexOf(curPhase)
    if (idx >= PHASE_FLOW.length - 1) {
      return NextResponse.json({ error: "งวดนี้ล็อคแล้ว" }, { status: 409 })
    }
    phase = PHASE_FLOW[idx + 1]
    const allowed = ADVANCE_ROLES[phase as Exclude<MonthPhase, "draft">]
    if (!allowed.includes(role)) {
      return NextResponse.json({ error: `ขั้นนี้ต้องเป็นบทบาท: ${allowed.join(" / ")}` }, { status: 403 })
    }
  } else if (action === "reject") {
    if (!REJECT_ROLES.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    // ห้ามตีกลับข้ามโซ่: มีงวดถัดไปที่อนุมัติ/ปิดแล้ว → ต้องปลดล็อคงวดล่าสุดก่อน (ไล่จากปลายโซ่)
    const later = await db.collection("month_status").findOne(
      { month: { $gt: month }, phase: { $in: ["approved", "locked"] } }, { projection: { month: 1 } })
    if (later) {
      return NextResponse.json({ error: `ตีกลับไม่ได้ — งวด ${later.month} อนุมัติ/ปิดแล้ว ต้องปลดล็อคงวดล่าสุดก่อนไล่ย้อนลงมา` }, { status: 409 })
    }
    if (curPhase === "locked" && !["admin", "superadmin"].includes(role)) {
      return NextResponse.json({ error: "งวดล็อคแล้ว — ปลดล็อคได้เฉพาะแอดมิน" }, { status: 403 })
    }
    if (!note) return NextResponse.json({ error: "ตีกลับต้องระบุเหตุผล" }, { status: 400 })
    phase = "draft"
  } else {
    if (!["admin", "superadmin"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const p = normalizePhase(body.phase ?? "")
    if (!PHASE_FLOW.includes(p)) {
      return NextResponse.json({ error: `phase must be one of: ${PHASE_FLOW.join(", ")}` }, { status: 400 })
    }
    phase = p
  }

  const hist: HistoryItem = { phase, by: email, at: now, action: action as HistoryItem["action"], ...(note ? { note } : {}) }
  await db.collection("month_status").updateOne(
    { month },
    {
      $set: { month, phase, notes: note, updatedAt: now, updatedBy: email },
      $push: { history: hist as never },
    },
    { upsert: true }
  )

  // ── ปิดเดือน: phase → approved/locked → ตัดยอด ledger (หนี้/เงินสะสม พขร.) ──
  // idempotent: settleLedgerMonth ข้าม (entryId, month) ที่ตัดไปแล้ว จึงยิงซ้ำได้
  let ledgerSettlement: { contracts: number; settled: number; total: number } | undefined
  if (phase === "approved" || phase === "locked") {
    const codes: string[] = await db.collection("driver_ledger")
      .distinct("contractCode", { status: "active", startMonth: { $lte: month } })
    let settled = 0
    let total   = 0
    for (const code of codes) {
      const r = await settleLedgerMonth(db, code, month, `month-close:${month}`)
      settled += r.settled
      total   += r.total
    }
    ledgerSettlement = { contracts: codes.length, settled, total: Math.round(total * 100) / 100 }
  }

  return NextResponse.json({ ok: true, month, phase, ...(ledgerSettlement ? { ledgerSettlement } : {}) })
}
