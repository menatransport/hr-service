import { badRequest, fail } from "@/app/api/_lib/respond";
import { MasterError } from "@/lib/complaint-master";

/**
 * แปลง `MasterError` (ข้อมูลที่กรอกไม่ผ่าน) ให้เป็น 400 แทน 500 —
 * ที่เหลือปล่อยให้ `fail()` จัดการ โดยเฉพาะ `NcacError` 409 ตอนลบประเภทเรื่อง
 * ที่ยังมีคำร้องอ้างถึง ซึ่งต้องคงสถานะและข้อความจาก upstream ไว้ทั้งดุ้น
 */
export function failMaster(err: unknown) {
  if (err instanceof MasterError) return badRequest(err.message);
  return fail(err);
}
