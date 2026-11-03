import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  safeNextPath,
  signSession,
  verifySession,
  type SessionPayload,
} from "@/lib/auth/token";
import { isInactive, toSessionUser } from "@/lib/auth/user";
import { API_KEY_HEADER, resolveApiKey } from "@/lib/auth/api-keys";
import { NcacError, getUser } from "@/lib/ncac/client";

/**
 * ด่านล็อกอิน — ไม่มี session ที่ลายเซ็นถูกต้องและยังไม่หมดอายุ = เข้าไม่ได้
 *
 * ชื่อไฟล์คือ `proxy.ts` ไม่ใช่ `middleware.ts` — Next 16 เปลี่ยนชื่อ convention นี้แล้ว
 * (ของเดิมยังทำงานได้แต่ขึ้นคำเตือนตอน build)
 *
 * ครอบสองอย่าง:
 * 1. **หน้า `/home` · `/desk/**`** → เด้งกลับหน้าล็อกอิน พร้อมจำปลายทางเดิมไว้ใน `next`
 *    (ลิงก์จากกระดิ่งแจ้งเตือน/บุ๊กมาร์กจึงพากลับมาที่เคสเดิมได้หลังล็อกอิน)
 * 2. **คำสั่งที่เขียนข้อมูล** (`POST`/`PATCH`/`PUT`/`DELETE` ใต้ `/api/**`) → 401
 *    เพราะทุกคำสั่งเหล่านี้ลงชื่อผู้ทำใน `complaint_logs` ของ NCAC · `GET` ยังปล่อยผ่าน
 *    (หน้าที่เรียกมันอยู่ใต้ `/desk/**` ซึ่งถูกกั้นไปแล้วตั้งแต่ชั้นบน)
 *
 * 3. **หน้าล็อกอิน `/`** → ล็อกอินอยู่แล้วไม่ต้องเห็นหน้านี้อีก ส่งต่อไป `/home` (หรือ `next`)
 *
 * 4. **`x-api-key`** (ไม่มีคุกกี้) ใต้ `/api/**` → ทำเป็น session ของเจ้าของ key (`authorizeApiKey`)
 *
 * และทุกครั้งที่ **เปิดหน้าเต็ม ๆ** (เข้าระบบ / รีเฟรช — ไม่ใช่ client navigation หรือ
 * prefetch) จะอ่านข้อมูลผู้ใช้ใหม่จาก NCAC ด้วยรหัสพนักงาน แล้วเซ็นคุกกี้ทับ — ย้ายแผนก
 * เปลี่ยนตำแหน่ง/รูป มีผลทันทีโดยไม่ต้องล็อกอินใหม่ (ดู `refreshSession`)
 *
 * ใช้ได้เฉพาะของที่ไม่ผูกกับ `next/headers` — `lib/auth/session.ts` ใช้ `cookies()`
 * เอามาที่นี่ไม่ได้ จึงอ่านจาก `request.cookies` แล้วเรียก `verifySession()` ตรง ๆ
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** รอ NCAC ได้ไม่เกินนี้ — เกินแล้วใช้ข้อมูลเดิมในคุกกี้ไปก่อน (Render ตื่นช้าตอน cold start) */
const REFRESH_TIMEOUT_MS = 4_000;

/**
 * เปิดหน้าเต็ม ๆ จากเบราว์เซอร์ — ไม่นับ RSC payload ของ `<Link>` และ prefetch
 * ซึ่งยิงถี่มาก ถ้าอ่าน NCAC ทุกครั้งตรงนั้นเปลี่ยนหน้าในระบบจะช้าลงทุกคลิก
 *
 * ดูจาก `Sec-Fetch-Dest` ที่เบราว์เซอร์ใส่ให้เอง (`document` = เปิด/รีเฟรชหน้า,
 * `empty` = fetch) — header `RSC` ของ Next ใช้ไม่ได้ เพราะ Next ตัดทิ้งก่อนถึง proxy
 */
function isDocumentLoad(request: NextRequest): boolean {
  return request.method === "GET" && request.headers.get("sec-fetch-dest") === "document";
}

/** กลับหน้าล็อกอินพร้อมเหตุผล และทิ้งคุกกี้ session */
function endSession(request: NextRequest, reason: string) {
  const login = new URL("/", request.url);
  login.searchParams.set("state", "error-domain");
  login.searchParams.set("reason", reason);
  const response = NextResponse.redirect(login);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

/**
 * อ่านผู้ใช้ใหม่ด้วยรหัสพนักงาน แล้วเซ็นคุกกี้ทับ — ทั้งในคำตอบ (เบราว์เซอร์เก็บไว้)
 * และใน request ที่กำลังส่งต่อ (หน้าที่ render รอบนี้อ่าน `cookies()` ได้ค่าใหม่ทันที)
 *
 * - ไม่พบรหัสนี้แล้ว / สถานะ Inactive → ออกจากระบบ
 * - NCAC ล่มหรือช้า → **ปล่อยผ่านด้วยข้อมูลเดิม** ไม่ล็อกทุกคนออกเพราะ API สะดุด
 * - `exp` เดิมไม่ขยับ — อ่านข้อมูลใหม่ไม่ได้แปลว่าต่ออายุ session
 */
async function refreshSession(request: NextRequest, session: SessionPayload) {
  let fresh;
  try {
    fresh = await getUser(session.user.employeeId, {
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof NcacError && err.status === 404) {
      return endSession(request, "ไม่พบรหัสพนักงานนี้ในระบบ NCAC แล้ว — กรุณาติดต่อฝ่าย IT");
    }
    return NextResponse.next();
  }

  if (isInactive(fresh)) {
    return endSession(request, "บัญชีพนักงานนี้ไม่อยู่ในสถานะใช้งาน — กรุณาติดต่อฝ่ายบุคคล");
  }

  const user = toSessionUser(fresh);
  if (!user.employeeId) return NextResponse.next();

  let cookie: string;
  try {
    cookie = await signSession({ ...session, user });
  } catch {
    return NextResponse.next();
  }

  request.cookies.set(SESSION_COOKIE, cookie);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SESSION_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(1, Math.floor((session.exp - Date.now()) / 1000)),
  });
  return response;
}

