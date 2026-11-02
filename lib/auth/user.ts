import type { AuthUserDto } from "../ncac/types";
import type { SessionUser } from "./token";

/**
 * แปลงผู้ใช้ของ NCAC เป็นชุดที่เก็บในคุกกี้ session
 *
 * รับได้ทั้งคำตอบของ `POST /auth/login/google` (ตอนล็อกอิน) และ `GET /users/{id}`
 * (ตอนอ่านข้อมูลใหม่ทุกครั้งที่เข้าระบบ — ดู `proxy.ts`) ซึ่งช่องที่ใช้ตรงกันทุกช่อง
 *
 * ไฟล์นี้ต้องไม่ผูกกับ Node — `proxy.ts` import ไปใช้ด้วย
 */

const text = (value: string | null | undefined): string => value?.trim() ?? "";

export function toSessionUser(user: AuthUserDto): SessionUser {
  const employeeId = text(user.employee_id) || text(user.username);
  const name = `${text(user.firstname)} ${text(user.lastname)}`.trim();

  return {
    employeeId,
    username: text(user.username),
    name: name || employeeId,
    firstName: text(user.firstname) || name || employeeId,
    position: text(user.position) || "—",
    department: text(user.department) || "—",
    departmentId: typeof user.department_id === "number" ? user.department_id : null,
    positionLevel: text(user.position_level) || null,
    site: text(user.site) || "—",
    imageUrl: text(user.image_url) || null,
  };
}

/** `employee_status` ตัวพิมพ์ไม่คงที่ (`Inactive` / `inactive`) — เทียบตัวเล็กเสมอ */
export function isInactive(user: AuthUserDto): boolean {
  return text(user.employee_status).toLowerCase() === "inactive";
}
