import type { HrDocId } from "./hr-documents";
import { DOC_SIGN_SLOTS } from "./hr-signatures";

/**
 * ลิงก์ให้ผู้สมัครเซ็นเอกสารเอง (8 พ.ย. 2569) — **ไฟล์กลางของทั้งสองฝั่ง** (client-safe)
 *
 * ฝ่ายบุคคลสร้างลิงก์จากกล่องทำเอกสาร (เลือกฉบับที่จะให้เซ็น) แล้วคัดลอกส่งทาง LINE ·
 * ผู้สมัครเปิด `/recruitment/sign/{token}` **โดยไม่ต้องเข้าสู่ระบบ** อ่านเอกสารแบบ
 * อ่านอย่างเดียว แล้วเซ็นบนจอหรือแนบรูปลายเซ็นลงช่องผู้สมัครทีละฉบับ
 *
 * - ด่านคือ token สุ่ม 256 บิตในลิงก์ · อายุ `SIGN_LINK_DAYS` วัน · ใบสมัครหนึ่งใบมีลิงก์
 *   ที่ใช้ได้แค่ลิงก์เดียว สร้างใหม่ = ลิงก์เก่าใช้ไม่ได้ทันที · ฝ่ายบุคคลยกเลิกเองได้
 * - เอกสารบนหน้านั้นวาดจาก **ค่าที่บันทึกแล้ว** เท่านั้น — สร้างลิงก์ได้เมื่อบันทึกแล้ว
 * - ผู้สมัครเซ็นได้แค่ช่องของตัวเอง ครั้งเดียวต่อฉบับ (ล็อก) · ฝ่ายบุคคลล้างให้เซ็นใหม่ได้
 *   จากกล่องทำเอกสาร · ลายเซ็นเขียนลง `fill.signatures` ของเอกสารหลักตรง ๆ
 */

export const SIGN_LINK_DAYS = 7;

/** ฉบับที่มีช่องผู้สมัคร — ส่งให้เซ็นผ่านลิงก์ได้ */
export const SIGNABLE_DOCS = (Object.keys(DOC_SIGN_SLOTS) as HrDocId[]).filter((doc) =>
  DOC_SIGN_SLOTS[doc].some((s) => !s.staff),
);

export function isSignableDoc(v: unknown): v is HrDocId {
  return typeof v === "string" && (SIGNABLE_DOCS as string[]).includes(v);
}

export const signPath = (token: string) => `/recruitment/sign/${token}`;

/** `GET/POST …/applications/{id}/sign-link` — ลิงก์ที่ใช้ได้อยู่ (ถ้ามี) + สถานะการเซ็น */
export interface SignLinkState {
  link: {
    token: string;
    docs: HrDocId[];
    createdAt: string;
    createdBy: string;
    expiresAt: string;
  } | null;
  /** ฉบับที่ช่องผู้สมัคร **ในฐาน** เซ็นแล้ว → เวลาเซ็น */
  signed: Partial<Record<HrDocId, string>>;
  /** บันทึกเอกสารแล้วหรือยัง — ยังไม่บันทึกสร้างลิงก์ไม่ได้ */
  hasRecord: boolean;
}
