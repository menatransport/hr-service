import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { EXTRA_TYPE_MAP } from "@/lib/partner/payroll-extras"
import { normPlate } from "@/lib/partner/promo-usage"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
const MONTH_RE = /^\d{4}-\d{2}$/

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? ""
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 })
  const pdb = await partnerDb()
  const rows = await partnerColOf(pdb, "payrollExtras").find({ month }).sort({ kind: 1, type: 1, driverName: 1 }).toArray()
  return NextResponse.json(rows.map((r: any) => ({ ...r, _id: r._id.toString() })))
}

// POST — เพิ่มรายการเดี่ยว { month, type, contractCode?, driverName?, licensePlate?, amount, wht?, note? }
// หรือ batch นำเข้า { month, type, action: "import", lines: [{ ref, amount, note? }] } — ref = สัญญา/ทะเบียน/ชื่อ
export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body = await req.json() as any
  const month = String(body.month ?? "")
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month ไม่ถูกต้อง" }, { status: 400 })

  const pdb = await partnerDb()
  const db = pdb
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })
  const session = await getPartnerSession()
  const now = new Date().toISOString()
  const by = session?.user?.email ?? "unknown"

  // ── คัดลอกรายการประจำจากเดือนก่อน (standing charges เช่น รับสภาพหนี้จราจร 1,000/คน) ──
  // ข้ามรายการที่เดือนปลายทางมี (contractCode+label+kind) เดิมอยู่แล้ว — กดซ้ำได้
  if (body.action === "copy-month") {
    const from = String(body.from ?? "")
    if (!MONTH_RE.test(from)) return NextResponse.json({ error: "from (YYYY-MM) required" }, { status: 400 })
    const labels: string[] = Array.isArray(body.labels) ? body.labels.filter((l: unknown) => typeof l === "string" && l) : []
    const src = await partnerColOf(db, "payrollExtras").find({ month: from, ...(labels.length ? { label: { $in: labels } } : {}) }).toArray()
    const existing = await partnerColOf(db, "payrollExtras").find({ month }).project({ contractCode: 1, label: 1, kind: 1 }).toArray()
    const seen = new Set(existing.map((e) => `${e.contractCode}|${e.label}|${e.kind}`))
    const docs = src.filter((sd) => !seen.has(`${sd.contractCode}|${sd.label}|${sd.kind}`))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ _id, ...sd }) => ({ ...sd, month, importBatch: `copy-${from}`, createdAt: now, createdBy: by }))
    if (docs.length) await partnerColOf(db, "payrollExtras").insertMany(docs as never[])
    return NextResponse.json({ ok: true, copied: docs.length, skipped: src.length - docs.length, from, to: month })
  }

  const t = EXTRA_TYPE_MAP[String(body.type ?? "")]
  if (!t) return NextResponse.json({ error: "type ไม่ถูกต้อง" }, { status: 400 })

  if (body.action === "import") {
    // จับคู่ ref → สัญญา: รหัสสัญญา > ทะเบียน (normalize) > ชื่อคนขับ
    const contracts = await partnerColOf(db, "contracts").find({})
      .project({ contractCode: 1, licensePlate: 1, driverName: 1, buyerName: 1, status: 1 }).toArray()
    const byCC = new Map(contracts.map((c: any) => [String(c.contractCode).toUpperCase(), c]))
    const byPlate = new Map<string, any>()
    const byName = new Map<string, any>()
    for (const c of contracts) {
      const p = normPlate(c.licensePlate as string)
      if (p && (!byPlate.has(p) || c.status === "active")) byPlate.set(p, c)
      for (const n of [c.driverName, c.buyerName]) {
        const k = String(n ?? "").replace(/\s+/g, "").trim()
        if (k && (!byName.has(k) || c.status === "active")) byName.set(k, c)
      }
    }
    const lines = Array.isArray(body.lines) ? body.lines : []
    const docs: any[] = []
    const unmatched: any[] = []
    const batch = `imp-${Date.now()}`
    for (const ln of lines) {
      const ref = String(ln.ref ?? "").trim()
      const amount = Number(ln.amount) || 0
      if (!ref || amount === 0) continue
      const c = byCC.get(ref.toUpperCase()) ?? byPlate.get(normPlate(ref)) ?? byName.get(ref.replace(/\s+/g, ""))
      if (!c) { unmatched.push({ ref, amount }); continue }
      docs.push({
        month, kind: t.kind, type: t.key, label: t.label,
        contractCode: c.contractCode, driverName: c.driverName ?? c.buyerName, licensePlate: c.licensePlate,
        amount: Math.round(amount * 100) / 100,
        wht: body.wht !== undefined ? !!body.wht : t.wht,
        note: String(ln.note ?? "").trim() || null,
        source: "import", importBatch: batch, createdBy: by, createdAt: now,
      })
    }
    if (body.preview === true) return NextResponse.json({ matched: docs.length, unmatched, sample: docs.slice(0, 5) })
    if (docs.length > 0) await partnerColOf(db, "payrollExtras").insertMany(docs)
    return NextResponse.json({ ok: true, inserted: docs.length, unmatched })
  }

  // เพิ่มเดี่ยว
  const amount = Number(body.amount) || 0
  const contractCode = String(body.contractCode ?? "").trim()
  if (!contractCode || amount === 0) return NextResponse.json({ error: "contractCode + amount required" }, { status: 400 })
  await partnerColOf(db, "payrollExtras").insertOne({
    month, kind: t.kind, type: t.key, label: t.label,
    contractCode, driverName: String(body.driverName ?? "").trim() || null,
    licensePlate: String(body.licensePlate ?? "").trim() || null,
    amount: Math.round(amount * 100) / 100,
    wht: body.wht !== undefined ? !!body.wht : t.wht,
    note: String(body.note ?? "").trim() || null,
    source: "manual", createdBy: by, createdAt: now,
  })
  return NextResponse.json({ ok: true })
}

