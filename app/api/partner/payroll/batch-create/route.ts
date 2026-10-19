import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { calculatePayrollEntry } from "@/lib/partner/payroll-engine"

const DB = PARTNER_DB

/**
 * POST /api/payroll/batch-create?month=YYYY-MM
 *
 * Auto-creates payroll entries for all active drivers that don't yet
 * have an entry for the given month — computed by the central engine
 * (calculatePayrollEntry): trip-fuel snapshot, attendance, extras,
 * insurance/tax, ledger deductions and carry-over, identical to the
 * edit page and payslips.
 *
 * Returns { created, skipped, errors }
 */
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const month = searchParams.get("month")?.trim() ?? ""
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 })
  }

  const client = await clientPromise
  const db     = client.db(DB)
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })

  // 1. All active drivers
  const drivers = await db.collection("drivers").find({ status: "active" }).toArray()

  // 2. Existing entries this month
  const existingEntries = await db.collection("payroll_entries")
    .find({ month }, { projection: { contractCode: 1 } }).toArray()
  const existingCodes = new Set(existingEntries.map((e) => e.contractCode as string))

  // 3. Drivers that need an entry
  const pending = drivers.filter((d) => !existingCodes.has(d.contractCode as string))
  if (pending.length === 0) {
    return NextResponse.json({ created: 0, skipped: drivers.length, errors: 0 })
  }

  const pendingCodes = pending.map((d) => d.contractCode as string)

  // 4-6. คำนวณด้วย engine กลาง (calculatePayrollEntry) — สูตรเดียวกับหน้าแก้ไข/สลิป:
  // trip-fuel + attendance + extras + ledger + หนี้ยกยอด ครบในตัว
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs: any[] = []
  for (const code of pendingCodes) {
    const entry = await calculatePayrollEntry(db, code, month)
    if (entry) docs.push({ ...entry, createdAt: now, updatedAt: now })
  }

  let created = 0
  let errors  = 0

  if (docs.length > 0) {
    try {
      const result = await db.collection("payroll_entries").insertMany(docs, { ordered: false })
      created = result.insertedCount
      errors  = docs.length - result.insertedCount
    } catch (e: unknown) {
      // BulkWriteError: partial success possible when ordered=false
      if (e && typeof e === "object" && "result" in e) {
        const bwe = e as { result: { insertedCount: number } }
        created = bwe.result.insertedCount
        errors  = docs.length - created
      } else {
        errors = docs.length
      }
    }
  }

  return NextResponse.json({ created, skipped: existingCodes.size, errors })
}
