import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { ROLES, type Role } from "@/lib/partner/rbac"

const DB = PARTNER_DB
const ALLOWED_DOMAIN = "menatransport.co.th"

/** @deprecated โมดูลเก่า — คงไว้เผื่อมีที่อ้างถึง · **ห้ามใช้ตัดสินสิทธิ์** (แค่บอกว่าอีเมลอยู่ในโดเมนบริษัท) */
export function isAdmin(email: string | null | undefined): boolean {
  const domain = (email ?? "").split("@")[1]?.toLowerCase()
  return domain === ALLOWED_DOMAIN
}

/*
 * ── หาบทบาทผู้ใช้ (หลังรวมเข้า hr-service · 19 ต.ค. 2569) ──
 * ลำดับ: SUPERADMIN_EMAILS (env) → app_users (ตั้งผ่าน /partner/admin/users) → **viewer**
 *
 * **ตัด grandfather mode ทิ้งทั้งหมด — ทุกกรณีที่ไม่พบ/ผิดพลาด = viewer (default-closed)**
 * ของเดิมมี 3 ทางที่ให้สิทธิ์โดยไม่มีใครตั้ง:
 *   1. app_users ว่าง + ไม่ได้ตั้ง SUPERADMIN_EMAILS → ทุกคนในโดเมน = admin
 *   2. ต่อฐานไม่ได้ตอน resolve → คนในโดเมน = admin
 *   3. คนในโดเมนที่ยังไม่ถูกตั้งบทบาท → salesperson
 * ตอนเป็นแอปแยก ผู้ที่ล็อกอินได้คือคนที่ทีมรถร่วมรู้จัก แต่หลังรวมเข้า hr-service
 * **พนักงานทุกคนในบริษัทล็อกอินได้** (ด่าน NCAC) — ถ้าคงกฎเดิม พนักงานทุกคนจะเห็นข้อมูล
 * เงิน/สัญญาของรถร่วม (ข้อ 3) และเขียนได้ทั้งระบบเมื่อฐานสะดุดเพียงครั้งเดียว (ข้อ 2)
 * สิทธิ์จึงต้องมาจากการตั้งโดยตั้งใจเท่านั้น
 */

const superadmins = () =>
  (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

const isRole = (value: unknown): value is Role => (ROLES as readonly string[]).includes(String(value))

export type RoleLookup = (email: string) => Promise<Map<string, Role>>

// cache 60 วิ กัน DB hit ทุกคำขอ (proxy เรียกทุกคำขอใต้ /partner และ /api/partner)
let cache: { at: number; users: Map<string, Role> } | null = null

async function loadUsers(): Promise<Map<string, Role>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.users
  const client = await clientPromise
  const rows = await client.db(DB).collection("app_users").find({}).project({ email: 1, role: 1 }).toArray()
  const users = new Map<string, Role>()
  for (const r of rows) {
    // บทบาทสะกดผิด/ไม่รู้จัก = viewer — ไม่เดาให้
    users.set(String(r.email ?? "").trim().toLowerCase(), isRole(r.role) ? r.role : "viewer")
  }
  cache = { at: Date.now(), users }
  return users
}

/** ล้าง cache หลังแก้บทบาท (เรียกจาก /api/partner/admin/users) */
export function invalidateRoleCache() { cache = null }

/** แกนของ `resolveRole` — แยกตัวโหลดออกมาให้เทสต์ได้โดยไม่ต่อฐาน */
export async function resolveRoleWith(
  email: string | null | undefined,
  load: () => Promise<Map<string, Role>>,
  superadminEmails: readonly string[] = superadmins(),
): Promise<Role> {
  const e = (email ?? "").trim().toLowerCase()
  if (!e) return "viewer"  // ไม่ login / คุกกี้เก่าที่ไม่มีอีเมล
  if (superadminEmails.includes(e)) return "superadmin"
  try {
    return (await load()).get(e) ?? "viewer"
  } catch (err) {
    // ฐานล่ม = viewer (อ่านได้ เขียนไม่ได้) — ไม่ยกสิทธิ์ให้ใครระหว่างที่ตรวจไม่ได้
    console.warn("[partner/roles] หา role ไม่ได้ — ให้ viewer:", err instanceof Error ? err.message : err)
    return "viewer"
  }
}

export async function resolveRole(email: string | null | undefined): Promise<Role> {
  return resolveRoleWith(email, loadUsers)
}
