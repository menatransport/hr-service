import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "contracts"

/**
 * รหัสสัญญาถัดไป = เลขสูงสุดในระบบ + 1 (ใช้ prefix ของตัวเลขสูงสุด เช่น MTM192 → MTM193)
 * รองรับรูปแบบ <ตัวอักษร><ตัวเลข> เช่น MTM192 / MTL067
 */
export async function GET() {
  const client = await clientPromise
  const codes  = await client.db(DB).collection(COLL)
    .find({}, { projection: { contractCode: 1 } })
    .toArray()

  let max = 0
  let prefix = "MTM"
  for (const c of codes) {
    const code = String(c.contractCode ?? "").trim()
    const m = code.match(/^([A-Za-z]+)[-\s]?(\d+)$/)
    if (!m) continue
    const n = parseInt(m[2], 10)
    if (!isNaN(n) && n > max) { max = n; prefix = m[1] }
  }

  const next = `${prefix}${String(max + 1).padStart(3, "0")}`
  return NextResponse.json({ code: next })
}
