import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB = PARTNER_DB

export async function POST(req: Request) {
  const body = await req.json()
  const { contractCode, date, description, mr, amount } = body
  if (!contractCode || !date || !description || amount == null) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 })
  }
  const client = await clientPromise
  const db = client.db(DB)
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
  const result = await db.collection("repair_claims").insertOne(doc)
  return NextResponse.json({ _id: result.insertedId.toString(), ...doc }, { status: 201 })
}
