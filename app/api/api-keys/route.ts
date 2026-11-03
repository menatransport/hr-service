import type { NextRequest } from "next/server";

import { badRequest, fail, ok, unauthorized } from "@/app/api/_lib/respond";
import { readSessionUser } from "@/lib/auth/session";
import { ApiKeyError, createApiKey, listApiKeys } from "@/lib/auth/api-keys";

/**
 * API key ส่วนตัว (กล่อง “API key ของฉัน” บนหน้า API Docs)
 *
 * - `GET` key ของฉัน (ไม่มีตัว key)
 * - `POST { label, scope: "read" | "write" }` → `{ key, info }` — **key เต็มออกครั้งเดียว**
 *
 * ต้องล็อกอินด้วยคุกกี้จริง — `proxy.ts` ไม่แปลง `x-api-key` ใต้ `/api/api-keys` (key สร้าง key ต่อไม่ได้)
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN = "หมดเวลาการเข้าสู่ระบบ — กรุณาเข้าสู่ระบบใหม่อีกครั้ง";

export async function GET() {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized(LOGIN);
    const res = ok(await listApiKeys(user.employeeId));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized(LOGIN);
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const res = ok(await createApiKey(user, body ?? {}));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    if (err instanceof ApiKeyError) return badRequest(err.message);
    return fail(err);
  }
}