// PATCH { id, amount?, wht?, note? }
export async function PATCH(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body = await req.json() as any
  if (!body.id || !ObjectId.isValid(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const $set: any = {}
  if (body.amount !== undefined) $set.amount = Math.round((Number(body.amount) || 0) * 100) / 100
  if (body.wht !== undefined) $set.wht = !!body.wht
  if (body.note !== undefined) $set.note = String(body.note).trim() || null
  const pdb = await partnerDb()
  const _doc = await partnerColOf(pdb, "payrollExtras").findOne({ _id: new ObjectId(body.id) }, { projection: { month: 1 } })
  if (_doc && await monthClosed(pdb, _doc.month as string)) return NextResponse.json(closedError(_doc.month as string), { status: 423 })
  await partnerColOf(pdb, "payrollExtras").updateOne({ _id: new ObjectId(body.id) }, { $set })
  return NextResponse.json({ ok: true })
}

// DELETE { id } | { importBatch } — middleware บังคับ admin+
export async function DELETE(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const body = await req.json() as any
  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "payrollExtras")
  if (body.importBatch) {
    const _b = await col.findOne({ importBatch: String(body.importBatch) }, { projection: { month: 1 } })
    if (_b && await monthClosed(pdb, _b.month as string)) return NextResponse.json(closedError(_b.month as string), { status: 423 })
    const r = await col.deleteMany({ importBatch: String(body.importBatch) })
    return NextResponse.json({ ok: true, deleted: r.deletedCount })
  }
  if (!body.id || !ObjectId.isValid(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const _d = await col.findOne({ _id: new ObjectId(body.id) }, { projection: { month: 1 } })
  if (_d && await monthClosed(pdb, _d.month as string)) return NextResponse.json(closedError(_d.month as string), { status: 423 })
  await col.deleteOne({ _id: new ObjectId(body.id) })
  return NextResponse.json({ ok: true })
}
