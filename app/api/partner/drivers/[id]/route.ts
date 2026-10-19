import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
type Ctx = { params: Promise<{ id: string }> }

// field อ่อนไหว (โกงเงินเดือนได้) — log เฉพาะพวกนี้ ไม่ log ที่อยู่/เบอร์
const AUDIT_FIELDS = ["accountNumber", "bankName", "nationalId", "firstName", "lastName", "status"]

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb  = await partnerDb()
  const driver  = await partnerColOf(pdb, "drivers")
    .findOne({ _id: new ObjectId(id) })
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(driver)
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json() as {
    prefix?:        string
    firstName?:     string
    lastName?:      string
    birthDate?:     string | null
    nationalId?:    string | null
    address?:       string | null
    addressDetail?: string | null
    subdistrict?:   string | null
    district?:      string | null
    province?:      string | null
    postalCode?:    string | null
    staffCode?:      string | null
    contractCode?:   string | null
    phone?:          string | null
    bankName?:       string | null
    accountNumber?:  string | null
    idCardUrl?:      string | null
    licenseUrl?:     string | null
    houseRegUrl?:    string | null
    bankBookUrl?:    string | null
    tax50BisUrl?:    string | null
    tax50BisMonthly?: { month: string; url: string }[]
    photoUrl?:       string | null
    licenseNumber?:  string | null
    licenseType?:    string | null
    licenseExpiry?:  string | null
    isTruckOwner?:   boolean
    isDriver?:      boolean
    startDate?:     string | null
    endDate?:       string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    workHistory?: any[]
    status?:        string
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (body.prefix       !== undefined) $set.prefix       = body.prefix?.trim() ?? ""
  if (body.firstName    !== undefined) $set.firstName    = body.firstName?.trim() ?? ""
  if (body.lastName     !== undefined) $set.lastName     = body.lastName?.trim() ?? ""
  if (body.birthDate    !== undefined) $set.birthDate    = body.birthDate ?? null
  if (body.nationalId   !== undefined) $set.nationalId   = body.nationalId?.trim() ?? null
  if (body.address      !== undefined) $set.address      = body.address?.trim() ?? null
  if (body.addressDetail !== undefined) $set.addressDetail = body.addressDetail?.trim() ?? null
  if (body.subdistrict  !== undefined) $set.subdistrict  = body.subdistrict?.trim() ?? null
  if (body.district     !== undefined) $set.district     = body.district?.trim() ?? null
  if (body.province     !== undefined) $set.province     = body.province?.trim() ?? null
  if (body.postalCode   !== undefined) $set.postalCode   = body.postalCode?.trim() ?? null
  if (body.staffCode    !== undefined) $set.staffCode    = body.staffCode?.trim() ?? null
  // รหัสสัญญาซ้ำกันได้ (หลายคนอยู่ใต้สัญญาเดียวกัน) — ไม่เช็ค unique
  if (body.contractCode !== undefined) $set.contractCode = body.contractCode?.trim() ?? null
  if (body.phone         !== undefined) $set.phone         = body.phone?.trim()         ?? null
  if (body.bankName      !== undefined) $set.bankName      = body.bankName?.trim()      ?? null
  if (body.accountNumber !== undefined) $set.accountNumber = body.accountNumber?.trim() ?? null
  if (body.idCardUrl      !== undefined) $set.idCardUrl      = body.idCardUrl?.trim()     ?? null
  if (body.licenseUrl     !== undefined) $set.licenseUrl     = body.licenseUrl?.trim()    ?? null
  if (body.houseRegUrl    !== undefined) $set.houseRegUrl    = body.houseRegUrl?.trim()   ?? null
  if (body.bankBookUrl    !== undefined) $set.bankBookUrl    = body.bankBookUrl?.trim()   ?? null
  if (body.tax50BisUrl    !== undefined) $set.tax50BisUrl    = body.tax50BisUrl?.trim()   ?? null
  if (body.tax50BisMonthly !== undefined) {
    // 50 ทวิ รายเดือน: [{month:"YYYY-MM", url}] — กรองรูปแบบ + เรียงเดือนใหม่→เก่า
    $set.tax50BisMonthly = Array.isArray(body.tax50BisMonthly)
      ? body.tax50BisMonthly
          .filter((x) => x && /^\d{4}-\d{2}$/.test(String(x.month ?? "")) && String(x.url ?? "").trim())
          .map((x) => ({ month: String(x.month), url: String(x.url).trim() }))
          .sort((a, b) => (a.month < b.month ? 1 : -1))
      : []
  }
  if (body.photoUrl       !== undefined) $set.photoUrl       = body.photoUrl?.trim()      ?? null
  if (body.licenseNumber  !== undefined) $set.licenseNumber  = body.licenseNumber?.trim() ?? null
  if (body.licenseType    !== undefined) $set.licenseType    = body.licenseType?.trim()   ?? null
  if (body.licenseExpiry  !== undefined) $set.licenseExpiry  = body.licenseExpiry?.trim() ?? null
  if (body.isTruckOwner   !== undefined) $set.isTruckOwner   = body.isTruckOwner
  if (body.isDriver     !== undefined) $set.isDriver     = body.isDriver
  if (body.workHistory  !== undefined) {
    // ประวัติการทำงาน (เช่น เคยเป็น พจส.) — เก็บเฉพาะแถวที่มี role, ตัดช่องว่าง
    $set.workHistory = Array.isArray(body.workHistory)
      ? body.workHistory
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((w: any) => ({
            role: String(w?.role ?? "").trim(),
            from: String(w?.from ?? "").trim() || null,
            to:   String(w?.to   ?? "").trim() || null,
            note: String(w?.note ?? "").trim() || null,
          }))
          .filter((w: { role: string }) => w.role)
      : []
  }
  if (body.startDate    !== undefined) $set.startDate    = body.startDate ?? null
  if (body.endDate      !== undefined) $set.endDate      = body.endDate ?? null
  if (body.status       !== undefined) {
    if (!["active", "inactive"].includes(body.status))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    $set.status = body.status
  }

  const pdb = await partnerDb()
  const col = partnerColOf(pdb, "drivers")
  const before = await col.findOne({ _id: new ObjectId(id) })
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set },
    { returnDocument: "after" }
  )

  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // audit: log เฉพาะ field อ่อนไหว (เลขบัญชี/ธนาคาร/บัตร ปชช/ชื่อ/สถานะ)
  const changes = diffFields(before, $set, AUDIT_FIELDS)
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "driver",
      entityId: id,
      action: "edit",
      changes,
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }
  return NextResponse.json(result)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb  = await partnerDb()
  const result  = await partnerColOf(pdb, "drivers")
    .deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
