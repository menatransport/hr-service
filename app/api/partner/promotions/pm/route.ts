import { NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

export async function POST(req: Request) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("promotions")
  if (perm instanceof Response) return perm

  const body = await req.json()
  const { contractCode, year, type, date, amount, notes } = body
  if (!contractCode || !year || !type || !date || amount == null) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 })
  }
  if (type !== "PM1" && type !== "PM2") {
    return NextResponse.json({ error: "type must be PM1 or PM2" }, { status: 400 })
  }
  const pdb = await partnerDb()
  const db = pdb
  const doc = {
    contractCode: String(contractCode),
    year: Number(year),
    type: type as "PM1" | "PM2",
    date: String(date),
    amount: Number(amount),
    notes: String(notes ?? ""),
    // บันทึกโดยทีมจากหน้าโปรโมชั่น = ระบุแล้ว → ตัดเพดานทันที
    confirmed: true,
    createdAt: new Date(),
  }
  const result = await partnerColOf(db, "pmRecords").insertOne(doc)
  return NextResponse.json({ _id: result.insertedId.toString(), ...doc }, { status: 201 })
}
