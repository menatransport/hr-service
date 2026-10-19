import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB = PARTNER_DB

/**
 * รหัสพนักงานถัดไป
 * - โหมดปกติ: เลขสูงสุด + 1 (ชุดเดียวกับรหัสสัญญา เช่น MTM191 → MTM192) จาก drivers.staffCode + contracts.contractCode
 * - โหมด ?contractCode=MTM145: พนักงานขับรถที่ "ไม่ใช่เจ้าของรถ" — รหัสอิงสัญญาที่ไปวิ่งงานให้
 *   → MTM145-01 (คนถัดไปของสัญญาเดียวกัน = -02, -03, ...)
 */
export async function GET(req: NextRequest) {
  const client = await clientPromise
  const db = client.db(DB)

  const contractCode = req.nextUrl.searchParams.get("contractCode")?.trim()
  if (contractCode) {
    const drivers = await db.collection("drivers")
      .find({ staffCode: { $regex: `^${contractCode}-\\d+$` } }, { projection: { staffCode: 1 } })
      .toArray()
    let maxN = 0
    for (const d of drivers) {
      const m = String(d.staffCode ?? "").match(/-(\d+)$/)
      const n = m ? parseInt(m[1], 10) : 0
      if (n > maxN) maxN = n
    }
    return NextResponse.json({ code: `${contractCode}-${String(maxN + 1).padStart(2, "0")}` })
  }

  const [drivers, contracts] = await Promise.all([
    db.collection("drivers").find({}, { projection: { staffCode: 1 } }).toArray(),
    db.collection("contracts").find({}, { projection: { contractCode: 1 } }).toArray(),
  ])

  let max = 0
  let prefix = "MTM"
  const scan = (v: unknown) => {
    const m = String(v ?? "").trim().match(/^([A-Za-z]+)[-\s]?(\d+)$/)
    if (!m) return
    const n = parseInt(m[2], 10)
    if (!isNaN(n) && n > max) { max = n; prefix = m[1] }
  }
  for (const d of drivers) scan(d.staffCode)
  for (const c of contracts) scan(c.contractCode)

  return NextResponse.json({ code: `${prefix}${String(max + 1).padStart(3, "0")}` })
}
