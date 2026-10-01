import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/**
 * ด่านล็อกอิน — ไม่มี session ที่ลายเซ็นถูกต้องและยังไม่หมดอายุ = เข้าไม่ได้
 *
 * ชื่อไฟล์คือ `proxy.ts` ไม่ใช่ `middleware.ts` — Next 16 เปลี่ยนชื่อ convention นี้แล้ว
 * (ของเดิมยังทำงานได้แต่ขึ้นคำเตือนตอน build)
 *
 * ครอบสองอย่าง:
 * 1. **หน้า `/desk/**`** → เด้งกลับหน้าล็อกอิน พร้อมจำปลายทางเดิมไว้ใน `next`
 *    (ลิงก์จากกระดิ่งแจ้งเตือน/บุ๊กมาร์กจึงพากลับมาที่เคสเดิมได้หลังล็อกอิน)
 * 2. **คำสั่งที่เขียนข้อมูล** (`POST`/`PATCH`/`PUT`/`DELETE` ใต้ `/api/**`) → 401
 *    เพราะทุกคำสั่งเหล่านี้ลงชื่อผู้ทำใน `complaint_logs` ของ NCAC · `GET` ยังปล่อยผ่าน
 *    (หน้าที่เรียกมันอยู่ใต้ `/desk/**` ซึ่งถูกกั้นไปแล้วตั้งแต่ชั้นบน)
 *
 * รันบน Edge จึงใช้ได้เฉพาะของใน `lib/auth/token.ts` (Web Crypto ล้วน) —
 * `lib/auth/session.ts` ใช้ `cookies()` ของ Node เอามาที่นี่ไม่ได้
 */

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;

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
    "/desk/:path*",
    "/recruitment/admin/:path*",
    "/payroll/:path*",
    "/api/:path*",
  ],
};
