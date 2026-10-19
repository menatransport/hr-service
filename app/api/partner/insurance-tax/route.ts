import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { logActivity } from "@/lib/partner/activity-log"
import {
  normPlateIT,
  cycleDisplayStatus,
  ITEM_TYPES,
  type ItemType,
  type InsuranceItem,
} from "@/lib/partner/insurance-tax"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type ItemStatus = "active" | "expiring" | "expired" | "none"
const WORST_RANK: Record<ItemStatus, number> = { none: 0, active: 1, expiring: 2, expired: 3 }

export async function GET(req: NextRequest) {
  const pdb = await partnerDb()
  const db     = pdb
  const plate  = req.nextUrl.searchParams.get("plate")?.trim()

  // ── GET ?plate=… → ประวัติ item docs ทุกประเภทของทะเบียนนั้น ใหม่สุดก่อน ──
  // (client จัดกลุ่มตาม itemType เอง; docs bundled เก่าไม่มี itemType → exclude)
  if (plate) {
    const platePlain = normPlateIT(plate) || plate
    const items = await       partnerColOf(db, "vehicleInsuranceTax")
      .find({ platePlain, itemType: { $exists: true } })
      .sort({ createdAt: -1 })
      .toArray()
    return NextResponse.json({ items })
  }

  // ── GET (no params) → ทุกทะเบียนจาก vehicle_master + item ล่าสุดต่อประเภท ──
  const [vehicles, itemDocs, activeContracts] = await Promise.all([
    partnerColOf(db, "vehicleMaster")
      .find({})
      .project({ licensePlate: 1, truckNumber: 1, brand: 1, model: 1 })
      .toArray(),
    partnerColOf(db, "vehicleInsuranceTax")
      .find({ itemType: { $exists: true } })
      .sort({ createdAt: -1 })
      .toArray(),
    partnerColOf(db, "contracts")
      .find({ status: "active" })
      .project({ licensePlate: 1, driverName: 1, contractCode: 1 })
      .toArray(),
  ])

  // item ล่าสุดที่ status "active" ต่อ (platePlain, itemType) — docs เรียง createdAt desc แล้ว
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestByPlateType = new Map<string, any>()
  for (const d of itemDocs) {
    if (d.status !== "active") continue
    const key = `${d.platePlain}|${d.itemType}`
    if (!latestByPlateType.has(key)) latestByPlateType.set(key, d)
  }

  // สัญญา active ต่อทะเบียน (normalized)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contractByPlate = new Map<string, any>()
  for (const ct of activeContracts) {
    const p = normPlateIT(ct.licensePlate)
    if (p && !contractByPlate.has(p)) contractByPlate.set(p, ct)
  }

  const today  = new Date().toISOString().slice(0, 10)
  const counts = { total: 0, active: 0, expiring: 0, expired: 0, none: 0 }

  const items = vehicles.map((v) => {
    const platePlain = normPlateIT(v.licensePlate)
    const contract   = contractByPlate.get(platePlain)

    const perType    = {} as Record<ItemType, InsuranceItem | null>
    const itemStatus = {} as Record<ItemType, ItemStatus>
    let worst: ItemStatus = "none"
    for (const t of ITEM_TYPES) {
      const doc = latestByPlateType.get(`${platePlain}|${t}`) ?? null
      perType[t] = doc
      // doc เป็น status "active" เสมอ → cycleDisplayStatus คืนได้แค่ active/expiring/expired
      const st = doc ? (cycleDisplayStatus(doc, today) as ItemStatus) : "none"
      itemStatus[t] = st
      if (WORST_RANK[st] > WORST_RANK[worst]) worst = st
    }

    counts.total++
    counts[worst]++

    return {
      licensePlate: v.licensePlate,
      platePlain,
      truckNumber:  v.truckNumber,
      brand:        v.brand,
      model:        v.model,
      driverName:   contract?.driverName,
      contractCode: contract?.contractCode,
      items:        perType,
      itemStatus,
      worstStatus:  worst,
    }
  })

  return NextResponse.json({ items, counts })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildItemDoc(body: Record<string, any>, licensePlate: string, platePlain: string, now: string): InsuranceItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, updatedAt, status, bulk, items, ...rest } = body
  return {
    ...rest,
    licensePlate,
    platePlain,
    itemType: body.itemType,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const body = await req.json()

  if (!body.licensePlate) {
    return NextResponse.json({ error: "licensePlate required" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "vehicleInsuranceTax")
  const now    = new Date().toISOString()

  const licensePlate = body.licensePlate as string
  const platePlain   = normPlateIT(licensePlate) || licensePlate

  const session = await getPartnerSession()
  const editedBy = { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined }
  const logAdd = (d: InsuranceItem) =>
    logActivity({
      entity: "insurance_tax",
      entityId: platePlain,
      action: "add",
      changes: {
        ประเภท:       { from: null, to: d.itemType },
        ...(d.amount != null ? { amount: { from: null, to: d.amount } } : {}),
        ...(d.effectiveDate ? { effectiveDate: { from: null, to: d.effectiveDate } } : {}),
        ...(d.expiryDate ? { expiryDate: { from: null, to: d.expiryDate } } : {}),
      },
      editedBy,
    })

  // ── bulk: ต่อทั้งชุด (สูงสุด 4 รายการ คนละ itemType) ─────────────────────
  if (body.bulk === true) {
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 4) {
      return NextResponse.json({ error: "items must be an array of 1-4 entries" }, { status: 400 })
    }
    for (const it of body.items) {
      if (!ITEM_TYPES.includes(it?.itemType)) {
        return NextResponse.json({ error: `invalid itemType: ${it?.itemType}` }, { status: 400 })
      }
    }
    const docs = body.items.map((it: Record<string, unknown>) =>
      buildItemDoc({ ...it, licensePlate }, licensePlate, platePlain, now)
    )
    // รอบใหม่แทนที่รอบเก่าของแต่ละ itemType (เก็บประวัติเป็น renewed)
    await col.updateMany(
      { platePlain, itemType: { $in: docs.map((d: InsuranceItem) => d.itemType) }, status: "active" },
      { $set: { status: "renewed", updatedAt: now } }
    )
    const res = await col.insertMany(docs as never[])
    const inserted = docs.map((d: InsuranceItem, i: number) => ({ ...d, _id: res.insertedIds[i] }))
    await Promise.all(docs.map((d: InsuranceItem) => logAdd(d)))
    return NextResponse.json({ inserted }, { status: 201 })
  }

  // ── single item ───────────────────────────────────────────────────────────
  if (!ITEM_TYPES.includes(body.itemType)) {
    return NextResponse.json(
      { error: `itemType must be one of: ${ITEM_TYPES.join(", ")}` },
      { status: 400 }
    )
  }

  const doc = buildItemDoc(body, licensePlate, platePlain, now)

  // รอบใหม่แทนที่รอบเก่าของ itemType เดียวกัน — mark เป็น renewed (เก็บประวัติไว้)
  await col.updateMany(
    { platePlain, itemType: doc.itemType, status: "active" },
    { $set: { status: "renewed", updatedAt: now } }
  )

  const result = await col.insertOne(doc as never)
  await logAdd(doc)
  return NextResponse.json({ ...doc, _id: result.insertedId }, { status: 201 })
}
