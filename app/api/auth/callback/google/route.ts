import { NextResponse, type NextRequest } from "next/server";

import { callbackUrl, exchangeCodeForIdToken } from "@/lib/auth/google";
import { sessionCookieOptions } from "@/lib/auth/session";
import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  STATE_COOKIE,
  safeNextPath,
  signSession,
} from "@/lib/auth/token";
import { toSessionUser } from "@/lib/auth/user";
import { NcacError, loginWithGoogle } from "@/lib/ncac/client";

/**
 * `GET /api/auth/callback/google` — ขากลับจาก Google
 *
 * พาธนี้ถูกเลือกให้ตรงกับ redirect URI ที่ลงทะเบียนไว้กับ client id นี้อยู่แล้ว
 * (ดู `CALLBACK_PATH` ใน `lib/auth/google.ts` — ย้ายพาธเมื่อไหร่ล็อกอินพังทันที)
 *
 * ลำดับ: ตรวจ `state` → แลก `code` เป็น `id_token` → ส่งให้ NCAC ตรวจและออก
 * session → เก็บคุกกี้ → เข้า `/home`
 *
 * **ทุกทางที่ล้มเหลวต้องจบที่หน้าล็อกอินพร้อมเหตุผลจริง** ไม่ใช่หน้า error ของ Next
 * เพราะผู้ใช้ต้องรู้ว่าควรทำอะไรต่อ (ใช้อีเมลบริษัท / ติดต่อ IT / ลองใหม่)
 */

export const dynamic = "force-dynamic";

/** พากลับหน้าล็อกอินพร้อมสถานะที่การ์ดล็อกอินรู้จัก + เหตุผลจากของจริง */
function backToLogin(
  request: NextRequest,
  state: "error-domain" | "error-network",
  reason?: string,
) {
  const url = new URL("/", request.url);
  url.searchParams.set("state", state);
  if (reason) url.searchParams.set("reason", reason);

  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(NEXT_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // ผู้ใช้กดยกเลิกที่หน้าเลือกบัญชี — ไม่ใช่ความผิดพลาด กลับหน้าล็อกอินเงียบ ๆ
  const denied = params.get("error");
  if (denied === "access_denied" || denied === "user_cancelled") {
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.delete(STATE_COOKIE);
    return response;
  }
  if (denied) return backToLogin(request, "error-network", `Google ตอบกลับ: ${denied}`);

  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get(STATE_COOKIE)?.value;

  if (!code) return backToLogin(request, "error-network", "Google ไม่ได้ส่งรหัสยืนยันกลับมา");
  if (!state || !expected || state !== expected) {
    return backToLogin(
      request,
      "error-network",
      "คำขอล็อกอินหมดอายุหรือไม่ได้เริ่มจากหน้านี้ — กรุณากดเข้าสู่ระบบใหม่อีกครั้ง",
    );
  }

  try {
    const idToken = await exchangeCodeForIdToken(code, callbackUrl(request));
    const result = await loginWithGoogle(idToken);
    const user = toSessionUser(result.user ?? {});

    if (!user.employeeId) {
      return backToLogin(
        request,
        "error-domain",
        "บัญชีนี้ยังไม่มีรหัสพนักงานในระบบ NCAC — กรุณาติดต่อฝ่าย IT",
      );
    }

    const cookie = await signSession({
      user,
      token: result.access_token,
      exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
    });

    // กลับไปหน้าที่ตั้งใจจะเปิดตั้งแต่แรก ถ้าไม่มีก็หน้าหลัก · `welcome=1`
    // ทำให้ขนมปังปิ้ง “เข้าสู่ระบบสำเร็จ” เด้งครั้งเดียวตอนมาถึง
    const destination = new URL(
      safeNextPath(request.cookies.get(NEXT_COOKIE)?.value) ?? "/home",
      request.url,
    );
    destination.searchParams.set("welcome", "1");

    const response = NextResponse.redirect(destination);
    response.cookies.set(SESSION_COOKIE, cookie, sessionCookieOptions);
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(NEXT_COOKIE);
    return response;
  } catch (err) {
    // 401/403 = บัญชีใช้ไม่ได้ (โดเมนผิด หรือยังไม่มีในฐานข้อมูล) — คนละเรื่องกับ
    // ต่อ NCAC ไม่ติด ซึ่งผู้ใช้แก้เองได้ด้วยการลองใหม่
    const rejected = err instanceof NcacError && (err.status === 401 || err.status === 403);
    const reason = err instanceof Error ? err.message : undefined;
    return backToLogin(request, rejected ? "error-domain" : "error-network", reason);
  }
}
