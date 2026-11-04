import type { NextRequest } from "next/server";

import { badRequest, fail, forbidden, ok, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { listIntakeEvents } from "@/lib/payroll/intake";
import { canUploadItem } from "@/lib/payroll/scope";

/**
 * `GET /api/payroll/intake/events?period=2026-09&itemId=13` — ร่องรอยการตัดสินของใบหนึ่ง
 *
 * ตอบคำถามที่แถวสถานะตอบไม่ได้: **ของชิ้นนี้เกิดอะไรขึ้นมาแล้วบ้าง** ใครส่ง ใครตีกลับ
 * ใครรับเข้ารอบด้วยเหตุผลอะไร · แถวใน `payroll_intake` เก็บแต่สถานะล่าสุด
 *
 * **`GET` ต้องเช็ก session เองที่นี่** — `proxy.ts` ปล่อย `GET` ใต้ `/api/**` ผ่านหมด
 * และผลลัพธ์มีชื่อคน ชื่อไฟล์ และเหตุผลที่ตีกลับ ซึ่งเป็นเรื่องภายในของแต่ละฝ่าย
 * ขอบเขตใช้ชุดเดียวกับการเปิดไฟล์ (`canUploadItem`) ไม่ได้คิดกติกาใหม่
 */

/** จำนวนเหตุการณ์ที่หน้าจอใช้ — ไม่ใช่ประวัติทั้งหมดของใบนั้น */
const LIMIT = 8;

const isPeriodCode = (value: string | null): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const params = request.nextUrl.searchParams;
    const period = params.get("period");
    const itemId = params.get("itemId")?.trim() ?? "";
    if (!isPeriodCode(period)) {
      return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");
    }
    if (!itemId) return badRequest("ระบุ itemId ของรายการที่จะดูร่องรอย");

    const identity = await getDeskIdentity();
    if (!canUploadItem(identity, itemId)) {
      return forbidden("ร่องรอยของรายการนี้เป็นของฝ่ายอื่น");
    }

    return ok(await listIntakeEvents(period, itemId, LIMIT));
  } catch (err) {
    return fail(err);
  }
}
