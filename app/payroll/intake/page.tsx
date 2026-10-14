import type { Metadata } from "next";

import { IntakeView } from "@/components/payroll/intake-view";
import { getDeskIdentity } from "@/lib/auth/session";
import { canPassIntake } from "@/lib/payroll/approver";

export const metadata: Metadata = {
  title: "กระดานรับไฟล์",
};

/**
 * สิทธิ์ “รับเข้ารอบ” ถูกตัดสินที่เซิร์ฟเวอร์แล้วส่งลงไปเป็น `boolean` ตัวเดียว —
 * client ไม่มีทางปลอมสิทธิ์ตัวเอง · `identity` ส่งลงไปให้หน้าจอซ่อนกลุ่มที่ไม่เห็นเท่านั้น
 * (ของจริงกันที่ API)
 * (ปลอมได้ก็ได้แค่ปุ่มที่กดแล้ว API ตอบ 403 เพราะฝั่ง `PATCH` ตรวจซ้ำอีกชั้น)
 */
export default async function PayrollIntakePage() {
  const identity = await getDeskIdentity();
  return <IntakeView canPass={canPassIntake(identity)} identity={identity} />;
}
