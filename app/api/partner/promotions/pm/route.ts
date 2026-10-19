import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB = PARTNER_DB

export async function POST(req: Request) {
  const body = await req.json()
  const { contractCode, year, type, date, amount, notes } = body
  if (!contractCode || !year || !type || !date || amount == null) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 })
  }
  if (type !== "PM1" && type !== "PM2") {
    return NextResponse.json({ error: "type must be PM1 or PM2" }, { status: 400 })
  }
  const client = await clientPromise
  const db = client.db(DB)
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
  const result = await db.collection("pm_records").insertOne(doc)
  return NextResponse.json({ _id: result.insertedId.toString(), ...doc }, { status: 201 })
}
