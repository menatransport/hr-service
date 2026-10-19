import type { Role } from "@/lib/partner/rbac";

/**
 * รูป session ที่โค้ดรถร่วมเดิมคาดหวัง (เลียนแบบ next-auth: `session.user.email/name/image/role`)
 * — ให้ codemod แทน `getServerSession(authOptions)` / `useSession()` ได้แบบไม่ต้องแก้ตัวใช้
 *
 * ตัวตนจริงมาจาก session ของ hr-service (Google/NCAC) · บทบาทมาจาก `mena_partner.app_users`
 * (คีย์ด้วยอีเมล) + `SUPERADMIN_EMAILS` · ไม่พบ = `viewer` (default-closed)
 */
export interface PartnerSessionUser {
  email: string;
  name: string;
  image: string | null;
  role: Role;
  employeeId: string;
}

export interface PartnerSession {
  user: PartnerSessionUser;
}

export type PartnerSessionStatus = "loading" | "authenticated" | "unauthenticated";
