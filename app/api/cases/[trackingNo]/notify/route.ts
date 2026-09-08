import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { bodyOf, resolveRecipients, subjectOf } from "@/lib/case-notify";
import { buildDirectory, toHrCase } from "@/lib/ncac/adapt";
import { getComplaint, listUsers } from "@/lib/ncac/client";

/**
 * ร่างอีเมลแจ้งหน่วยงานผู้รับผิดชอบ — **อ่านอย่างเดียว ไม่มีเส้นส่ง**
 *
 * เมลออกจากบัญชี Gmail ของผู้ใช้เอง (หน้าจอเปิดหน้าเขียนเมลให้พร้อมกรอก) ระบบจึง
 * ไม่ต้องถือรหัสผ่านหรือโทเคนของใคร และไม่มีทางที่ใครยิง API ตรงแล้วใช้ระบบ
 * ส่งเมลในนามคนอื่นได้ — เพราะไม่มีอะไรให้ยิง
 *
 * ต้องล็อกอินก่อน (ตรวจในตัว route — `proxy.ts` ปล่อย GET ผ่านหมด)
 * คืน: ผู้รับตามกฎ (TO = หัวหน้า · CC = ผู้จัดการ) · หัวเรื่อง · เนื้อความข้อความล้วน
 * · อีเมลของผู้ใช้ที่ล็อกอินอยู่ (ไว้ชี้ว่าจะให้ Gmail เปิดด้วยบัญชีไหน)
 */

/** เคส + สมุดรายชื่อในคำขอเดียว — ทั้งผู้รับและอีเมลผู้ส่งอ่านจากชุดเดียวกัน */
async function load(trackingNo: string) {
  const [complaint, users] = await Promise.all([
    getComplaint(trackingNo),
    listUsers(),
  ]);
  return { hrCase: toHrCase(complaint, buildDirectory(users)), users };
}

/**
 * ที่อยู่ของเว็บตามที่ผู้ใช้เปิดอยู่จริง — ใช้ทำลิงก์ “เปิดคำร้องในระบบ” ในเมล
 * (อ่านจาก header เผื่ออยู่หลัง proxy — ท่าเดียวกับ `callbackUrl()` ของฝั่งล็อกอิน)
 */
function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]/notify">,
) {
  try {
    /**
     * เส้นนี้ตรวจ session เอง — `proxy.ts` ปล่อย `GET /api/**` ผ่านโดยไม่ต้องล็อกอิน
     * (กฎเดิมของระบบ: กันเฉพาะคำสั่งที่เขียนข้อมูล) แต่เส้นนี้คืน **อีเมลพนักงาน
     * ทั้งหน่วยงาน** ซึ่งเป็นข้อมูลชุดที่ไม่เคยเปิดผ่าน API มาก่อน — ปล่อยตามกฎเดิม
     * เท่ากับเปิดสมุดอีเมลบริษัทให้คนนอกดึงไปทั้งชุด
     */
    const me = await readSessionUser();
    if (!me) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const { trackingNo } = await ctx.params;
    const { hrCase, users } = await load(decodeURIComponent(trackingNo));

    if (!hrCase.departmentId) {
      return badRequest(
        "คำร้องนี้ยังไม่มีหน่วยงานผู้รับผิดชอบ — มอบหมายก่อนจึงจะแจ้งทางอีเมลได้",
      );
    }

    const plan = await resolveRecipients(hrCase.departmentId, users);

    /**
     * อีเมลของคนที่ล็อกอินอยู่ — session ของ NCAC ไม่มีฟิลด์ `email` (ดู `AuthUserDto`)
     * จึงต้องเทียบรหัสพนักงานกับสมุดรายชื่อเอา · หาไม่เจอก็ยังใช้งานได้
     * แค่ Gmail จะเปิดด้วยบัญชีแรกที่ล็อกอินไว้แทนที่จะเจาะจงบัญชีบริษัท
     */
    const senderEmail =
      (users.find((u) => String(u.employee_id) === me.employeeId)?.email ?? "")
        .replace(/\s+/g, "")
        .toLowerCase() || null;

    return ok({
      trackingNo: hrCase.trackingNo,
      subject: subjectOf(hrCase),
      /* สองท่อน — หน้าจอแทรก “ข้อความเพิ่มเติม” ตรงกลางเองระหว่างพิมพ์ */
      body: bodyOf(hrCase, originOf(request)),
      senderEmail,
      ...plan,
    });
  } catch (err) {
    return fail(err);
  }
}
