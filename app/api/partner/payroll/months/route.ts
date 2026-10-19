import { NextResponse } from "next/server"
import { prevMonth } from "@/lib/partner/utils"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

export async function GET() {
  const pdb = await partnerDb()
  const db = pdb
  const existing = (await partnerColOf(db, "payrollEntries").distinct("month")) as string[]

  // Always include current month and the two preceding months (use Bangkok time UTC+7)
  const nowBKK = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const current = `${nowBKK.getUTCFullYear()}-${String(nowBKK.getUTCMonth() + 1).padStart(2, "0")}`
  const anchors = [current, prevMonth(current), prevMonth(prevMonth(current))]

  const all = Array.from(new Set([...anchors, ...existing]))
  all.sort((a, b) => b.localeCompare(a))
  return NextResponse.json(all)
}
