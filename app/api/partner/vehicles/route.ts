import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "vehicle_master"

// normalize ทะเบียน — ตัดคำนำหน้าที่ไม่ใช่เลข (สบ.71-1956 → 71-1956) เทียบกันแบบ digits
const normPlate = (p?: string | null) => (p ?? "").replace(/^[^0-9]*/, "").trim()

/** หารถที่ทะเบียนซ้ำ (normalize) — คืน doc ถ้าเจอ */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findPlateDuplicate(db: any, plate: string) {
  const key = normPlate(plate)
  if (!key) return null
  const rows = await db.collection(COLL).find({}, { projection: { licensePlate: 1 } }).toArray()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.find((v: any) => normPlate(v.licensePlate) === key) ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q      = searchParams.get("q")?.trim() ?? ""
  const status = searchParams.get("status")?.trim() ?? ""

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (q) {
    filter["$or"] = [
      { licensePlate:  { $regex: q, $options: "i" } },
      { truckNumber:   { $regex: q, $options: "i" } },
      { brand:         { $regex: q, $options: "i" } },
      { model:         { $regex: q, $options: "i" } },
      { chassisNumber: { $regex: q, $options: "i" } },
      { engineNumber:  { $regex: q, $options: "i" } },
      { vehicleType:   { $regex: q, $options: "i" } },
    ]
  }
  if (status) filter.status = status

  const client = await clientPromise
  const db     = client.db(DB)
  const [items, contracts, prices] = await Promise.all([
    db.collection(COLL).find(filter).sort({ truckNumber: 1, licensePlate: 1 }).toArray(),
    db.collection("contracts").find({ status: "active" }, { projection: { licensePlate: 1, contractCode: 1 } }).toArray(),
    db.collection("master_price_list").find({}, { projection: { licensePlate: 1, saleStatus: 1 } }).toArray(),
  ])

  // fleetState (derived): working = ทะเบียนมีสัญญา active · ready = ว่าง + saleStatus ready
  // · preparing = ว่าง + ยังไม่พร้อม (รอซ่อม/ยังไม่เริ่ม/ไม่ระบุ/ไม่มีแถวราคา) · inactive = vehicle.status inactive
  const contractByPlate = new Map<string, string>()
  for (const c of contracts) {
    const k = normPlate(c.licensePlate as string)
    if (k && !contractByPlate.has(k)) contractByPlate.set(k, String(c.contractCode ?? ""))
  }
  const saleByPlate = new Map<string, string | null>()
  for (const r of prices) {
    const k = normPlate(r.licensePlate as string)
    if (k) saleByPlate.set(k, (r.saleStatus as string | null) ?? null)
  }
  const enriched = items.map((v) => {
    const k = normPlate(v.licensePlate as string)
    const contractCode = contractByPlate.get(k)
    const saleStatus   = saleByPlate.has(k) ? saleByPlate.get(k) : null
    const fleetState =
      v.status === "inactive"     ? "inactive" :
      contractCode !== undefined  ? "working" :
      saleStatus === "ready"      ? "ready" : "preparing"
    return { ...v, fleetState, saleStatus, contractCode: contractCode || undefined }
  })

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    truckType?:        string
    vehicleType?:      string
    characteristic?:   string
    brand?:            string
    model?:            string
    registrationDate?: string
    color?:            string
    licensePlate?:     string
    truckNumber?:      string
    chassisNumber?:    string
    engineNumber?:     string
    engineSize?:           string
    status?:               string
    registrationDocUrl?:   string
    photoUrl?:             string
    photos?:               { front?: string; back?: string; left?: string; right?: string; cabin?: string }
    dataComplete?:         boolean
    dataExpectedDate?:     string
  }

  const now = new Date()
  const client = await clientPromise
  const db = client.db(DB)

  // กันทะเบียนซ้ำ
  const plate = body.licensePlate?.trim() ?? ""
  if (plate) {
    const dup = await findPlateDuplicate(db, plate)
    if (dup) return NextResponse.json({ error: `ทะเบียน ${plate} มีอยู่แล้วในระบบ` }, { status: 409 })
  }

  const result = await db.collection(COLL).insertOne({
    truckType:            body.truckType === "trailer" ? "trailer" : "mixer",
    vehicleType:          body.vehicleType?.trim()          ?? null,
    characteristic:       body.characteristic?.trim()       ?? null,
    brand:                body.brand?.trim()                ?? null,
    model:                body.model?.trim()                ?? null,
    registrationDate:     body.registrationDate?.trim()     ?? null,
    color:                body.color?.trim()                ?? null,
    licensePlate:         body.licensePlate?.trim()         ?? null,
    truckNumber:          body.truckNumber?.trim()          ?? null,
    chassisNumber:        body.chassisNumber?.trim()        ?? null,
    engineNumber:         body.engineNumber?.trim()         ?? null,
    engineSize:           body.engineSize?.trim()           ?? null,
    status:               body.status                       ?? "active",
    registrationDocUrl:   body.registrationDocUrl?.trim()   ?? null,
    photoUrl:             body.photos?.front?.trim()        || body.photoUrl?.trim() || null,
    photos:               body.photos ? { front: (body.photos.front ?? "").trim(), back: (body.photos.back ?? "").trim(), left: (body.photos.left ?? "").trim(), right: (body.photos.right ?? "").trim(), cabin: (body.photos.cabin ?? "").trim() } : null,
    dataComplete:         body.dataComplete === true,
    dataExpectedDate:     body.dataExpectedDate?.trim()     ?? null,
    createdAt: now,
    updatedAt: now,
  })

  return NextResponse.json({ ok: true, id: result.insertedId.toHexString() })
}
