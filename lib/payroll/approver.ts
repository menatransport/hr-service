import type { DeskIdentity } from "../auth/identity";

/**
 * ใครมีสิทธิ์ “รับเข้ารอบ” — **ค่าจ้างและสวัสดิการเท่านั้น**
 *
 * การอัปโหลดกับการรับเข้ารอบเป็นสองการกระทำที่ต้องมาจากคนละมือ: ฝ่ายเจ้าของข้อมูล
 * ส่งไฟล์ ส่วน HR เป็นคนตัดสินว่าไฟล์นั้นใช้ได้หลังตรวจแล้ว ถ้าคนเดียวทำได้ทั้งสองขั้น
 * การตรวจคุณภาพก็ไม่เหลือความหมาย — ของที่ผ่านคือของที่จะกลายเป็นเงินในสลิป
 *
 * `"24"` คือ `department_id` ของ **ทรัพยากรบุคคล** ใน `DEPARTMENTS` (`lib/case-flow.ts`)
 * ไม่ได้เดาเลขเอง · ไม่ import มาตรง ๆ เพราะไฟล์นี้ถูกใช้ทั้งฝั่ง client และ server
 *
 * **ตั้ง `NEXT_PUBLIC_PAYROLL_APPROVER_DEPARTMENTS` เพิ่มหน่วยงานอื่นได้** (คั่นด้วย
 * จุลภาค) สำหรับช่วงทดสอบหรือกรณีที่คนตรวจจริงไม่ได้สังกัด HR — เป็นค่าตั้งของผู้ดูแล
 * ระบบตอน build ไม่ใช่ค่าที่ผู้ใช้ส่งมาได้ และฝั่ง API ก็ตรวจซ้ำด้วยชุดเดียวกันนี้
 */

export const HR_DEPARTMENT_ID = "24";
export const HR_DEPARTMENT_LABEL = "ค่าจ้างและสวัสดิการ (ทรัพยากรบุคคล)";

export const APPROVER_DEPARTMENT_IDS: readonly string[] = [
  HR_DEPARTMENT_ID,
  ...(process.env.NEXT_PUBLIC_PAYROLL_APPROVER_DEPARTMENTS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
];

/**
 * **ยังไม่ล็อกอิน = รับเข้ารอบไม่ได้** ไม่ว่าค่าสำรองจะสังกัดหน่วยงานอะไร —
 * `FALLBACK_DESK_IDENTITY` สังกัด "ทรัพยากรบุคคล" อยู่แล้ว ถ้าไม่เช็ก `authenticated`
 * คุกกี้หมดอายุพอดีจะกลายเป็นช่องที่รับเข้ารอบได้โดยไม่มีใครเป็นเจ้าของลายเซ็น
 */
export function canPassIntake(identity: DeskIdentity): boolean {
  if (!identity.authenticated) return false;
  return APPROVER_DEPARTMENT_IDS.includes(identity.departmentId);
}
