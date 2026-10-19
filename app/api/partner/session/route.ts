import { NextResponse } from "next/server"

import { getPartnerSession } from "@/lib/partner/auth/server"

/**
 * `GET /api/partner/session` — แทน `/api/auth/session` ของ next-auth
 * คืน `PartnerSession` หรือ `null` (ไม่ล็อกอิน) · ไม่ cache เพราะบทบาทเปลี่ยนได้
 *
 * `proxy.ts` ปล่อยเส้นนี้ผ่านแม้ไม่ล็อกอิน — ให้ตอบ `null` แทน 401
 * (หน้า public ที่ห่อด้วย provider จะได้ไม่ต้องจัดการ error)
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await getPartnerSession()
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } })
}
