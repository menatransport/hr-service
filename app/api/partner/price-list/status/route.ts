import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { diffFields, logActivity } from "@/lib/partner/activity-log"
import { resolveRole } from "@/lib/partner/roles"
import { hasPerm } from "@/lib/partner/rbac"
import { revalidatePublicTrucks } from "@/lib/partner/revalidate-public"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
const SALE_STATUSES = new Set(["ready", "repair15", "repair30", "review"])

// field ที่แก้ได้จากหน้า price-list = field ที่เก็บ audit log
const TRACKED = ["saleStatus", "repairStart", "repairEnd"]

/**
 * POST /api/price-list/status — ตั้งสถานะความพร้อมขายของทะเบียนรถ
 * body: { licensePlate, saleStatus: ready|repair15|repair30|review|null, repairStart?, repairEnd? }
 * (middleware บังคับ admin สำหรับ method ที่ไม่ใช่ GET อยู่แล้ว)
 * บันทึก audit log (ใคร/เมื่อไหร่/เปลี่ยนอะไร) ลง activity_log ทุกครั้งที่มีการเปลี่ยนแปลงจริง
 */
export async function POST(req: NextRequest) {
  const session0 = await getPartnerSession()
  const role = await resolveRole(session0?.user?.email)
  if (!hasPerm(role, "masterdata"))
    return NextResponse.json({ error: "ไม่มีสิทธิ์แก้สถานะความพร้อมขาย" }, { status: 403 })

  const body = await req.json() as {
    licensePlate?: string
    saleStatus?:   string | null
    repairStart?:  string | null
    repairEnd?:    string | null
  }

  const plate = body.licensePlate?.trim()
  if (!plate) return NextResponse.json({ error: "licensePlate required" }, { status: 400 })

  const saleStatus = body.saleStatus && SALE_STATUSES.has(body.saleStatus) ? body.saleStatus : null
  const isRepair   = saleStatus === "repair15" || saleStatus === "repair30"

  // ค่าใหม่แบบ normalize แล้ว — ใช้ทั้งตอน update และตอน diff
  const next = {
    saleStatus,
    repairStart: isRepair ? (body.repairStart ?? null) : null,
    repairEnd:   isRepair ? (body.repairEnd   ?? null) : null,
  }

  const pdb = await partnerDb()
  const col    = partnerColOf(pdb, "masterPriceList")

  // อ่านค่าเดิมก่อน เพื่อ (ก) เช็คว่ามีทะเบียนนี้จริง (ข) เก็บ from ไว้ทำ diff
  const before = await col.findOne(
    { licensePlate: plate },
    { projection: { saleStatus: 1, repairStart: 1, repairEnd: 1 } },
  )
  if (!before)
    return NextResponse.json({ error: "ไม่พบทะเบียนนี้ใน price list" }, { status: 404 })

  await col.updateOne(
    { licensePlate: plate },
    { $set: { ...next, updatedAt: new Date().toISOString() } },
  )

  // บันทึก audit log เฉพาะเมื่อมีการเปลี่ยนแปลงจริง — no-op save จะไม่ log อะไร
  const changes = diffFields(before, next, TRACKED)
  if (Object.keys(changes).length > 0) {
    const session  = await getPartnerSession()
    const editedBy = {
      email: session?.user?.email ?? "unknown",
      name:  session?.user?.name  ?? undefined,
    }
    // logActivity ไม่ throw — ถ้าล้มเหลว การบันทึกสถานะยังสำเร็จอยู่
    await logActivity({ entity: "price_list", entityId: plate, action: "saleStatus", changes, editedBy })
  }

  revalidatePublicTrucks()   // saleStatus เปลี่ยน = ดาว ★ พร้อมขายเปลี่ยน
  return NextResponse.json({ ok: true })
}
