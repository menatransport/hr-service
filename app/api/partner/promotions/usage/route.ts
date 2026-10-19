import { NextResponse } from "next/server"
import { getPromoUsage } from "@/lib/partner/promo-usage"
import { partnerDb } from "@/lib/db/partner"

/**
 * Combined promotion usage per plate (repair + PM), from the shared
 * source of truth in lib/promo-usage — repair_claims + pm_records +
 * stock_movements(promoType), deduplicated by MR.
 */
export async function GET() {
  const pdb = await partnerDb()
  const db = pdb

  const usage = await getPromoUsage(db)

  const rows = [...usage.values()]
    .filter((u) => u.repairUsed > 0 || u.pmUsedThisYear > 0)
    .map((u) => ({
      plate: u.plate,
      licensePlate: u.licensePlate,
      contractCode: u.contractCode ?? "",
      repairUsed: u.repairUsed,
      repairCount: u.repairRecords.length,
      pmUsed: u.pmUsedThisYear,
      pmCount: u.pmRecords.length,
    }))

  return NextResponse.json(rows)
}
