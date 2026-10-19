import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
// สถานะ ready/testing/dev ยังอยู่ในโค้ด (lib/module-status.ts); ตรงนี้เป็น overlay ที่แก้ได้ในหน้าแรก

export async function GET() {
  const pdb = await partnerDb()
  const rows = await partnerColOf(pdb, "moduleProgress").find({}).toArray()
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
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("login")
  if (perm instanceof Response) return perm

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

  const pdb = await partnerDb()
  await partnerColOf(pdb, "moduleProgress").updateOne(
    { href },
    { $set },
    { upsert: true }
  )
  return NextResponse.json({ ok: true })
}
