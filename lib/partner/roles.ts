import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import type { Role } from "@/lib/partner/rbac"

const DB = PARTNER_DB
const ALLOWED_DOMAIN = "menatransport.co.th"

/** @deprecated โมดูลเก่า — คงไว้เผื่อมีที่อ้างถึง (ทุกคนในโดเมน = admin) */
export function isAdmin(email: string | null | undefined): boolean {
  const domain = (email ?? "").split("@")[1]?.toLowerCase()
  return domain === ALLOWED_DOMAIN
}

// ── resolve บทบาทผู้ใช้ ──
// ลำดับ: SUPERADMIN_EMAILS (env) → app_users (ตั้งผ่าน /admin/users) → grandfather → viewer
// grandfather mode: ถ้ายังไม่ตั้ง SUPERADMIN_EMAILS และ app_users ว่าง → ทุกคนในโดเมน = admin
// (พฤติกรรมเท่าระบบเดิม — กันทีมโดนล็อคเอาต์ก่อนตั้งค่าบทบาท)

const superadmins = () =>
  (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

// cache 60 วิ กัน DB hit ทุก session ping
let cache: { at: number; users: Map<string, Role>; empty: boolean } | null = null

async function loadUsers(): Promise<{ users: Map<string, Role>; empty: boolean }> {
  if (cache && Date.now() - cache.at < 60_000) return cache
  const client = await clientPromise
  const rows = await client.db(DB).collection("app_users").find({}).project({ email: 1, role: 1 }).toArray()
  const users = new Map<string, Role>()
  for (const r of rows) users.set(String(r.email ?? "").toLowerCase(), (r.role ?? "viewer") as Role)
  cache = { at: Date.now(), users, empty: rows.length === 0 }
  return cache
}

/** ล้าง cache หลังแก้บทบาท (เรียกจาก /api/admin/users) */
export function invalidateRoleCache() { cache = null }

export async function resolveRole(email: string | null | undefined): Promise<Role> {
  const e = (email ?? "").trim().toLowerCase()
  if (!e) return "viewer"  // ไม่ login
  if (superadmins().includes(e)) return "superadmin"
  try {
    const { users, empty } = await loadUsers()
    const assigned = users.get(e)
    if (assigned) return assigned
    // grandfather: ยังไม่ configure ระบบบทบาทเลย → คงพฤติกรรมเดิม (ทุกคนในโดเมน = admin)
    if (empty && superadmins().length === 0 && isAdmin(e)) return "admin"
    // user ใหม่ในโดเมน ที่ยังไม่ถูกตั้งบทบาท = ฝ่ายขาย (คำสั่ง 2026-08-07)
    if (isAdmin(e)) return "salesperson" as Role
  } catch {
    // DB ล่มตอน resolve — fail-safe เป็นพฤติกรรมเดิม (คนในโดเมน = admin) กันระบบใช้ไม่ได้ทั้งบริษัท
    if (isAdmin(e)) return "admin"
  }
  return "salesperson"
}
