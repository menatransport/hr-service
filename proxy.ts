import { NextResponse, type NextRequest } from "next/server";

import { decideGate, needsPartnerRole } from "@/lib/auth/gate";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";
import type { Role } from "@/lib/partner/rbac";

/**
 * ด่านเดียวของทั้งแอป — hr-service + ระบบรถร่วม (ย้ายมาจาก mena-partner-driver 19 ต.ค. 2569)
 *
 * ชื่อไฟล์คือ `proxy.ts` ไม่ใช่ `middleware.ts` — Next 16 เปลี่ยนชื่อ convention นี้แล้ว
 * **ตรรกะทั้งหมดอยู่ใน `lib/auth/gate.ts` (pure, มีเทสต์เป็นตาราง)** — ไฟล์นี้แค่อ่านคุกกี้ หา role
 * แล้วแปลงคำตัดสินเป็น response
 *
 * กฎเดิมของ hr ยังอยู่ครบ:
 * 1. หน้า `/home` · `/desk/**` · `/payroll/**` · `/recruitment/admin/**` → เด้งหน้าล็อกอินพร้อม `next`
 * 2. คำสั่งที่เขียนข้อมูลใต้ `/api/**` → 401 · `GET` ยังปล่อยผ่าน (หน้าที่เรียกถูกกั้นแล้วชั้นบน)
 *    ยกเว้น `/api/auth/*` และ `/api/recruitment/public/*` (ใบสมัครงานจากคนนอก — ตรวจซ้ำใน `lib/recruitment/`;
 *    รูปเอกสารผู้สมัครอัปผ่าน `/api/recruitment/public/uploads` · `/api/uploads` ไม่เปิดให้คนนอกตั้งแต่ 1 ต.ค. 2026)
 *
 * กฎของรถร่วม:
 * - `/api/partner/**` **ทุก method ต้องล็อกอิน** (มีข้อมูลเงิน/สัญญา) · เขียน = RBAC ตามบทบาท
 * - หน้า `/partner/**` ต้องล็อกอิน · ฝ่ายขายเห็นแค่ราคาขาย/ใบเสนอราคา/catalog
 * - public: `/trucks` `/sitemap.xml` `/robots.txt` `/og/*` `/api/public/*` · `/api/partner/cron/*` (route ตรวจ Bearer เอง)
 *
 * **runtime = Node.js** (ค่าเริ่มต้นของ proxy ใน Next 16 และตั้งเป็นอย่างอื่นไม่ได้ — ดู
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` หัวข้อ Runtime)
 * จึงหา role จาก `mena_partner.app_users` ได้ตรงที่นี่ — โหลดโมดูล Mongo แบบ dynamic import
 * **เฉพาะคำขอใต้ `/partner` และ `/api/partner` ที่ล็อกอินแล้ว** คำขอของ hr ไม่แตะฐานเพิ่มเลย
 * (`resolveRole` cache 60 วิ · ฐานล่ม = viewer)
 *
 * route ของรถร่วมควรตรวจซ้ำด้วย `requirePartnerPerm()` (`lib/partner/auth/server.ts`) — Next แนะนำ
 * ไม่ให้พึ่ง proxy อย่างเดียว เพราะ matcher เปลี่ยนแล้วด่านหลุดได้เงียบ ๆ
 */

async function partnerRole(email: string | undefined): Promise<Role> {
  try {
    const { resolveRole } = await import("@/lib/partner/roles");
    return await resolveRole(email);
  } catch {
    return "viewer";
  }
}

export default async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = request.nextUrl;
  const authenticated = Boolean(session);

  const role = needsPartnerRole(pathname, authenticated)
    ? await partnerRole(session?.user.email)
    : null;

  const decision = decideGate({
    pathname,
    search,
    method: request.method,
    authenticated,
    role,
  });

  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, request.url));
    case "json":
      return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
}

export const config = {
  /* `/recruitment` เองไม่อยู่ในรายการ — หน้าแรก ฟอร์มสมัคร นโยบายความเป็นส่วนตัว
     และหน้าติดตามสถานะ ต้องเปิดให้คนนอกเข้าได้ · กันเฉพาะ `/recruitment/admin`
     ซึ่งเป็นที่ที่ฝ่ายบุคคลเห็นข้อมูลส่วนบุคคลของผู้สมัครทุกคน */
  /* `/payroll/**` เห็นเงินเดือนของพนักงานทุกคน — ข้อมูลที่อ่อนไหวที่สุดในระบบ
     ทุกหน้าใต้เส้นนี้ต้องล็อกอินเสมอ ไม่มีหน้าสาธารณะเลยสักหน้า */
  /* `/partner/**` ระบบรถร่วม — สัญญา/เงินคนขับ ต้องล็อกอินทุกหน้า
     หน้าเว็บขายรถสาธารณะ (`/trucks`, `/og/*`, SEO) อยู่นอก matcher จึงไม่ผ่านด่านเลย
     ส่วน `/api/public/*` อยู่ใต้ `/api/:path*` แต่ gate ปล่อยผ่านทุก method */
  matcher: [
    "/home/:path*",
    "/desk/:path*",
    "/recruitment/admin/:path*",
    "/payroll/:path*",
    "/partner/:path*",
    "/api/:path*",
  ],
};
