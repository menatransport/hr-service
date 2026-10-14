import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/ncac/client";
import { canPassIntake, HR_DEPARTMENT_LABEL } from "@/lib/payroll/approver";
import { listIntake } from "@/lib/payroll/intake";
import type { IntakeRecord } from "@/lib/payroll/intake-status";
import { notifyDraft } from "@/lib/payroll/notify";
import { BE_OFFSET, type PeriodRef } from "@/lib/payroll/period";
import { OWNER_ORDER, type IntakeOwner } from "@/lib/payroll/registry";

/**
 * ร่างอีเมลแจ้งฝ่ายว่าเปิดรอบแล้ว — **อ่านอย่างเดียว ไม่มี `POST` ไม่มีเส้นส่ง**
 *
 * `GET /api/payroll/notify?period=2026-09[&owner=<ฝ่าย>]` — ไม่ระบุ `owner` = ร่างของทุกฝ่าย
 *
 * ระบบไม่ส่งเมลเอง: หน้าจอเปิดหน้าเขียนเมลของ Gmail ให้พร้อมกรอก แล้ว HR กดส่งจากบัญชี
 * ของตัวเอง (มติ 8 ก.ย. และ 14 ต.ค. 2569 — ดู `lib/payroll/notify.ts`) จึงไม่มีบัญชีเมลกลาง
 * ไม่มีโทเคนที่ต้องเก็บ และไม่มีทางที่ใครยิง API ตรงแล้วใช้ระบบส่งเมลในนามคนอื่นได้
 * เพราะไม่มีอะไรให้ยิง
 *
 * **ต้องล็อกอินและต้องเป็น HR** — คนที่แจ้งฝ่ายตาม flow คือ HR และเส้นนี้คืน **อีเมลพนักงาน
 * ทั้งหน่วยงาน** · เช็ก session เองที่นี่เพราะ `proxy.ts` ปล่อย `GET /api/**` ผ่านโดยไม่ล็อกอิน
 *
 * ฝ่ายที่ยังไม่มีรหัสหน่วยงานของ NCAC ได้ร่างที่ใช้ได้พร้อม `directoryMissing: true` และ
 * ผู้รับว่าง ไม่ใช่ error และไม่ถูกข้ามไปเงียบ ๆ
 */

/** `2026-09` เท่านั้น — เหมือน `/api/payroll/intake` */
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function originOf(request: NextRequest): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  try {
    const me = await readSessionUser();
    if (!me) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const identity = await getDeskIdentity();
    if (!canPassIntake(identity)) {
      return forbidden(
        `แจ้งฝ่ายทางอีเมลได้เฉพาะ${HR_DEPARTMENT_LABEL} — บัญชีนี้สังกัด ${identity.department || "หน่วยงานที่ไม่ระบุ"}`,
      );
    }

    const code = request.nextUrl.searchParams.get("period") ?? "";
    const match = PERIOD_RE.exec(code);
    if (!match) {
      return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
    }
    const period: PeriodRef = {
      year: Number(match[1]) + BE_OFFSET,
      month: Number(match[2]) - 1,
    };

    const ownerParam = request.nextUrl.searchParams.get("owner");
    let owners: IntakeOwner[] = OWNER_ORDER;
    if (ownerParam) {
      if (!OWNER_ORDER.includes(ownerParam as IntakeOwner)) {
        return badRequest(`ไม่รู้จักฝ่าย “${ownerParam}” — ต้องเป็นหนึ่งใน ${OWNER_ORDER.join(" / ")}`);
      }
      owners = [ownerParam as IntakeOwner];
    }

    /* สมุดรายชื่อกับสถานะรอบอ่านครั้งเดียวแล้วใช้ร่วมกันทุกฝ่าย */
    const [users, rows] = await Promise.all([listUsers(), listIntake(code)]);
    const records = new Map<string, IntakeRecord>(rows.map((r) => [r.itemId, r]));
    const origin = originOf(request);
    const now = new Date();

    const drafts = await Promise.all(
      owners.map((owner) => notifyDraft({ owner, period, origin, records, now, users })),
    );

    /* session ของ NCAC ไม่มีฟิลด์ email — เทียบรหัสพนักงานกับสมุดรายชื่อเอา หาไม่เจอก็ยังใช้ได้
       แค่ Gmail เปิดด้วยบัญชีแรกที่ล็อกอินไว้ (ท่าเดียวกับเส้นแจ้งหน่วยงานของฝั่งคำร้อง) */
    const senderEmail =
      (users.find((u) => String(u.employee_id) === me.employeeId)?.email ?? "")
        .replace(/\s+/g, "")
        .toLowerCase() || null;

    return ok({ period: code, senderEmail, drafts });
  } catch (err) {
    return fail(err);
  }
}
