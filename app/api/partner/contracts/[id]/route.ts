import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { hasPerm } from "@/lib/partner/rbac"
import { withVehicleDetails } from "@/lib/partner/contract-vehicle"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
type Ctx = { params: Promise<{ id: string }> }

// field ที่ log การแก้ไข — เน้นการเงิน/กฎหมาย/วันที่ (ไม่ log พวก url ไฟล์แนบ ที่ log แยกแล้ว)
const AUDIT_FIELDS = [
  "contractDate", "startDate", "buyerName", "driverName", "licensePlate", "truckNumber",
  "totalPrice", "downPayment", "cashDown", "remainingInstallment", "downInstallmentAmt",
  "downInstallmentCount", "financeAmount", "monthlyInstallment", "totalInstallments",
  "accountNumber", "bankName", "nationalId", "status",
  "guarantorName", "guarantorNationalId",
]

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "contracts")
  const item   = await col.findOne({ _id: new ObjectId(id) })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // ช่องข้อมูลรถที่ว่างในสัญญา → เติมจากทะเบียนรถ เอกสารจะได้ไม่พิมพ์เป็นเส้นประว่าง
  return NextResponse.json(await withVehicleDetails(pdb, item))
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("contracts")
  if (perm instanceof Response) return perm

  const { id }   = await params
  const body     = await req.json()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _id, createdAt, contractCode: _cc, ...update } = body

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "contracts")
  const now    = new Date().toISOString()

  const before = await col.findOne({ _id: new ObjectId(id) })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── สัญญาที่ถูกล็อค: ห้ามแก้ทุกกรณี จนกว่า admin จะปลดล็อค (ผ่าน endpoint /lock) ──
  if (before.locked) {
    return NextResponse.json(
      { error: `สัญญาถูกล็อคโดย ${before.locked.by ?? "แอดมิน"} — ปลดล็อคก่อนจึงจะแก้ไขได้` },
      { status: 423 }
    )
  }

  const session0 = await getPartnerSession()
  const role = (session0?.user as { role?: string } | undefined)?.role

  // ── ยกเลิกสัญญา (status → terminated) = สิทธิ์ระดับแอดมินเท่านั้น ──
  if (update.status === "terminated" && before.status !== "terminated" && !hasPerm(role, "cancel_contract")) {
    return NextResponse.json({ error: "ยกเลิกสัญญาได้เฉพาะแอดมิน" }, { status: 403 })
  }

  // ห้ามแก้ field ล็อคผ่าน PUT (ต้องผ่าน endpoint /lock ที่เช็คสิทธิ์แยก)
  delete (update as Record<string, unknown>).locked

  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...update, updatedAt: now } },
    { returnDocument: "after" }
  )
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // audit: log เฉพาะ field การเงิน/กฎหมายที่เปลี่ยนจริง
  const changes = diffFields(before, update, AUDIT_FIELDS)
  if (Object.keys(changes).length > 0) {
    const session = await getPartnerSession()
    await logActivity({
      entity: "contract",
      entityId: result.contractCode as string,
      action: "edit",
      changes,
      editedBy: { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined },
    })
  }

  // Sync driver document
  const drivers = partnerColOf(pdb, "drivers")
  await drivers.updateOne(
    { contractCode: result.contractCode },
    { $set: {
        buyerName:    result.buyerName,
        driverName:   result.driverName,
        truckNumber:  result.truckNumber,
        licensePlate: result.licensePlate,
        phone:        result.phone,
        plant:        result.plant,
      }
    }
  )

  revalidatePublicTrucks()   // แก้/ยกเลิกสัญญา = ชุดรถว่างเปลี่ยน
  return NextResponse.json(result)
}

// สัญญาลบถาวรไม่ได้ — ใช้ "ยกเลิกสัญญา" (เปลี่ยนสถานะเป็น terminated) แทน
// เพื่อรักษาประวัติ/หลักฐาน (audit, เงินเดือน, หนี้ที่อ้างถึงสัญญานี้)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("admin")
  if (perm instanceof Response) return perm

  await params
  return NextResponse.json(
    { error: "ลบสัญญาถาวรไม่ได้ — กรุณาใช้ ‘ยกเลิกสัญญา’ (เปลี่ยนสถานะเป็นยกเลิก) แทน" },
    { status: 405 },
  )
}
