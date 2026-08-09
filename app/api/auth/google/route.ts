import { NextResponse, type NextRequest } from "next/server";

import { authorizeUrl, callbackUrl } from "@/lib/auth/google";
import { NEXT_COOKIE, STATE_COOKIE, safeNextPath } from "@/lib/auth/token";

/**
 * `GET /api/auth/google` — จุดเริ่มของการล็อกอิน ปุ่มบนหน้า `/` พามาที่นี่
 *
 * ออกค่า `state` สุ่มแล้วเก็บไว้ในคุกกี้ก่อนส่งต่อไป Google — ขากลับต้องตรงกัน
 * ไม่งั้นถือว่าไม่ใช่คำขอที่เริ่มจากหน้านี้ (กัน CSRF ตามสเปก OAuth)
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const state = crypto.randomUUID();
    const response = NextResponse.redirect(
      authorizeUrl(state, callbackUrl(request)),
    );

    const shortLived = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      // อายุพอให้เลือกบัญชีเสร็จ — ทิ้งค้างไว้นานกว่านี้ไม่มีประโยชน์
      maxAge: 300,
    };

    response.cookies.set(STATE_COOKIE, state, shortLived);

    // ปลายทางเดิมที่ `middleware.ts` เด้งมา — ฝากไว้ในคุกกี้ ไม่ใช่ยัดใน `state`
    // ที่ต้องวิ่งผ่าน Google (ค่าที่วิ่งออกนอกบ้านแล้วกลับมา เชื่อไม่ได้อยู่ดี)
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    if (next) response.cookies.set(NEXT_COOKIE, next, shortLived);

    return response;
  } catch (err) {
    // ตั้งค่า env ไม่ครบ — พากลับหน้าล็อกอินพร้อมเหตุผลจริง ไม่ใช่หน้า 500 เปล่า ๆ
    const reason = err instanceof Error ? err.message : "เริ่มการล็อกอินไม่สำเร็จ";
    const back = new URL("/", request.url);
    back.searchParams.set("state", "error-network");
    back.searchParams.set("reason", reason);
    return NextResponse.redirect(back);
  }
}
