import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { logActivity } from "@/lib/partner/activity-log"
import { resolveRole } from "@/lib/partner/roles"
import { hasPerm } from "@/lib/partner/rbac"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"

const DB = PARTNER_DB

export async function GET() {
  const client = await clientPromise
  const db     = client.db(DB)

  const [docs, vehicles, contracts] = await Promise.all([
    db.collection("master_price_list").find({}).sort({ licensePlate: 1 }).toArray(),
    db.collection("vehicle_master").find({}, { projection: { licensePlate: 1, status: 1, brand: 1, model: 1, truckNumber: 1, photoUrl: 1, photos: 1 } }).toArray(),
    db.collection("contracts").find({ status: "active" }, { projection: { licensePlate: 1 } }).toArray(),
  ])

  const vehicleStatus  = new Map(vehicles.map((v) => [v.licensePlate as string, (v.status as string) ?? "active"]))
  const vehicleInfo    = new Map(vehicles.map((v) => [v.licensePlate as string, v]))
  const activeContracts = new Set(contracts.map((c) => c.licensePlate as string))

  return NextResponse.json(
    docs.map((d) => {
      const plate = d.licensePlate as string
      const hasContract = activeContracts.has(plate)
      const vStatus     = vehicleStatus.get(plate) ?? "active"
      const status      = hasContract ? "contract" : vStatus   // "contract" | "active" | "inactive"
      const vi          = vehicleInfo.get(plate)
      return {
        licensePlate:         plate,
        status,
        vehicleBrand:         (vi?.brand as string) ?? "",
        vehicleModel:         (vi?.model as string) ?? "",
        truckNumber:          (vi?.truckNumber as string) ?? "",
        photoUrl:             (vi?.photoUrl as string) ?? "",
        photos:               (vi?.photos as Record<string, string>) ?? {},
        // สถานะความพร้อมขาย + ช่วงซ่อม (แก้ได้จากหน้า price-list)
        saleStatus:           d.saleStatus  ?? null,
        repairStart:          d.repairStart ?? null,
        repairEnd:            d.repairEnd   ?? null,
        downPayment:          d.downPayment,
        cashDown:             d.cashDown,
        remainingInstallment: d.remainingInstallment,
        downInstallmentCount: d.downInstallmentCount,
        downInstallmentAmt:   d.downInstallmentAmt,
        financeInstallments:  d.financeInstallments,
        monthlyPayment:       d.monthlyPayment,
        financeAmount:        d.financeAmount,
        totalSalePrice:       d.totalSalePrice,
      }
    })
  )
}

// ── POST: เพิ่มรายการราคาขายใหม่ (ทะเบียนต้องยังไม่มีใน price list) ──
const NUM_FIELDS = [
  "totalSalePrice", "downPayment", "cashDown", "remainingInstallment",
  "downInstallmentCount", "downInstallmentAmt", "financeAmount",
  "financeInstallments", "monthlyPayment",
] as const

export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  const role = await resolveRole(session?.user?.email)
  if (!hasPerm(role, "masterdata"))
    return NextResponse.json({ error: "ไม่มีสิทธิ์เพิ่มราคาขาย" }, { status: 403 })

  const body = await req.json() as Record<string, unknown>
  const plate = String(body.licensePlate ?? "").trim()
  if (!plate) return NextResponse.json({ error: "licensePlate required" }, { status: 400 })

  const client = await clientPromise
  const col = client.db(DB).collection("master_price_list")

  const dup = await col.findOne({ licensePlate: plate }, { projection: { _id: 1 } })
  if (dup) return NextResponse.json({ error: "ทะเบียนนี้มีราคาขายอยู่แล้ว" }, { status: 409 })

  const doc: Record<string, unknown> = { licensePlate: plate }
  for (const k of NUM_FIELDS) {
    const v = body[k]
    doc[k] = v === null || v === undefined || v === "" ? null : Number(v)
  }
  const now = new Date().toISOString()
  doc.createdAt = now
  doc.updatedAt = now

  await col.insertOne(doc)

  await logActivity({
    entity: "price_list",
    entityId: plate,
    action: "create",
    changes: Object.fromEntries(NUM_FIELDS.map((k) => [k, { from: null, to: doc[k] }])),
    editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
  })

  revalidatePublicTrucks()   // เพิ่มแถวราคา = รถขึ้นหน้าเว็บได้
  return NextResponse.json({ ok: true })
}
