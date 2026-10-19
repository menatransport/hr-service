import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { hasPerm } from "@/lib/partner/rbac"
import { CATALOG_COLL, DEFAULT_CATALOG_CONFIG, getCatalogConfig, sanitizeCatalogConfig, type CatalogConfig } from "@/lib/partner/catalog-config"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

/** template ข้อความ Catalog — GET ทุกคนที่ล็อกอิน · PUT สิทธิ์ masterdata (admin/fleet) */
export async function GET() {
  const pdb = await partnerDb()
  return NextResponse.json({ config: await getCatalogConfig(pdb), defaults: DEFAULT_CATALOG_CONFIG })
}

export async function PUT(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("masterdata")
  if (perm instanceof Response) return perm

  const session = await getPartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (!hasPerm(role, "masterdata")) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้ template" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Partial<CatalogConfig>
  const cfg = sanitizeCatalogConfig(body)
  const pdb = await partnerDb()
  await partnerColOf(pdb, "catalogConfig").updateOne(
    { _id: "default" as unknown as never },
    { $set: { ...cfg, updatedAt: new Date().toISOString(), updatedBy: session?.user?.email ?? "unknown" } },
    { upsert: true },
  )
  return NextResponse.json({ ok: true, config: await getCatalogConfig(pdb) })
}
