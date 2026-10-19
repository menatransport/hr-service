import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

/**
 * GET /api/price-list/history?plate=<licensePlate>
 * คืนประวัติการแก้ไข (audit log) ของทะเบียนนั้น เรียงใหม่→เก่า
 * (middleware อนุญาต GET ให้ผู้ใช้ที่ล็อกอินทุกคน — สอดคล้องกับ read API อื่น)
 */
export async function GET(req: NextRequest) {
  const plate = req.nextUrl.searchParams.get("plate")?.trim()
  if (!plate) return NextResponse.json({ error: "plate required" }, { status: 400 })

  const pdb  = await partnerDb()
  const entries = await partnerColOf(pdb, "activityLog")
    .find({ entity: "price_list", entityId: plate })
    .sort({ editedAt: -1 })
    .limit(100)
    .project({ _id: 0, action: 1, changes: 1, editedBy: 1, editedAt: 1 })
    .toArray()

  return NextResponse.json(entries)
}
