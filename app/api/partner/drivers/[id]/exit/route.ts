import { NextRequest, NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { logActivity } from "@/lib/partner/activity-log"
import { hasPerm } from "@/lib/partner/rbac"
import { EXIT_TYPE_LABEL } from "@/lib/partner/driver-state"
import type { ExitType } from "@/lib/partner/types"

const DB = PARTNER_DB
type Ctx = { params: Promise<{ id: string }> }

const normPlate = (p?: string | null) => (p ?? "").replace(/^[^0-9]*/, "").trim()

/**
 * พ้นสภาพคนขับ — คำขอเดียวทำครบชุด (ตาม spec §1):
 *   drivers: status=inactive + exitType/exitReason/endDate/exitedAt + workHistory push
 *   contract (active ของ contractCode): paid_exit → completed · early_exit → terminated
 *   paid_exit  → vehicle_master ทะเบียนของสัญญา status=inactive (รถออกจากระบบ)
 *   early_exit → master_price_list ทะเบียนนั้น saleStatus="review" (เข้าคิวเตรียมขาย) ถ้ายังไม่ ready
 * body { exitType, exitReason?, endDate }  · สิทธิ์ masterdata
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "id invalid" }, { status: 400 })

  const session = await getPartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!hasPerm(role, "masterdata")) return NextResponse.json({ error: "ไม่มีสิทธิ์บันทึกพ้นสภาพ" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { exitType?: ExitType; exitReason?: string; endDate?: string }
  const exitType = body.exitType
  if (exitType !== "paid_exit" && exitType !== "early_exit") return NextResponse.json({ error: "ต้องเลือกประเภทพ้นสภาพ" }, { status: 400 })
  const endDate = (body.endDate ?? "").trim() || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return NextResponse.json({ error: "วันที่ไม่ถูกต้อง (YYYY-MM-DD)" }, { status: 400 })
  const exitReason = (body.exitReason ?? "").trim()

  const client = await clientPromise
  const db = client.db(DB)
  const drivers = db.collection("drivers")
  const driver = await drivers.findOne({ _id: new ObjectId(id) })
  if (!driver) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (driver.status !== "active") return NextResponse.json({ error: "คนขับไม่ได้อยู่ในสถานะใช้งาน" }, { status: 409 })

  const now = new Date().toISOString()
  const editedBy = { email: session?.user?.email ?? "unknown", name: session?.user?.name ?? undefined }
  const note = `${EXIT_TYPE_LABEL[exitType]}${exitReason ? ` — ${exitReason}` : ""}`

  // 1) คนขับ
  await drivers.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { status: "inactive", exitType, exitReason, endDate, exitedAt: now, updatedAt: now },
      $push: { workHistory: { role: "พ้นสภาพ", from: endDate, to: endDate, note } },
    } as Record<string, unknown>,
  )
  await logActivity({
    entity: "driver", entityId: id, action: "exit",
    changes: { สถานะ: { from: "ใช้งาน", to: `พ้นสภาพ (${EXIT_TYPE_LABEL[exitType]})` }, ...(exitReason ? { เหตุผล: { from: "", to: exitReason } } : {}) },
    editedBy,
  })

  // 2) สัญญา active ของรหัสนี้
  const code = String(driver.contractCode ?? "").trim()
  let contractStatus: string | null = null
  let licensePlate: string | null = null
  let vehicleAction: string | null = null
  if (code) {
    const ct = await db.collection("contracts").findOne({ contractCode: code, status: "active" })
    if (ct) {
      contractStatus = exitType === "paid_exit" ? "completed" : "terminated"
      await db.collection("contracts").updateOne(
        { _id: ct._id },
        { $set: { status: contractStatus, endDate, updatedAt: now, ...(contractStatus === "completed" ? { completedAt: now, completedBy: editedBy.email } : { terminatedAt: now, terminatedBy: editedBy.email, terminatedReason: note }) } },
      )
      await logActivity({
        entity: "contract", entityId: code, action: contractStatus === "completed" ? "close" : "terminate",
        changes: { สถานะ: { from: "ใช้งาน", to: contractStatus === "completed" ? "สิ้นสุด (ปิดงวดแล้ว)" : "ยกเลิก" }, เหตุ: { from: "", to: note } },
        editedBy,
      })
      licensePlate = String(ct.licensePlate ?? "").trim() || null
    }
  }

  // 3) รถ
  if (licensePlate) {
    const key = normPlate(licensePlate)
    if (exitType === "paid_exit") {
      const vs = await db.collection("vehicle_master").find({}, { projection: { licensePlate: 1 } }).toArray()
      const v = vs.find((x) => normPlate(x.licensePlate as string) === key)
      if (v) {
        await db.collection("vehicle_master").updateOne({ _id: v._id }, { $set: { status: "inactive", updatedAt: now } })
        vehicleAction = `รถ ${licensePlate} → ไม่ใช้งาน (ออกจากระบบ)`
      }
    } else {
      const ps = await db.collection("master_price_list").find({}, { projection: { licensePlate: 1, saleStatus: 1 } }).toArray()
      const p = ps.find((x) => normPlate(x.licensePlate as string) === key)
      if (p && p.saleStatus !== "ready") {
        await db.collection("master_price_list").updateOne({ _id: p._id }, { $set: { saleStatus: "review", repairStart: null, repairEnd: null, updatedAt: now } })
        vehicleAction = `รถ ${licensePlate} → อยู่ระหว่างดำเนินการให้พร้อมขาย`
      } else if (p) {
        vehicleAction = `รถ ${licensePlate} พร้อมขายอยู่แล้ว`
      } else {
        vehicleAction = `รถ ${licensePlate} ยังไม่มีในราคาขาย — เพิ่มแถวราคาขายเพื่อเข้าคิวเตรียมขาย`
      }
    }
  }

  return NextResponse.json({ ok: true, exitType, endDate, contractCode: code || null, contractStatus, licensePlate, vehicleAction })
}
