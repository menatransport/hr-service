import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { saveMyResult } from "@/lib/uat-store";

import { failUat } from "../_fail";

/** `PUT /api/uat/results` — `{ caseId, status: "pass"|"fail"|null, note? }` ผลของผู้ใช้ที่ล็อกอินอยู่เท่านั้น */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(await saveMyResult(body.caseId, body.status ?? null, body.note));
  } catch (err) {
    return failUat(err);
  }
}
