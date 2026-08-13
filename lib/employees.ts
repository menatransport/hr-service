import { cache } from "react";

import { isSelectableUser, toEmployee } from "./ncac/adapt";
import { listUsers } from "./ncac/client";
import type { Employee } from "./types";

/**
 * ชั้นอ่านสมุดรายชื่อพนักงานสำหรับ **server component** — มาจาก `GET /users`
 * ของ NCAC ทั้งหมด ไม่มีข้อมูลตัวอย่างสำรอง
 *
 * ต่างจาก `getUserDirectory()` ใน `lib/cases.ts` ตรงที่ **ไม่กลืน error** —
 * ที่นั่นสมุดรายชื่อเป็นแค่ตัวเติมชื่อคนบนเคส ล่มแล้วยังแสดงเคสด้วยรหัสได้
 * แต่หน้าค้นหาพนักงานคือสมุดรายชื่อล้วน ๆ ถ้ายิงไม่ผ่านต้องขึ้น `DataError`
 * ไม่ใช่หน้าเปล่าที่อ่านเป็น “บริษัทนี้ไม่มีพนักงาน”
 *
 * client component **ห้าม** import ไฟล์นี้ — `listUsers()` อ่าน env ฝั่งเซิร์ฟเวอร์
 */

export const getEmployees = cache(async (): Promise<Employee[]> => {
  const users = await listUsers();
  return users
    // พนักงานที่พ้นสภาพแล้วไม่ต้องแสดงเลย (เจ้าของงานสั่ง 7 ส.ค. 2026) และบัญชีระบบ
    // ก็ไม่ใช่คน — กฎอยู่ที่ `isSelectableUser()` ใน `ncac/adapt.ts` ที่เดียว
    // (ดรอปดาวน์ผู้อนุมัติใน `lib/cases.ts` ใช้ตัวเดียวกัน)
    .filter(isSelectableUser)
    .map(toEmployee)
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department, "th") ||
        b.level - a.level ||
        a.name.localeCompare(b.name, "th"),
    );
});

/** พนักงานคนเดียวตามรหัส — อ่านจากรายการที่ `cache()` ไว้แล้ว ไม่ยิง upstream ซ้ำ */
export const getEmployee = cache(
  async (employeeId: string): Promise<Employee | null> => {
    const id = decodeURIComponent(employeeId);
    const employees = await getEmployees();
    return employees.find((e) => e.employeeId === id) ?? null;
  },
);

/** เพื่อนร่วมแผนกของคนนี้ (ไม่รวมตัวเอง) — เรียงตามระดับตำแหน่งเหมือนรายการหลัก */
export const getTeammates = cache(
  async (employee: Employee): Promise<Employee[]> => {
    const employees = await getEmployees();
    return employees.filter(
      (e) =>
        e.department === employee.department &&
        e.employeeId !== employee.employeeId,
    );
  },
);

/** ข้อความอธิบายความผิดพลาดที่เอาไปแสดงบนหน้าจอได้ */
export function employeeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "ดึงสมุดรายชื่อพนักงานจาก NCAC API ไม่สำเร็จ";
}
