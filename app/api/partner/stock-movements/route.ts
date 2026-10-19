import { NextRequest, NextResponse } from "next/server"
import { ObjectId, AnyBulkWriteOperation } from "mongodb"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q     = searchParams.get("q")?.trim()     ?? ""
  const group = searchParams.get("group")?.trim() ?? ""

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (group) filter.itemGroup = group

  if (q) {
    filter["$or"] = [
      { itemName:     { $regex: q, $options: "i" } },
      { itemCode:     { $regex: q, $options: "i" } },
      { itemGroup:    { $regex: q, $options: "i" } },
      { truckNumber:  { $regex: q, $options: "i" } },
      { driverName:   { $regex: q, $options: "i" } },
      { licensePlate: { $regex: q, $options: "i" } },
      { mr:           { $regex: q, $options: "i" } },
      { wd:           { $regex: q, $options: "i" } },
      { purpose:      { $regex: q, $options: "i" } },
    ]
  }

  const pdb = await partnerDb()
  const db     = pdb

  const docs = await     partnerColOf(db, "stockMovements")
    .find(filter)
    .sort({ date: -1, wd: 1 })
    .toArray()

  return NextResponse.json(docs.map((d) => ({ ...d, _id: d._id.toString() })))
}

// PATCH — bulk-set promoType on multiple movement items at once
export async function PATCH(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const body = await req.json() as { updates?: { id: string; promoType?: string; pmType?: string; chargeAmount?: number | null; chargeMonth?: string | null }[] }
  const updates = body.updates ?? []

  if (updates.length === 0) {
    return NextResponse.json({ error: "updates required" }, { status: 400 })
  }
  for (const u of updates) {
    if (u.promoType !== undefined && !["", "repair", "pm"].includes(u.promoType)) {
      return NextResponse.json({ error: `invalid promoType: ${u.promoType}` }, { status: 400 })
    }
    // pmType ระบุประเภทสิทธิ์เมื่อ promoType = "pm" (ทำให้ป้าย PM1/PM2 ติดจากคลังได้)
    if (u.pmType !== undefined && !["", "PM1", "PM2"].includes(u.pmType)) {
      return NextResponse.json({ error: `invalid pmType: ${u.pmType}` }, { status: 400 })
    }
    // เคาะเก็บ พขร. รายบรรทัด: chargeAmount = ยอดเก็บจริง (null = ใช้ default), chargeMonth = งวดที่เก็บ
    if (u.chargeMonth !== undefined && u.chargeMonth !== null && !/^\d{4}-\d{2}$/.test(u.chargeMonth)) {
      return NextResponse.json({ error: `invalid chargeMonth: ${u.chargeMonth}` }, { status: 400 })
    }
  }

  const pdb = await partnerDb()
  const now    = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ops: AnyBulkWriteOperation<any>[] = updates.map((u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const $set: any = { updatedAt: now }
    const $unset: Record<string, ""> = {}
    if (u.promoType !== undefined) {
      $set.promoType = u.promoType
      $set.pmType = u.promoType === "pm" ? (u.pmType ?? "") : ""
    }
    if (u.chargeAmount !== undefined) {
      if (u.chargeAmount === null) $unset.chargeAmount = ""
      else $set.chargeAmount = Math.round((Number(u.chargeAmount) || 0) * 100) / 100
    }
    if (u.chargeMonth !== undefined) {
      if (u.chargeMonth === null) $unset.chargeMonth = ""
      else $set.chargeMonth = u.chargeMonth
    }
    return {
      updateOne: {
        filter: { _id: new ObjectId(u.id) },
        update: { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
      },
    }
  })

  const result = await     partnerColOf(pdb, "stockMovements")
    .bulkWrite(ops)

  return NextResponse.json({ ok: true, modified: result.modifiedCount, matched: result.matchedCount })
}
