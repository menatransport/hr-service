import { NextResponse } from "next/server"
import { getPromoUsage, normPlate } from "@/lib/partner/promo-usage"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

type Ctx = { params: Promise<{ contractCode: string }> }

/**
 * Promotion detail for one contract.
 * repairUsed / pmUsedThisYear come from lib/promo-usage (repair_claims +
 * pm_records + stock_movements tagged on the vehicle-cost page, deduplicated
 * by MR) so the numbers here always match the vehicle-cost page.
 *
 * repairClaims / pmRecords keep their original shape (_id for delete buttons);
 * stockRepairs / stockPm list warehouse-sourced usage (read-only here,
 * managed on /vehicle-cost).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { contractCode } = await params
  const pdb = await partnerDb()
  const db = pdb

  const cfg = await partnerColOf(db, "promoConfig").findOne({ contractCode })
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 })

  const driver = await partnerColOf(db, "drivers").findOne({ contractCode })

  const [repairClaims, pmRecords, usage] = await Promise.all([
    partnerColOf(db, "repairClaims").find({ contractCode }).sort({ date: -1 }).toArray(),
    partnerColOf(db, "pmRecords").find({ contractCode }).sort({ year: -1, date: -1 }).toArray(),
    getPromoUsage(db),
  ])

  const plateKey = normPlate(String(cfg.licensePlate ?? ""))
  const u = usage.get(plateKey)

  // combined (deduped) totals from the shared source of truth
  const repairUsed = u?.repairUsed ?? repairClaims.reduce((s, c) => s + (c.amount ?? 0), 0)
  const pmUsedThisYear = u?.pmUsedThisYear ?? 0
  const pm1Used = u?.pm1Used ?? false
  const pm2Used = u?.pm2Used ?? false

  // warehouse-sourced records not already represented by a manual claim
  const stockRepairs = (u?.repairRecords ?? []).filter((r) => r.source === "stock")
  const stockPm = (u?.pmRecords ?? []).filter((r) => r.source === "stock")
  // claims that also exist in stock movements (shown with a badge on the UI)
  const dedupedMrs = (u?.repairRecords ?? []).filter((r) => r.source === "both").map((r) => r.mr)

  const toPlain = (doc: Record<string, unknown>) => ({
    ...doc,
    _id: doc._id?.toString(),
  })

  return NextResponse.json({
    contractCode,
    licensePlate: cfg.licensePlate ?? "",
    driverName: driver?.driverName ?? u?.driverName ?? "",
    truckNumber: driver?.truckNumber ?? u?.truckNumber ?? "",
    repairBudget: cfg.repairBudget ?? 0,
    pmOilCost: cfg.pmOilCost ?? 0,
    repairUsed,
    repairRemaining: (cfg.repairBudget ?? 0) - repairUsed,
    annualPmCap: cfg.annualPmCap ?? 0,
    pmUsedThisYear,
    pmRemainingThisYear: (cfg.annualPmCap ?? 0) - pmUsedThisYear,
    pmWindowFrom: u?.pmWindowFrom ?? null,
    pmWindowTo: u?.pmWindowTo ?? null,
    pm1UsedThisYear: pm1Used,
    pm2UsedThisYear: pm2Used,
    repairClaims: repairClaims.map(toPlain),
    pmRecords: pmRecords.map(toPlain),
    stockRepairs,
    stockPm,
    dedupedMrs,
  })
}
