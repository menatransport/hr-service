import { NextResponse, type NextRequest } from "next/server";

import { badRequest, fail, unauthorized } from "@/app/api/_lib/respond";
import { getDeskIdentity, readSessionUser } from "@/lib/auth/session";
import { listIntake } from "@/lib/payroll/intake";
import type { IntakeRecord } from "@/lib/payroll/intake-status";
import { periodCode, periodFromCode } from "@/lib/payroll/period";
import { filterRecords, visibleItems } from "@/lib/payroll/scope-filter";
import { summarizePeriod } from "@/lib/payroll/summary";
import { buildPeriodSummary } from "@/lib/payroll/summary-export";

/**
 * Excel สรุปรอบ (.xlsx) — `GET /api/payroll/summary?period=2026-09`
 *
 * **ไม่ใช่ไฟล์นำเข้า Tiger Soft** (ไฟล์นั้นยังไม่มีสเปก — ดูหัว `summary-export.ts`)
 *
 * **ต้องเช็ก session เองที่นี่** — `proxy.ts` กันเฉพาะคำสั่งที่เขียนข้อมูล ส่วน `GET`
 * ใต้ `/api/**` ปล่อยผ่าน และไฟล์นี้มีชื่อคนส่ง ชื่อไฟล์ และเหตุผลที่ข้ามด่าน ·
 * ขอบเขตมาจาก session เสมอ: ผู้ใช้ที่ไม่ใช่ HR ได้เฉพาะรายการของฝ่ายตัวเอง
 * (ใช้ `scope-filter.ts` ชุดเดียวกับสถานะรอบ ไม่มีกฎที่สอง)
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await readSessionUser())) {
      return unauthorized("หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
    }

    const period = periodFromCode(request.nextUrl.searchParams.get("period"));
    if (!period) return badRequest("ระบุ period เป็นรูปแบบ YYYY-MM เช่น 2026-09");

    const identity = await getDeskIdentity();
    const records = new Map<string, IntakeRecord>(
      filterRecords(identity, await listIntake(periodCode(period))).map((r) => [r.itemId, r]),
    );

    const summary = summarizePeriod(period, records, new Date(), visibleItems(identity));
    const { file, name } = await buildPeriodSummary(summary, records);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="summary.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return fail(err);
  }
}
