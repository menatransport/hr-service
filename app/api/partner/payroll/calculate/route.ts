import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { calculatePayrollEntry } from "@/lib/partner/payroll-engine"

const DB = PARTNER_DB

/**
 * POST /api/payroll/calculate?month=YYYY-MM[&contractCode=MTL003]
 *
 * Admin-only. Calculates and upserts payroll entries from source collections.
 * If contractCode is given, recalculates only that one driver.
 * Otherwise recalculates all active drivers.
 *
 * Returns { updated, errors, skipped }
 */
export async function POST(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session || !hasPerm(session.user?.role, "finance")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const month        = searchParams.get("month")?.trim() ?? ""
  const singleCode   = searchParams.get("contractCode")?.trim() ?? ""

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const client = await clientPromise
  const db     = client.db(DB)

  let codes: string[]
  if (singleCode) {
    codes = [singleCode]
  } else {
    const drivers = await db.collection("drivers").find({ status: "active" }, { projection: { contractCode: 1 } }).toArray()
    codes = drivers.map((d) => d.contractCode as string)
  }

  const now = new Date().toISOString()
  let updated = 0
  let errors  = 0
  let skipped = 0

  for (const code of codes) {
    try {
      const result = await calculatePayrollEntry(db, code, month)
      if (!result) { skipped++; continue }

      await db.collection("payroll_entries").updateOne(
        { contractCode: code, month },
        { $set: { ...result, updatedAt: now }, $setOnInsert: { createdAt: now } },
        { upsert: true }
      )
      updated++
    } catch {
      errors++
    }
  }

  return NextResponse.json({ updated, errors, skipped, month, total: codes.length })
}
