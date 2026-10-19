import { NextRequest, NextResponse } from "next/server"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
interface TripRow {
  contractCode: string
  date: string
  ldtNumber?: string
  plant?: string
  serviceType?: string
  routeCode?: string
  destinationName?: string
  district?: string
  province?: string
  zone?: string
  tripFee: number
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { rows: TripRow[] }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 })
  }

  const pdb  = await partnerDb()
  const col     = partnerColOf(pdb, "trips")
  const now     = new Date().toISOString()

  // Collect ldtNumbers from incoming rows (only non-empty ones)
  const incomingLdt = body.rows
    .map((r) => r.ldtNumber?.trim())
    .filter((v): v is string => Boolean(v))

  // Find which ldtNumbers already exist (deduplication)
  const existing = incomingLdt.length > 0
    ? await col.find({ ldtNumber: { $in: incomingLdt } }, { projection: { ldtNumber: 1 } }).toArray()
    : []
  const existingSet = new Set(existing.map((e) => e.ldtNumber as string))

  const toInsert = body.rows
    .filter((r) => !r.ldtNumber?.trim() || !existingSet.has(r.ldtNumber.trim()))
    .map((r) => ({ ...r, createdAt: now }))

  let inserted = 0
  if (toInsert.length > 0) {
    const result = await col.insertMany(toInsert, { ordered: false })
    inserted = result.insertedCount
  }

  return NextResponse.json({
    inserted,
    skipped: body.rows.length - inserted,
    total: body.rows.length,
  })
}
