import { NextResponse, type NextRequest } from "next/server";

import { badRequest, fail, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { BE_OFFSET, CURRENT_PERIOD, type PeriodRef } from "@/lib/payroll/period";
import {
  buildAllTemplates,
  buildItemTemplate,
} from "@/lib/payroll/template-export";

/**
 * แบบฟอร์มรับข้อมูลเงินเดือน (.xlsx)
 *
 * `GET /api/payroll/intake/template?period=2026-09&itemId=01` — ฟอร์มของรายการเดียว
 * `GET /api/payroll/intake/template?period=2026-09`           — ทั้งชุด 30 รายการ
 *
 * **สร้างสดทุกครั้ง ไม่เก็บไฟล์นิ่ง** เพื่อให้ฟอร์มตรงกับทะเบียนเสมอ (เหตุผลเต็มอยู่
 * ที่หัวไฟล์ `lib/payroll/template-export.ts`) — ไฟล์เล็กมาก สร้างใหม่ถูกกว่าซิงก์
 *
 * **ต้องเช็ก session เองที่นี่** เหมือนเส้น `GET` ของสถานะรอบ — `proxy.ts` กันเฉพาะ
 * คำสั่งที่เขียนข้อมูล และฟอร์มนี้มีทะเบียนแพล้นท์ทั้ง 107 แห่งกับผู้ว่าจ้างทุกราย
 * ติดไปด้วยในชีตรหัสอ้างอิง ซึ่งไม่ใช่ของที่ควรหลุดออกไปโดยไม่ต้องล็อกอิน
 */

/** `2569-09` ไม่ใช่รูปแบบนี้ — คีย์ที่ระบบใช้เป็น ค.ศ. เสมอ (ดู `period.ts`) */
function readPeriod(raw: string | null): PeriodRef | null {
  if (!raw) return CURRENT_PERIOD;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(raw);
  if (!match) return null;
  return {
    year: Number(match[1]) + BE_OFFSET,
    month: Number(match[2]) - 1,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const params = request.nextUrl.searchParams;
    const period = readPeriod(params.get("period"));
    if (!period) return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");

    const itemId = params.get("itemId")?.trim();
    const { file, name } = itemId
      ? await buildItemTemplate(itemId, period)
      : await buildAllTemplates(period);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="template.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // ฟอร์มเปลี่ยนตามทะเบียนได้ทุกเมื่อ — แคชไว้แล้วคนจะได้ของเก่าโดยไม่รู้ตัว
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
