import { NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { QUOTE_COLL } from "@/lib/partner/quotation"
import { resolveRole } from "@/lib/partner/roles"
import { hasPerm } from "@/lib/partner/rbac"
import { buildSalesCommission, type CommissionQuote } from "@/lib/partner/commission"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

/**
 * GET /api/quotations/commission — สรุปยอดขาย + ค่าคอมรายคน
 * ฝ่ายขายเห็นเฉพาะของตัวเอง (กรองที่ server ไม่ส่งข้อมูลคนอื่นออกไป)
 * แอดมิน/การเงิน/แผนกรถร่วม เห็นทุกคน
 */
export async function GET() {
  const session = await getPartnerSession()
  const email = (session?.user?.email ?? "").trim().toLowerCase()
  const role = await resolveRole(email)
  if (!hasPerm(role, "sales")) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูข้อมูลค่าคอมมิชชั่น" }, { status: 403 })
  }
  const onlyMine = role === "salesperson"

  const pdb = await partnerDb()
  const rows = await partnerColOf(pdb, "quotations")
    .find({ status: "won" }, {
      projection: {
        quotationNo: 1, status: 1, salesEmail: 1, salesName: 1, customerName: 1,
        licensePlate: 1, truckNumber: 1, totalSalePrice: 1, createdAt: 1, updatedAt: 1, timeline: 1,
      },
    })
    .limit(5000)
    .toArray()

  const all = buildSalesCommission(rows as unknown as CommissionQuote[])
  const me = all.find((r) => r.email && r.email === email) ?? null

  return NextResponse.json({
    role,
    myEmail: email,
    myName: session?.user?.name ?? "",
    me,
    // ฝ่ายขาย: ไม่ส่งของคนอื่นออกไปเลย
    all: onlyMine ? [] : all,
    canSeeAll: !onlyMine,
  })
}
