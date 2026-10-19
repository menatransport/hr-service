import {
  PARTNER_API_PREFIX,
  PARTNER_PAGE_PREFIX,
  SALESPERSON_HOME,
  canUpload,
  domainOfApiPath,
  hasPerm,
  isAdminRole,
  salespersonPageAllowed,
  type Role,
} from "@/lib/partner/rbac";
import { isPublicPath } from "@/lib/partner/public-routes";

/**
 * ตรรกะด่านของ `proxy.ts` ทั้งหมด (hr + รถร่วม) เป็นฟังก์ชัน pure — เทสต์เป็นตารางได้
 * ไม่มี I/O: proxy อ่านคุกกี้/หา role แล้วส่งเข้ามา · ไฟล์นี้ห้าม import อะไรที่ผูกกับ Node/Mongo
 *
 * ลำดับ:
 *  1. public ของรถร่วม (`/trucks` `/api/public/*` `/og/*` SEO, `/api/partner/cron/*`) → ผ่านทุก method
 *  2. `/api/auth/*` → ผ่าน (ไม่งั้นล็อกอินไม่ได้ทั้งระบบ)
 *  3. `/api/partner/session` → ผ่าน (route ตอบ `null` เองเมื่อไม่ล็อกอิน)
 *  4. ไม่ล็อกอิน: `/api/partner/**` ทุก method → 401 · `/api/**` อื่นตามกฎ hr เดิม · หน้า → เด้งล็อกอิน + `next`
 *  5. ล็อกอินแล้ว: นอกโซนรถร่วม → ผ่าน (hr เดิม) · หน้า `/partner/**` ฝ่ายขายจำกัดหน้า ·
 *     `/api/partner/**` ที่เขียนข้อมูล → RBAC ตาม `lib/partner/rbac.ts` (เหมือน middleware เดิมทุกข้อ)
 */

export type GateDecision =
  | { action: "next" }
  | { action: "redirect"; location: string }
  | { action: "json"; status: 401 | 403; error: string };

export interface GateInput {
  pathname: string;
  /** query string รวม `?` (หรือ "") — ใช้ประกอบ `next` ตอนเด้งไปล็อกอิน */
  search?: string;
  method: string;
  /** มี session hr ที่ลายเซ็นถูกและยังไม่หมดอายุหรือไม่ */
  authenticated: boolean;
  /** บทบาทรถร่วม — ต้องส่งเมื่อ `needsPartnerRole()` เป็นจริง · ไม่ส่ง = viewer */
  role?: Role | null;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const isWrite = (method: string) => !READ_METHODS.has(method.toUpperCase());

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/");

export const isPartnerApi = (pathname: string) => under(pathname, PARTNER_API_PREFIX);
export const isPartnerPage = (pathname: string) => under(pathname, PARTNER_PAGE_PREFIX);

/** ล็อกอิน (ไม่นับ public/session) + อยู่ในโซนรถร่วม = ต้องหา role ก่อนเรียก `decideGate` */
export function needsPartnerRole(pathname: string, authenticated: boolean): boolean {
  if (!authenticated || isPublicPath(pathname)) return false;
  if (pathname === `${PARTNER_API_PREFIX}/session`) return false;
  return isPartnerPage(pathname) || isPartnerApi(pathname);
}

const UNAUTHORIZED = "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง";
const forbid = (error: string): GateDecision => ({ action: "json", status: 403, error });

export function decideGate(input: GateInput): GateDecision {
  const { pathname, method, authenticated } = input;
  const search = input.search ?? "";

  if (isPublicPath(pathname)) return { action: "next" };
  if (pathname.startsWith("/api/auth/")) return { action: "next" };
  if (pathname === `${PARTNER_API_PREFIX}/session`) return { action: "next" };

  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      // รถร่วมมีข้อมูลเงิน/สัญญา — GET ก็ต้องล็อกอิน (ต่างจาก hr ที่ปล่อย GET โดยเจตนา)
      if (isPartnerApi(pathname)) return { action: "json", status: 401, error: UNAUTHORIZED };
      if (!isWrite(method)) return { action: "next" };
      /* ใบสมัครงานมาจากคนนอก — เส้นใต้ `public/` เขียนได้โดยไม่ล็อกอิน (ดูเหตุผลใน proxy.ts) */
      if (pathname.startsWith("/api/recruitment/public/")) return { action: "next" };
      return { action: "json", status: 401, error: UNAUTHORIZED };
    }
    return { action: "redirect", location: `/?next=${encodeURIComponent(`${pathname}${search}`)}` };
  }

  const role: Role = input.role ?? "viewer";

  if (isPartnerPage(pathname)) {
    if (role === "salesperson" && !salespersonPageAllowed(pathname)) {
      return { action: "redirect", location: SALESPERSON_HOME };
    }
    return { action: "next" };
  }

  if (isPartnerApi(pathname) && isWrite(method)) {
    // team tracker หน้าแรก — ทุกคนที่ล็อกอินติ๊กได้ (พฤติกรรมเดิม)
    if (under(pathname, `${PARTNER_API_PREFIX}/module-status`)) return { action: "next" };
    if (under(pathname, `${PARTNER_API_PREFIX}/upload`)) {
      return canUpload(role) ? { action: "next" } : forbid("Forbidden — ไม่มีสิทธิ์อัปโหลด");
    }
    if (method.toUpperCase() === "DELETE" && !isAdminRole(role)) {
      return forbid("Forbidden — ลบข้อมูลได้เฉพาะแอดมิน");
    }
    const domain = domainOfApiPath(pathname);
    if (domain === null) {
      if (!isAdminRole(role)) return forbid("Forbidden — admin only");
    } else if (!hasPerm(role, domain)) {
      return forbid("Forbidden — ไม่มีสิทธิ์ในส่วนนี้");
    }
  }

  return { action: "next" };
}
