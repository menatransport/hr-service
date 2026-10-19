import { NextRequest, NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB = PARTNER_DB

/** GET /api/activity-log?entity=<e>&entityId=<id> — ประวัติการแก้ไข (audit) ของ record นั้น */
export async function GET(req: NextRequest) {
  const entity   = req.nextUrl.searchParams.get("entity")?.trim()
  const entityId = req.nextUrl.searchParams.get("entityId")?.trim()
  if (!entity || !entityId) {
    return NextResponse.json({ error: "entity & entityId required" }, { status: 400 })
  }
  const client = await clientPromise
  const logs = await client.db(DB).collection("activity_log")
    .find({ entity, entityId })
    .sort({ editedAt: -1 })
    .limit(200)
    .toArray()
  return NextResponse.json({ history: logs })
}
