import { cache } from "react";

import {
  buildDirectory,
  toApprover,
  toHrCase,
  type UserDirectory,
} from "./ncac/adapt";
import { listComplaints, listUsers } from "./ncac/client";
import type { Approver, HrCase } from "./types";

/**
 * ชั้นอ่านข้อมูลคำร้องสำหรับ **server component** — ไม่มี mock เหลืออยู่แล้ว
 * ทุกอย่างมาจาก NCAC API ผ่าน `lib/ncac/client.ts`
 *
 * ห่อด้วย `cache()` ของ React จึงยิงจริงครั้งเดียวต่อหนึ่ง request
 * ถึงจะถูกเรียกจากหลายที่ (topbar + ตาราง + modal อยู่ใน request เดียวกัน)
 *
 * client component **ห้าม** import ไฟล์นี้ — ให้ยิง `/api/cases/**` แทน
 */

export const getUserDirectory = cache(async (): Promise<UserDirectory> => {
  try {
    return buildDirectory(await listUsers());
  } catch {
    // สมุดรายชื่อใช้เติมชื่อคนเท่านั้น — ล่มแล้วยังแสดงคำร้องได้ด้วยรหัสพนักงาน
    return new Map();
  }
});

export const getCases = cache(async (): Promise<HrCase[]> => {
  const [complaints, directory] = await Promise.all([
    listComplaints(),
    getUserDirectory(),
  ]);
  return complaints
    .filter((c) => !c.is_deleted)
    .map((c) => toHrCase(c, directory))
    .sort((a, b) => b.trackingNo.localeCompare(a.trackingNo));
});

/** คำร้องของคนขับคนหนึ่ง — ใช้ในแอปมือถือ (`/m`) */
export const getCasesByDriver = cache(
  async (employeeId: string): Promise<HrCase[]> => {
    const all = await getCases();
    return all.filter((c) => c.driverId === employeeId);
  },
);

/**
 * เคสเดียว — อ่านจาก `getCases()` ที่ cache ไว้แล้ว ไม่ใช่ยิง upstream ซ้ำ
 *
 * NCAC ไม่มี endpoint อ่านเคสเดียวอยู่แล้ว (ดู `getComplaint` ใน `ncac/client.ts`)
 * และหน้า `/desk/cases/[id]` render ตารางไว้ข้างหลัง modal ด้วย — ใช้ตัวเดียวกัน
 * จึงยิง `/complaints/` แค่ครั้งเดียวต่อ request แทนที่จะเป็นสองครั้ง
 */
export const getCase = cache(
  async (trackingNo: string): Promise<HrCase | null> => {
    const id = decodeURIComponent(trackingNo);
    try {
      const cases = await getCases();
      return cases.find((c) => c.trackingNo === id) ?? null;
    } catch {
      return null;
    }
  },
);

/** ผู้มีสิทธิ์อนุมัติ — ระดับ ≥ 4 (Assistant Manager ขึ้นไป) ตามกฎเดิมของระบบ */
export const APPROVER_MIN_LEVEL = 4;

export const getEligibleApprovers = cache(async (): Promise<Approver[]> => {
  const directory = await getUserDirectory();
  return [...directory.values()]
    .map(toApprover)
    .filter((a) => a.level >= APPROVER_MIN_LEVEL)
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name, "th"));
});

/** ข้อความอธิบายความผิดพลาดที่เอาไปแสดงบนหน้าจอได้ */
export function dataErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "ดึงข้อมูลคำร้องจาก NCAC API ไม่สำเร็จ";
}
