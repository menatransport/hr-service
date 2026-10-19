import { NextResponse } from "next/server"
import { getPromoUsage } from "@/lib/partner/promo-usage"
import { partnerDb } from "@/lib/db/partner"

/**
 * Promotion budget status per plate — SINGLE SOURCE OF TRUTH.
 * Usage combines repair_claims + pm_records + stock_movements(promoType),
 * deduplicated by MR number (lib/promo-usage), so this endpoint and the
 * vehicle-cost page always agree.
 */
export async function GET() {
  const pdb = await partnerDb()
  const db = pdb

  const usage = await getPromoUsage(db)

  const rows = [...usage.values()]
    // only plates that have a promo budget configured (promo_config)
    .filter((u) => u.repairBudget != null || u.annualPmCap != null)
    .map((u) => ({
      plate: u.plate,
      licensePlate: u.licensePlate,
      contractCode: u.contractCode ?? "",
      truckNumber: u.truckNumber ?? "",
      driverName: u.driverName ?? "",
      repairBudget: u.repairBudget ?? 0,
      repairUsed: u.repairUsed,
      repairRemaining: (u.repairBudget ?? 0) - u.repairUsed,
      annualPmCap: u.annualPmCap ?? 0,
      pmUsedThisYear: u.pmUsedThisYear,
      pmRemainingThisYear: (u.annualPmCap ?? 0) - u.pmUsedThisYear,
      pm1UsedThisYear: u.pm1Used,
      pm2UsedThisYear: u.pm2Used,
      repairRecordCount: u.repairRecords.length,
      pmRecordCount: u.pmRecords.length,
    }))
    .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate, "th"))

  return NextResponse.json(rows)
}
