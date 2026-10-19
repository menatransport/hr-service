import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "module_progress"

// เก็บความคืบหน้าต่อโมดูล (ติ๊กข้อมูลครบ + วันที่คาดจะเสร็จ) — key = href
// สถานะ ready/testing/dev ยังอยู่ในโค้ด (lib/module-status.ts); ตรงนี้เป็น overlay ที่แก้ได้ในหน้าแรก

export async function GET() {
  const client = await clientPromise
  const rows = await client.db(DB).collection(COLL).find({}).toArray()
  const map: Record<string, { dataComplete: boolean; expectedDate: string | null; updatedBy?: string; updatedAt?: string }> = {}
  for (const r of rows) {
    map[r.href as string] = {
      dataComplete: r.dataComplete === true,
      expectedDate: (r.expectedDate as string) ?? null,
      updatedBy: r.updatedBy as string | undefined,
      updatedAt: r.updatedAt as string | undefined,
    }
  }
  return NextResponse.json(map)
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as {
    href?: string
    dataComplete?: boolean
    expectedDate?: string | null
  }
  const href = (body.href ?? "").trim()
  if (!href) return NextResponse.json({ error: "href required" }, { status: 400 })

  const session = await getPartnerSession()
  const $set: Record<string, unknown> = {
    href,
    updatedAt: new Date().toISOString(),
    updatedBy: session?.user?.email ?? session?.user?.name ?? "unknown",
  }
  if (body.dataComplete !== undefined) $set.dataComplete = body.dataComplete === true
  if (body.expectedDate !== undefined) $set.expectedDate = (body.expectedDate ?? "").trim() || null

  const client = await clientPromise
  await client.db(DB).collection(COLL).updateOne(
    { href },
    { $set },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
