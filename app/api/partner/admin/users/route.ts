import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { invalidateRoleCache } from "@/lib/partner/roles"
import { ROLES } from "@/lib/partner/rbac"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
async function requireSuperadmin() {
  const session = await getPartnerSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role !== "superadmin") return null
  return session
}

export async function GET() {
  if (!(await requireSuperadmin())) return NextResponse.json({ error: "superadmin only" }, { status: 403 })
  const pdb = await partnerDb()
  const rows = await partnerColOf(pdb, "appUsers").find({}).sort({ email: 1 }).toArray()
  return NextResponse.json(rows.map((r) => ({ email: r.email, role: r.role, updatedAt: r.updatedAt, updatedBy: r.updatedBy })))
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("manage_users")
  if (perm instanceof Response) return perm

  const session = await requireSuperadmin()
  if (!session) return NextResponse.json({ error: "superadmin only" }, { status: 403 })
  const body = await req.json() as { email?: string; role?: string }
  const email = (body.email ?? "").trim().toLowerCase()
  const role = (body.role ?? "").trim()
  if (!email || !email.includes("@")) return NextResponse.json({ error: "email ไม่ถูกต้อง" }, { status: 400 })
  if (!ROLES.includes(role as (typeof ROLES)[number]) || role === "superadmin") {
    return NextResponse.json({ error: "role ไม่ถูกต้อง (superadmin ตั้งได้ผ่าน env เท่านั้น)" }, { status: 400 })
  }
  const pdb = await partnerDb()
  await partnerColOf(pdb, "appUsers").updateOne(
    { email },
    { $set: { email, role, updatedAt: new Date().toISOString(), updatedBy: session.user?.email ?? "" } },
    { upsert: true }
  )
  invalidateRoleCache()
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("manage_users")
  if (perm instanceof Response) return perm

  if (!(await requireSuperadmin())) return NextResponse.json({ error: "superadmin only" }, { status: 403 })
  const { email } = await req.json() as { email?: string }
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 })
  const pdb = await partnerDb()
  await partnerColOf(pdb, "appUsers").deleteOne({ email: email.trim().toLowerCase() })
  invalidateRoleCache()
  return NextResponse.json({ ok: true })
}
