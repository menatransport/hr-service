import { cache } from "react";

import { toComplaintType } from "./ncac/adapt";
import { listComplaintMasters } from "./ncac/client";
import type { ComplaintType } from "./types";

/**
 * ชั้นอ่าน “ประเภทเรื่อง” สำหรับ **server component** — คู่ขนานกับ `lib/cases.ts`
 *
 * client component **ห้าม** import ไฟล์นี้ (มันลาก `API_NCAC_URL` เข้า bundle) —
 * ให้ยิง `/api/complaint-types` แทน
 */

/**
 * ทั้งหมดรวมของที่ปิดใช้งานแล้ว — หน้าจอจัดการต้องเห็นครบถึงจะเปิดกลับมาได้
 * ตัวกรอง `isActive` เป็นหน้าที่ของผู้เรียก (ดู `activeComplaintTypesFor`)
 */
export const getComplaintTypes = cache(async (): Promise<ComplaintType[]> => {
  const rows = await listComplaintMasters({ includeInactive: true });
  return rows.map(toComplaintType).sort(byDepartmentThenOrder);
});

const byDepartmentThenOrder = (a: ComplaintType, b: ComplaintType) =>
  a.departmentId.localeCompare(b.departmentId, undefined, { numeric: true }) ||
  a.sortOrder - b.sortOrder ||
  a.id - b.id;

/**
 * ตัวเลือกที่ยัง “เลือกได้” ของหน่วยงานหนึ่ง — ใช้กับฟอร์มกรอกคำร้อง
 *
 * ตัดของที่ปิดใช้งานทิ้ง เพราะเป็นรายการให้เลือกของใหม่ · ส่วนคำร้องเก่าที่ถือ
 * ประเภทซึ่งถูกปิดไปแล้ว ยังอ่านชื่อได้จาก `problem_master` ที่ backend ส่งมากับ
 * ตัวคำร้องเอง จึงไม่ต้องพึ่งรายการนี้ในการแสดงผล
 */
export const activeComplaintTypesFor = (
  all: ComplaintType[],
  departmentId: string | null,
): ComplaintType[] =>
  departmentId
    ? all.filter((t) => t.isActive && t.departmentId === departmentId)
    : [];

/**
 * ดึงแบบไม่ให้ทั้งหน้าล้มเมื่อ NCAC มีปัญหา — ฟอร์มจะเหลือดรอปดาวน์ว่าง
 * ซึ่งดีกว่าเปิดคำร้องไม่ได้เลยทั้งหน้า (ข้อมูลคำร้องเป็นของสำคัญกว่า)
 *
 * **ใช้เฉพาะจุดที่ประเภทเรื่องเป็นของประกอบ** — หน้าจัดการประเภทเรื่องต้องเห็น
 * ข้อผิดพลาดจริง ห้ามใช้ตัวนี้ที่นั่น
 */
export const getComplaintTypesSafe = cache(async (): Promise<ComplaintType[]> => {
  try {
    return await getComplaintTypes();
  } catch {
    return [];
  }
});
