import { NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export async function POST(req: Request) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("promotions")
  if (perm instanceof Response) return perm

  const body = await req.json()
  const { contractCode, date, description, mr, amount } = body
  if (!contractCode || !date || !description || amount == null) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  const doc = {
    contractCode: String(contractCode),
    date: String(date),
    description: String(description),
    mr: mr ? String(mr).trim() : "",
    amount: Number(amount),
    // บันทึกจากหน้าโปรโมชั่นโดยทีม = "จองงบ (reserve)" อิงจากใบ MR — ยังไม่ตัดงบจริง
    // จนกว่าจะกด "เปลี่ยนเป็น actual" (ตัดงบถาวร) หรือ MR ถูกจับคู่กับรายการเบิกคลัง
    confirmed: false,
    reserve: true,
    createdAt: new Date(),
  }
  const result = await partnerColOf(db, "repairClaims").insertOne(doc)
  return NextResponse.json({ _id: result.insertedId.toString(), ...doc }, { status: 201 })
}
