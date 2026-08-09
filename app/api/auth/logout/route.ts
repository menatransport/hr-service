import { NextResponse } from "next/server";

import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/auth/token";

/**
 * `POST /api/auth/logout` — ลบคุกกี้ session ทิ้ง
 *
 * เป็น `POST` ไม่ใช่ลิงก์ `GET` โดยตั้งใจ — `<Link>` ของ Next จะ prefetch ให้เอง
 * ถ้าทำเป็น GET ผู้ใช้จะถูกเตะออกจากระบบเพียงเพราะเมาส์ไปวางบนปุ่ม
 *
 * ไม่ได้บอก NCAC ว่า logout เพราะ JWT ฝั่งนั้นเป็น stateless (หมดอายุเองใน 30 นาที)
 * — session ที่มีความหมายกับระบบนี้คือคุกกี้ใบนี้ใบเดียว
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(STATE_COOKIE);
  return response;
}
