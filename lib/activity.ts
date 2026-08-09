import { cache } from "react";

import { toActivity } from "./ncac/adapt";
import { listComplaintLogs } from "./ncac/client";
import type { ActivityEntry } from "./types";

/**
 * ชั้นอ่านประวัติการทำงานกับคำร้อง (`complaint_logs` ของ NCAC) สำหรับ
 * **server component** — หน้า `/desk/activity` ใช้ตัวนี้ตัวเดียว
 *
 * ต่างจาก `getCases()` ตรงที่ **เห็นคำร้องที่ถูกลบไปแล้วด้วย** — ทั้งหมดของหน้านี้
 * คือให้เห็นว่ามีการลบเกิดขึ้น ถ้ากรองออกก็จะไม่เหลืออะไรให้ดู
 *
 * **ไม่กลืน error** เหมือน `getEmployees()` — หน้าประวัติคือล็อกล้วน ๆ
 * ยิงไม่ผ่านต้องขึ้น `DataError` ไม่ใช่หน้าเปล่าที่อ่านเป็น “ไม่มีใครทำอะไรเลย”
 *
 * client component **ห้าม** import ไฟล์นี้ — `listComplaintLogs()` อ่าน env ฝั่งเซิร์ฟเวอร์
 */

/** จำนวนที่ดึงมาแสดง — upstream บีบเพดานไว้ที่ 500 อยู่แล้ว */
const LIMIT = 200;

export const getActivity = cache(async (): Promise<ActivityEntry[]> => {
  const logs = await listComplaintLogs(LIMIT);
  return logs.map(toActivity);
});

/** ข้อความอธิบายความผิดพลาดที่เอาไปแสดงบนหน้าจอได้ */
export function activityErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "ดึงประวัติการทำงานจาก NCAC API ไม่สำเร็จ";
}
