import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { TF_COLL, TF_CONFIG, DEFAULT_CONFIG, aggregateFromBI, computeRow, plateContractMap, type TripFuelConfig } from "@/lib/partner/trip-fuel"
import { partnerColOf, type AnyDoc } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

const MONTH_RE = /^\d{4}-\d{2}$/

/* eslint-disable @typescript-eslint/no-explicit-any */

async function getConfig(db: any, month: string): Promise<TripFuelConfig> {
  const c = await (partnerColOf(db, "tripFuelConfig") as AnyDoc).findOne({ month })
  if (c) return { ...DEFAULT_CONFIG, ...c, month }
  // เดือนใหม่ — สืบทอดราคาจากเดือนล่าสุดที่เคยตั้ง
  const prev = await (partnerColOf(db, "tripFuelConfig") as AnyDoc).find({}).sort({ month: -1 }).limit(1).toArray()
  return { ...DEFAULT_CONFIG, ...(prev[0] ?? {}), month }
}

// GET ?month=YYYY-MM → { config, rows }
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month") ?? ""
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month=YYYY-MM required" }, { status: 400 })
  const pdb = await partnerDb()
  const db = pdb
  const [config, rows] = await Promise.all([
    getConfig(db, month),
    partnerColOf(db, "tripFuelMonthly").find({ month }).sort({ driverName: 1 }).toArray(),
  ])
  return NextResponse.json({ config, rows: rows.map((r: any) => ({ ...r, _id: r._id.toString() })) })
}

// PUT — บันทึก config ราคาของเดือน แล้วคำนวณทุกแถวใหม่
export async function PUT(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body = await req.json() as Partial<TripFuelConfig> & { month?: string }
  const month = body.month ?? ""
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "month required" }, { status: 400 })
  const pdb = await partnerDb()
  const db = pdb
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })
  const cfg: TripFuelConfig = { ...DEFAULT_CONFIG, ...(await getConfig(db, month)), ...body, month }
  const { month: _m, ...cfgSet } = cfg as any
  void _m
  await partnerColOf(db, "tripFuelConfig").updateOne({ month }, { $set: { ...cfgSet, month, updatedAt: new Date().toISOString() } }, { upsert: true })
  // recompute ทุกแถวของเดือน
  const rows = await partnerColOf(db, "tripFuelMonthly").find({ month }).toArray()
  for (const r of rows) {
    const c = computeRow(r, cfg)
    await partnerColOf(db, "tripFuelMonthly").updateOne({ _id: r._id }, { $set: {
      dieselUsed: c.dieselUsed, dieselOver: c.dieselOver, dieselUnder: c.dieselUnder,
      ngvUsed: c.ngvUsed, ngvOver: c.ngvOver, ngvUnder: c.ngvUnder,
      overRaw: c.overRaw, overMoney: c.overMoney, underMoney: c.underMoney,
      fuelDeduct: c.fuelDeduct, netAfterFuel: c.netAfterFuel,
    } })
  }
  return NextResponse.json({ ok: true, recomputed: rows.length })
}

// POST { month, action: "sync" } — ดึงสรุปจาก BI (เก็บค่าที่แก้มือไว้: ยกเข้า/ยกออก/หมายเหตุ)
export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const { month, action } = await req.json() as { month?: string; action?: string }
  if (!MONTH_RE.test(month ?? "") || action !== "sync") {
    return NextResponse.json({ error: "month + action:'sync' required" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  if (await monthClosed(db, month!)) return NextResponse.json(closedError(month!), { status: 423 })
  const cfg = await getConfig(db, month!)
  const [agg, pMap, existing] = await Promise.all([
    aggregateFromBI(pdb, month!),
    plateContractMap(db),
    partnerColOf(db, "tripFuelMonthly").find({ month }).toArray(),
  ])
  const manual = new Map(existing.map((r: any) => [r.driverName, r]))
  const now = new Date().toISOString()
  const { normPlate } = await import("@/lib/partner/promo-usage")

  let upserted = 0
  for (const d of agg.drivers) {
    const old: any = manual.get(d.driverName) ?? {}
    const base = {
      month, ...d,
      contractCode: pMap.get(normPlate(d.licensePlate)) ?? old.contractCode ?? "",
      // ค่าที่ทีมกรอกมือ — คงไว้ตอน re-sync
      dieselCarryIn: old.dieselCarryIn ?? 0, dieselCarryOut: old.dieselCarryOut ?? 0,
      ngvCarryIn: old.ngvCarryIn ?? 0, ngvCarryOut: old.ngvCarryOut ?? 0,
      notes: old.notes ?? "",
      syncedAt: now,
    }
    const c = computeRow(base, cfg)
    await partnerColOf(db, "tripFuelMonthly").updateOne(
      { month, driverName: d.driverName },
      { $set: c },
      { upsert: true }
    )
    upserted++
  }
  return NextResponse.json({ ok: true, biRows: agg.rows, drivers: upserted })
}

// PATCH { id, ...fields } — แก้ยกเข้า/ยกออก/สัญญา/หมายเหตุ รายแถว แล้วคำนวณใหม่
export async function PATCH(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body = await req.json() as any
  const id = body.id as string
  if (!id || !ObjectId.isValid(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const pdb = await partnerDb()
  const db = pdb
  const row = await partnerColOf(db, "tripFuelMonthly").findOne({ _id: new ObjectId(id) })
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 })
  if (await monthClosed(db, row.month as string)) return NextResponse.json(closedError(row.month as string), { status: 423 })
  const cfg = await getConfig(db, row.month as string)
  const editable = ["dieselCarryIn", "dieselCarryOut", "ngvCarryIn", "ngvCarryOut", "contractCode", "notes"] as const
  const patch: any = {}
  for (const k of editable) if (body[k] !== undefined) patch[k] = k === "contractCode" || k === "notes" ? String(body[k]) : Number(body[k]) || 0
  const c = computeRow({ ...row, ...patch }, cfg)
  await partnerColOf(db, "tripFuelMonthly").updateOne({ _id: row._id }, { $set: { ...patch,
    dieselUsed: c.dieselUsed, dieselOver: c.dieselOver, dieselUnder: c.dieselUnder,
    ngvUsed: c.ngvUsed, ngvOver: c.ngvOver, ngvUnder: c.ngvUnder,
    overRaw: c.overRaw, overMoney: c.overMoney, underMoney: c.underMoney,
    fuelDeduct: c.fuelDeduct, netAfterFuel: c.netAfterFuel,
  } })
  return NextResponse.json({ ok: true })
}
