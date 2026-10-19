import { NextResponse } from "next/server"

import { readSessionUser } from "@/lib/auth/session"
import { hasPerm, isAdminRole, type PermDomain } from "@/lib/partner/rbac"
import { resolveRole } from "@/lib/partner/roles"

import type { PartnerSession } from "./types"

/**
 * แทน `getServerSession(authOptions)` ของ next-auth — คืน `null` เมื่อไม่ได้ล็อกอิน
 * **สัญญากลาง** — ห้ามเปลี่ยนชื่อ/รูปคืนค่า
 *
 * ตัวตน = session ของ hr-service (Google/NCAC) · บทบาท = `resolveRole(email)`
 * (`mena_partner.app_users` + `SUPERADMIN_EMAILS`) · ไม่มีอีเมล/ไม่พบ/ฐานล่ม = `viewer`
 *
 * server component / route handler เท่านั้น (ใช้ `cookies()`)
 */
export async function getPartnerSession(): Promise<PartnerSession | null> {
  const user = await readSessionUser()
  if (!user) return null
  const email = user.email ?? ""
  return {
    user: {
      email,
      name: user.name,
      image: user.imageUrl,
      role: await resolveRole(email),
      employeeId: user.employeeId,
    },
  }
}

/**
 * ด่านสิทธิ์ชั้นที่สองในตัว route — `proxy.ts` กันไว้แล้ว แต่ Next แนะนำให้ตรวจซ้ำใน
 * route เสมอ (matcher เปลี่ยน/ย้าย route แล้วด่านหลุดได้เงียบ ๆ)
 *
 * ```ts
 * const auth = await requirePartnerPerm("finance")   // หรือ "admin" / "login"
 * if (auth instanceof Response) return auth
 * const session = auth                                // PartnerSession
 * ```
 * - `"login"` = แค่ต้องล็อกอิน (ใช้กับ GET)
 * - `"admin"` = admin/superadmin เท่านั้น (DELETE, ล็อคเอกสาร, path ที่ไม่มีโดเมน)
 * - `PermDomain` = ตาม matrix ใน `lib/partner/rbac.ts`
 */
export async function requirePartnerPerm(
  need: PermDomain | "admin" | "login",
): Promise<PartnerSession | NextResponse> {
  const session = await getPartnerSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const role = session.user.role
  if (need === "login") return session
  const ok = need === "admin" ? isAdminRole(role) : hasPerm(role, need)
  return ok ? session : NextResponse.json({ error: "Forbidden — ไม่มีสิทธิ์ในส่วนนี้" }, { status: 403 })
}
