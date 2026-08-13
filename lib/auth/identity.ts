import { positionLevel, positionLevelLabel } from "../ncac/adapt";
import { deskUser } from "../data";
import type { SessionUser } from "./token";

/**
 * “ผู้ใช้ที่กำลังดูหน้าอยู่” ในรูปแบบที่หน้าจอใช้จริง
 *
 * มาจาก session ของ Google/NCAC เสมอเมื่อล็อกอินแล้ว — ค่าใน `lib/data.ts`
 * เหลือไว้เป็น **ค่าสำรองตอนยังไม่ล็อกอิน** เท่านั้น (`/desk` ถูก `proxy.ts` กั้นไว้แล้ว
 * ค่าสำรองจึงได้ใช้แค่ตอนคุกกี้หมดอายุพอดีระหว่าง render)
 *
 * ไฟล์นี้ถูก import ได้ทั้งฝั่ง client และ server — ห้ามใส่อะไรที่ผูกกับ Node
 * ตัวอ่าน session จริงอยู่ที่ `lib/auth/session.ts`
 */

export interface DeskIdentity {
  employeeId: string;
  name: string;
  firstName: string;
  /** บรรทัดรองใต้ชื่อบน topbar — `หน่วยงาน · ตำแหน่ง` */
  role: string;
  position: string;
  department: string;
  /**
   * รหัสหน่วยงานสำหรับกฎล็อกฟอร์ม (`canEditSection`) — `department_id` ของ NCAC
   * ตัวเดียวกับ `DepartmentId` ของฝั่งคำร้อง (ดู `DEPARTMENTS` ใน `case-flow.ts`)
   * คนที่สังกัดหน่วยงานนอกรายการ PIC จะได้รหัสที่ไม่ตรงกับใคร = แก้ได้ตามสถานะเท่านั้น
   */
  departmentId: string;
  level: number;
  levelLabel: string;
  imageUrl: string | null;
  /** `false` = ยังไม่ล็อกอิน กำลังใช้ค่าสำรอง — อย่าเอาไปลงลายเซ็นอะไรทั้งนั้น */
  authenticated: boolean;
}

/** `ทรัพยากรบุคคล · Assistant Manager` — ตัดช่องที่ NCAC ส่งขีดกลางมาให้ทิ้ง */
const roleLine = (department: string, position: string): string =>
  [department, position].filter((v) => v && v !== "—").join(" · ") || "พนักงาน";

export function toDeskIdentity(user: SessionUser): DeskIdentity {
  return {
    employeeId: user.employeeId,
    name: user.name || user.employeeId,
    firstName: user.firstName || user.name || user.employeeId,
    role: roleLine(user.department, user.position),
    position: user.position,
    department: user.department,
    departmentId:
      user.departmentId === null ? "" : String(user.departmentId),
    level: positionLevel(user.positionLevel),
    levelLabel: positionLevelLabel(user.positionLevel),
    imageUrl: user.imageUrl,
    authenticated: true,
  };
}

/** ค่าสำรองของ desk ตอนยังไม่ล็อกอิน — ใช้แค่ตอน render นอก `middleware` เท่านั้น */
export const FALLBACK_DESK_IDENTITY: DeskIdentity = {
  employeeId: deskUser.employeeId,
  name: deskUser.name,
  firstName: deskUser.name,
  role: deskUser.role,
  position: deskUser.position,
  department: "ทรัพยากรบุคคล",
  departmentId: deskUser.departmentId,
  level: deskUser.level,
  levelLabel: positionLevelLabel(deskUser.position),
  imageUrl: deskUser.imageUrl,
  authenticated: false,
};
