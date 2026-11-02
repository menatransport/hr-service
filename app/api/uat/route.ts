import type { NextRequest } from "next/server";

import { ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { getUatBoard, saveTeamTesters, setUatActive } from "@/lib/uat-store";

import { failUat } from "./_fail";

/**
 * `GET /api/uat` — สวิตช์ + ผู้ทดสอบรายฝ่าย + ผลทุกข้อ (หน้า “จัดการ UAT”)
 * `PUT /api/uat` — `{ active }` เปิด/ปิด UAT · `{ team, testers }` แทนรายชื่อผู้ทดสอบของฝ่ายนั้น
 */

export async function GET() {
  try {
    // `proxy.ts` ปล่อย GET ผ่านโดยไม่ล็อกอิน — รายชื่อผู้ทดสอบไม่ควรเปิดให้คนนอก
    if (!(await readSessionUser())) return unauthorized("ต้องเข้าสู่ระบบก่อน");
    return ok(await getUatBoard());
  } catch (err) {
    return failUat(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.active === "boolean") return ok(await setUatActive(body.active));
    return ok(await saveTeamTesters(body.team, body.testers));
  } catch (err) {
    return failUat(err);
  }
}
