import type { PartnerSession } from "./types";

/**
 * แทน `getServerSession(authOptions)` ของ next-auth — คืน `null` เมื่อไม่ได้ล็อกอิน
 * **สัญญากลาง (lane 4 เป็นเจ้าของตัวจริง)** — ห้ามเปลี่ยนชื่อ/รูปคืนค่า
 */
export async function getPartnerSession(): Promise<PartnerSession | null> {
  throw new Error("getPartnerSession: lane 4 ยังไม่ได้ลงตัวจริง");
}