/** session ที่ทำจาก API key มีอายุแค่คำขอเดียว — ไม่ส่งกลับไปเป็นคุกกี้ของผู้เรียก */
const API_KEY_SESSION_MS = 5 * 60 * 1000;

/**
 * เรียก `/api/**` ด้วย `x-api-key` (สร้างที่หน้า API Docs · ดู `lib/auth/api-keys.ts`)
 *
 * key ถูกต้อง = เซ็น session อายุสั้นของ **เจ้าของ key** ใส่ใน request ที่ส่งต่อ (ท่าเดียวกับ
 * `refreshSession`) route ทุกเส้นจึงอ่าน `readSessionUser()` ได้คนเดียวกับตอนล็อกอินโดยไม่ต้องแก้
 * · key อ่านอย่างเดียวยิงคำสั่งเขียน = 403 · ไม่ตั้งคุกกี้ในคำตอบ
 */
async function authorizeApiKey(request: NextRequest, raw: string) {
  let resolved;
  try {
    resolved = await resolveApiKey(raw);
  } catch {
    return NextResponse.json({ error: "ตรวจ API key ไม่สำเร็จ — ลองใหม่อีกครั้ง" }, { status: 503 });
  }
  if (!resolved) {
    return NextResponse.json({ error: "API key ไม่ถูกต้อง ถูกยกเลิก หรือหมดอายุแล้ว" }, { status: 401 });
  }
  if (resolved.scope === "read" && WRITE_METHODS.has(request.method)) {
    return NextResponse.json(
      { error: "API key นี้อ่านได้อย่างเดียว — สร้าง key ที่อนุญาตให้เขียนได้ที่หน้า API Docs" },
      { status: 403 },
    );
  }

  const cookie = await signSession({ user: resolved.user, token: "", exp: Date.now() + API_KEY_SESSION_MS });
  request.cookies.set(SESSION_COOKIE, cookie);
  return NextResponse.next({ request: { headers: request.headers } });
}

export default async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;

  if (pathname === "/") {
    if (!session) return NextResponse.next();
    const next = safeNextPath(request.nextUrl.searchParams.get("next")) ?? "/home";
    return NextResponse.redirect(new URL(next, request.url));
  }

  if (session) {
    return isDocumentLoad(request) ? refreshSession(request, session) : NextResponse.next();
  }

  /* จัดการ key เองต้องล็อกอินจริง (key สร้าง key ต่อไม่ได้) · เส้นล็อกอินไม่เกี่ยวกับ key */
  const apiKey = request.headers.get(API_KEY_HEADER);
  if (apiKey && pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/") && !pathname.startsWith("/api/api-keys")) {
    return authorizeApiKey(request, apiKey);
  }

  if (pathname.startsWith("/api/")) {
    if (!WRITE_METHODS.has(request.method)) return NextResponse.next();
    // ทางล็อกอิน/ออกจากระบบต้องผ่านได้เสมอ ไม่งั้นจะล็อกอินไม่ได้ทั้งระบบ
    if (pathname.startsWith("/api/auth/")) return NextResponse.next();
    /* ใบสมัครงานมาจากคนนอกที่ไม่มีวันมีบัญชีในระบบ — เส้นใต้ `public/` จึงต้อง
       เขียนข้อมูลได้โดยไม่ต้องล็อกอิน · ทุกเส้นในกลุ่มนี้รับเฉพาะข้อมูลของผู้ยิงเอง
       และตรวจความยินยอม/คำตอบซ้ำในชั้นข้อมูลอีกที (ดู `lib/recruitment/`)
       ส่วนเส้นจัดการคำถามและใบสมัครอยู่นอก `public/` จึงยังถูกกันไว้ตามเดิม */
    /* รูปเอกสารของผู้สมัครอัปผ่าน `/api/recruitment/public/uploads` (S3 private) แล้ว —
       `/api/uploads` (รูปแนบคำร้อง → Spaces สาธารณะ) จึงไม่เปิดให้คนนอกอีก (1 ต.ค. 2026) */
    if (pathname.startsWith("/api/recruitment/public/")) return NextResponse.next();
    return NextResponse.json(
      { error: "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง" },
      { status: 401 },
    );
  }

  const login = new URL("/", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  /* `/recruitment` เองไม่อยู่ในรายการ — หน้าแรก ฟอร์มสมัคร นโยบายความเป็นส่วนตัว
     และหน้าติดตามสถานะ ต้องเปิดให้คนนอกเข้าได้ · กันเฉพาะ `/recruitment/admin`
     ซึ่งเป็นที่ที่ฝ่ายบุคคลเห็นข้อมูลส่วนบุคคลของผู้สมัครทุกคน */
  /* `/payroll/**` เห็นเงินเดือนของพนักงานทุกคน — ข้อมูลที่อ่อนไหวที่สุดในระบบ
     ทุกหน้าใต้เส้นนี้ต้องล็อกอินเสมอ ไม่มีหน้าสาธารณะเลยสักหน้า */
  matcher: [
    "/",
    "/home/:path*",
    "/desk/:path*",
    "/recruitment/admin/:path*",
    "/payroll/:path*",
    "/api/:path*",
  ],
};
