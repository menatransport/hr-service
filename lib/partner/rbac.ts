/**
 * RBAC กลาง — 5 บทบาท: superadmin (dev) · admin · fleet (แผนกรถร่วม) · finance (การเงิน) · viewer (ดูอย่างเดียว)
 * ไฟล์นี้ pure (ไม่มี server-only) — ใช้ได้ทั้ง middleware (edge), route handlers และ client UI
 *
 * กติกาสำคัญ:
 *  - DELETE ทุก endpoint = admin ขึ้นไปเท่านั้น (กันข้อมูลสูญ)
 *  - ล็อค/ปลดล็อคเอกสาร = admin ขึ้นไป
 *  - จัดการผู้ใช้ (/admin/users) = superadmin เท่านั้น
 *  - viewer = อ่านอย่างเดียว (default ของคนที่ยังไม่ถูกตั้งบทบาท)
 */

export const ROLES = ["superadmin", "admin", "fleet", "finance", "salesperson", "viewer"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin (Dev)",
  admin: "แอดมิน",
  fleet: "แผนกรถร่วม",
  finance: "การเงิน",
  salesperson: "ฝ่ายขาย",
  viewer: "ดูอย่างเดียว",
}

/** กลุ่มความสามารถ (โดเมนของ API) */
export type PermDomain =
  | "masterdata"      // คนขับ / รถ / ราคาขาย
  | "sales"           // ใบเสนอราคา / ลูกค้า / CRM
  | "contracts"       // สัญญา + เอกสารแนบ
  | "promotions"      // โปรโมชั่น + ยืนยันตัดงบ/PM
  | "vehiclecost"     // ค่าใช้จ่ายรถ / ใบรับสภาพหนี้ / เบิกคลัง / เที่ยววิ่ง
  | "finance"         // ledger / ภาษี-ประกัน / payroll / ปรับปรุง / รอบเดือน / นำเข้าการเงิน
  | "cancel_contract" // ยกเลิกสัญญา
  | "delete"          // ลบข้อมูลทุกชนิด
  | "lock"            // ล็อค/ปลดล็อคเอกสาร
  | "manage_users"    // ตั้งบทบาทผู้ใช้

const MATRIX: Record<Role, readonly PermDomain[]> = {
  superadmin: ["masterdata", "contracts", "promotions", "vehiclecost", "finance", "sales", "cancel_contract", "delete", "lock", "manage_users"],
  admin:      ["masterdata", "contracts", "promotions", "vehiclecost", "finance", "sales", "cancel_contract", "delete", "lock"],
  fleet:      ["masterdata", "contracts", "promotions", "vehiclecost", "sales"],
  finance:    ["finance", "sales"],
  salesperson: ["sales"],
  viewer:     [],
}

export function hasPerm(role: string | undefined | null, domain: PermDomain): boolean {
  return (MATRIX[(role ?? "viewer") as Role] ?? []).includes(domain)
}

export const isAdminRole = (role?: string | null) => role === "admin" || role === "superadmin"

/** ฝ่ายขาย: เข้าได้แค่หน้าราคาขาย (ดู) + ใบเสนอราคา/ดีล + หน้าหลัก */
export const SALESPERSON_PAGES = ["/price-list", "/quotations", "/catalog"]
export function salespersonPageAllowed(pathname: string): boolean {
  if (pathname === "/") return true
  return SALESPERSON_PAGES.some((base) => pathname === base || pathname.startsWith(base + "/") || pathname.startsWith(base + "?"))
}

/** map path ของ API → โดเมนสิทธิ์ (สำหรับ middleware) — คืน null = default-closed (admin ขึ้นไป) */
export function domainOfApiPath(pathname: string): PermDomain | null {
  const p = pathname
  if (p.startsWith("/api/drivers") || p.startsWith("/api/vehicles") || p.startsWith("/api/price-list")) return "masterdata"
  if (p.startsWith("/api/contracts")) return "contracts"
  if (p.startsWith("/api/quotations") || p.startsWith("/api/customers")) return "sales"
  if (p.startsWith("/api/catalog")) return "masterdata"   // template catalog (route เช็ค masterdata ซ้ำ)
  if (p.startsWith("/api/promotions")) return "promotions"
  if (
    p.startsWith("/api/vehicle-cost") ||
    p.startsWith("/api/debt-acceptances") ||
    p.startsWith("/api/trips") ||
    p.startsWith("/api/import/debt-acceptance") ||
    p.startsWith("/api/import/stock")
  ) return "vehiclecost"
  if (
    p.startsWith("/api/ledger") ||
    p.startsWith("/api/trip-fuel") ||
    p.startsWith("/api/attendance") ||
    p.startsWith("/api/payroll-extras") ||
    p.startsWith("/api/insurance-tax") ||
    p.startsWith("/api/payroll") ||
    p.startsWith("/api/adjustments") ||
    p.startsWith("/api/month-status") ||
    p.startsWith("/api/import")
  ) return "finance"
  if (p.startsWith("/api/admin/users")) return "manage_users"
  return null
}

/** อัปโหลดไฟล์ — อนุญาตทุกบทบาทที่มีสิทธิ์เขียนอย่างน้อยหนึ่งโดเมน */
export function canUpload(role: string | undefined | null): boolean {
  const r = (role ?? "viewer") as Role
  return (MATRIX[r] ?? []).length > 0
}
