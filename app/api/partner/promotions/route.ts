import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { getPromoUsage, normPlate } from "@/lib/partner/promo-usage"

const DB = PARTNER_DB

/**
 * Promotion summary per contract.
 * Usage figures come from lib/promo-usage (repair_claims + pm_records +
 * stock_movements tagged on the vehicle-cost page, deduplicated by MR)
 * so this list always matches the vehicle-cost page.
 */
export async function GET() {
  const client = await clientPromise
  const db = client.db(DB)

  const configs = await db
    .collection("promo_config")
    .find({ contractCode: { $exists: true, $ne: "" } })
    .sort({ contractCode: 1 })
    .toArray()

  const contractCodes = configs.map((c) => c.contractCode as string)

  const [drivers, usage] = await Promise.all([
    db.collection("drivers").find({ contractCode: { $in: contractCodes } }).toArray(),
    getPromoUsage(db),
  ])
  const driverMap = Object.fromEntries(drivers.map((d) => [d.contractCode, d]))

  const rows = configs.map((cfg) => {
    const code = cfg.contractCode as string
    const driver = driverMap[code] ?? {}
    const u = usage.get(normPlate(String(cfg.licensePlate ?? "")))
    const repairUsed = u?.repairUsed ?? 0
    const pmUsed = u?.pmUsedThisYear ?? 0
    return {
      contractCode: code,
      licensePlate: cfg.licensePlate ?? "",
      driverName: driver.driverName ?? u?.driverName ?? "",
      truckNumber: driver.truckNumber ?? u?.truckNumber ?? "",
      repairBudget: cfg.repairBudget ?? 0,
      repairUsed,
      repairRemaining: (cfg.repairBudget ?? 0) - repairUsed,
      annualPmCap: cfg.annualPmCap ?? 0,
      pmUsedThisYear: pmUsed,
      pmRemainingThisYear: (cfg.annualPmCap ?? 0) - pmUsed,
      pm1UsedThisYear: u?.pm1Used ?? false,
      pm2UsedThisYear: u?.pm2Used ?? false,
    }
  })

  return NextResponse.json(rows)
}
