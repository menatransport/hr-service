import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { buildDashboard, type MetricDeal, type HistoryRow } from "@/lib/partner/deal-metrics"
import { DEAL_COLL, HISTORY_COLL } from "@/lib/partner/deal-actions"
import { partnerDb, partnerColOf } from "@/lib/db/partner"

/** ตัวเลขแดชบอร์ดไปป์ไลน์ — กรองด้วย ?from=&to=&sales=&source= */
export async function GET(req: NextRequest) {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const db = (await partnerDb())
  const sp = req.nextUrl.searchParams

  const deals = (await partnerColOf(db, "quotations")
    .find({}, { projection: {
      quotationNo: 1, stage: 1, stageBeforeHold: 1, stageEnteredAt: 1, lostAtStage: 1, lossReasonLabel: 1,
      lostAt: 1, trainingResult: 1, deliveredAt: 1, nextFollowUpDate: 1, salesName: 1, sourceChannel: 1,
      createdAt: 1, totalSalePrice: 1,
    } })
    .limit(5000).toArray())
    .map((d) => ({ ...d, _id: String(d._id) })) as unknown as MetricDeal[]

  const history = (await partnerColOf(db, "dealStageHistory")
    .find({}, { projection: { dealId: 1, fromStage: 1, toStage: 1, changedAt: 1 } })
    .limit(50000).toArray()) as unknown as HistoryRow[]

  return NextResponse.json(buildDashboard(deals, history, {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    salesName: sp.get("sales") ?? undefined,
    sourceChannel: sp.get("source") ?? undefined,
  }))
}
