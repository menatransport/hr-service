import { cookies } from "next/headers";

import {
  FALLBACK_DESK_IDENTITY,
  FALLBACK_MOBILE_IDENTITY,
  toDeskIdentity,
  toMobileIdentity,
  type DeskIdentity,
  type MobileIdentity,
} from "./identity";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  verifySession,
  type SessionPayload,
  type SessionUser,
} from "./token";

/**
 * อ่าน session ฝั่งเซิร์ฟเวอร์ — **server component / route handler เท่านั้น**
 * (ใช้ `cookies()` ซึ่ง client component เรียกไม่ได้ และ Edge middleware ก็ไม่ใช้ตัวนี้
 * — ที่นั่นอ่านจาก `request.cookies` แล้วเรียก `verifySession()` ตรง ๆ)
 */

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // คุกกี้เดินทางผ่าน https เสมอบน production · localhost ยังเป็น http จึงต้องปล่อย
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_MAX_AGE_SEC,
};

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function readSessionUser(): Promise<SessionUser | null> {
  return (await readSession())?.user ?? null;
}

/**
 * ตัวตนของผู้ใช้ฝั่ง desk — มาจาก session เสมอเมื่อล็อกอินแล้ว
 *
 * ไม่มี session จะได้ค่าสำรอง (`authenticated: false`) ซึ่งตามปกติจะไม่เกิดขึ้น
 * เพราะ `middleware.ts` กันหน้า `/desk/**` ไว้แล้ว — เหลือไว้กันหน้าจอพังตอน
 * คุกกี้หมดอายุพอดีระหว่าง render มากกว่าจะเป็นทางเข้าปกติ
 */
export async function getDeskIdentity(): Promise<DeskIdentity> {
  const user = await readSessionUser();
  return user ? toDeskIdentity(user) : FALLBACK_DESK_IDENTITY;
}

/**
 * ตัวตนของผู้ใช้ฝั่งมือถือ — คนที่ล็อกอิน Google ได้จะเห็น `/m` เป็นตัวเอง
 * ส่วนคนขับ (ยังไม่มีอีเมลบริษัท) ยังได้ค่าตัวอย่างเหมือนเดิม
 */
export async function getMobileIdentity(): Promise<MobileIdentity> {
  const user = await readSessionUser();
  return user ? toMobileIdentity(user) : FALLBACK_MOBILE_IDENTITY;
}

/**
 * รหัสพนักงานที่จะเอาไปลงใน `complaint_logs` ของ NCAC
 *
 * **route ที่เขียนข้อมูลต้องใช้ตัวนี้เท่านั้น ห้ามเชื่อค่าที่ client ส่งมา** —
 * ไม่งั้นใครยิง API ตรงก็อ้างเป็นคนอื่นได้ · ยังไม่ล็อกอินจะได้บัญชีระบบ
 * `HRSVC-DESK` ซึ่งมีอยู่จริงใน `/users` (FK ของ log ต้องชี้ไปที่แถวที่มีจริง)
 */
export async function getActorEmployeeId(): Promise<string> {
  return (await readSessionUser())?.employeeId ?? FALLBACK_DESK_IDENTITY.employeeId;
}
