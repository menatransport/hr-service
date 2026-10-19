import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
const normPlate = (p?: string | null) => (p ?? "").replace(/^[^0-9]*/, "").trim()

const AUDIT_FIELDS = ["truckType", "status", "licensePlate", "brand", "model", "dataComplete", "dataExpectedDate"]

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb  = await partnerDb()
  const doc     = await partnerColOf(pdb, "vehicleMaster").findOne({ _id: new ObjectId(id) })
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(doc)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("masterdata")
  if (perm instanceof Response) return perm

  const { id } = await params
  const body = await req.json() as {
    truckType?:        string | null
    vehicleType?:      string | null
    characteristic?:   string | null
    brand?:            string | null
    model?:            string | null
    registrationDate?: string | null
    color?:            string | null
    licensePlate?:     string | null
    truckNumber?:      string | null
    chassisNumber?:    string | null
    engineNumber?:     string | null
    engineSize?:           string | null
    status?:               string
    registrationDocUrl?:   string | null
    photoUrl?:             string | null
    photos?:               { front?: string; back?: string; left?: string; right?: string; cabin?: string }
    dataComplete?:         boolean
    dataExpectedDate?:     string | null
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() }
  const str = (v: string | null | undefined) => v?.trim() ?? null
  if (body.truckType            !== undefined) $set.truckType            = body.truckType === "trailer" ? "trailer" : "mixer"
  if (body.vehicleType          !== undefined) $set.vehicleType          = str(body.vehicleType)
  if (body.characteristic       !== undefined) $set.characteristic       = str(body.characteristic)
  if (body.brand                !== undefined) $set.brand                = str(body.brand)
  if (body.model                !== undefined) $set.model                = str(body.model)
  if (body.registrationDate     !== undefined) $set.registrationDate     = str(body.registrationDate)
  if (body.color                !== undefined) $set.color                = str(body.color)
  if (body.licensePlate         !== undefined) $set.licensePlate         = str(body.licensePlate)
  if (body.truckNumber          !== undefined) $set.truckNumber          = str(body.truckNumber)
  if (body.chassisNumber        !== undefined) $set.chassisNumber        = str(body.chassisNumber)
  if (body.engineNumber         !== undefined) $set.engineNumber         = str(body.engineNumber)
  if (body.engineSize           !== undefined) $set.engineSize           = str(body.engineSize)
  if (body.status               !== undefined) $set.status               = body.status
  if (body.registrationDocUrl   !== undefined) $set.registrationDocUrl   = str(body.registrationDocUrl)
  if (body.photoUrl             !== undefined) $set.photoUrl             = str(body.photoUrl)
  if (body.photos               !== undefined) {
    const P = body.photos ?? {}
    $set.photos   = { front: (P.front ?? "").trim(), back: (P.back ?? "").trim(), left: (P.left ?? "").trim(), right: (P.right ?? "").trim(), cabin: (P.cabin ?? "").trim() }
    $set.photoUrl = (P.front ?? "").trim()   // photoUrl = รูปมุมหน้า (legacy/price-list)
  }
  if (body.dataComplete         !== undefined) $set.dataComplete         = body.dataComplete === true
  if (body.dataExpectedDate     !== undefined) $set.dataExpectedDate     = str(body.dataExpectedDate)

  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "vehicleMaster")

  // กันทะเบียนซ้ำกับคันอื่น (เทียบแบบ normalize)
  if (body.licensePlate !== undefined && normPlate(body.licensePlate)) {
    const key = normPlate(body.licensePlate)
    const rows = await col.find({}, { projection: { licensePlate: 1 } }).toArray()
    const dup = rows.find((v) => normPlate(v.licensePlate as string) === key && v._id.toString() !== id)
    if (dup) return NextResponse.json({ error: `ทะเบียน ${body.licensePlate} มีอยู่แล้วในระบบ` }, { status: 409 })
  }

  const before = await col.findOne({ _id: new ObjectId(id) })
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set },
    { returnDocument: "after" }
  )

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // audit: log เฉพาะ ประเภท/สถานะ/ทะเบียน/ยี่ห้อ/รุ่น ที่เปลี่ยน
  const changes = diffFields(before, $set, AUDIT_FIELDS)
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "vehicle",
      entityId: id,
      action: "edit",
      changes,
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }
  revalidatePublicTrucks()   // แก้ข้อมูลรถ/สถานะ active-inactive
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  const { id } = await params
  const pdb  = await partnerDb()
  const result  = await partnerColOf(pdb, "vehicleMaster").deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  revalidatePublicTrucks()   // ลบรถออกจากทะเบียนกลาง
  return NextResponse.json({ ok: true })
}
