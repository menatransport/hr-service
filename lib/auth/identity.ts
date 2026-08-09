import { positionLevel, positionLevelLabel } from "../ncac/adapt";
import { currentUser, deskUser } from "../data";
import type { SessionUser } from "./token";

/**
 * “ผู้ใช้ที่กำลังดูหน้าอยู่” ในรูปแบบที่หน้าจอใช้จริง
 *
 * มาจาก session ของ Google/NCAC เสมอเมื่อล็อกอินแล้ว — ค่าใน `lib/data.ts`
 * เหลือไว้เป็น **ค่าสำรองตอนยังไม่ล็อกอิน** เท่านั้น (`/m` ยังเปิดดูได้โดยไม่ล็อกอิน
 * เพราะคนขับไม่มีอีเมลบริษัท ส่วน `/desk` ถูก `middleware.ts` กั้นไว้แล้ว)
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

/** ฝั่งมือถือใช้ชุดที่ต่างออกไป — คนขับมีทะเบียนรถ/เขต ส่วนพนักงานออฟฟิศไม่มี */
export interface MobileIdentity {
  employeeId: string;
  name: string;
  firstName: string;
  role: string;
  team: string | null;
  plate: string | null;
  imageUrl: string | null;
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

export function toMobileIdentity(user: SessionUser): MobileIdentity {
  return {
    employeeId: user.employeeId,
    name: user.name || user.employeeId,
    firstName: user.firstName || user.name || user.employeeId,
    role: roleLine(user.department, user.position),
    // พนักงานออฟฟิศไม่มีรถประจำตัว/เขต — ให้ `null` แล้วหน้าจอซ่อนแถวนั้นไปเลย
    team: null,
    plate: null,
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

/** ค่าสำรองของมือถือ — คนขับตัวอย่าง ใช้จนกว่าจะมีทางล็อกอินของ พจส. */
export const FALLBACK_MOBILE_IDENTITY: MobileIdentity = {
  employeeId: currentUser.employeeId,
  name: currentUser.name,
  firstName: currentUser.firstName,
  role: currentUser.role,
  team: currentUser.team,
  plate: currentUser.plate,
  imageUrl: currentUser.imageUrl,
  authenticated: false,
};
