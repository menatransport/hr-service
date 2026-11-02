import { NextResponse, type NextRequest } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { MenuPermissionError, getMenuScopes, saveMenuScope } from "@/lib/menu-permissions";

/**
 * `GET /api/menu-permissions` — สิทธิ์ทุกชั้น `{ base, divisions, departments }` (เฉพาะค่าที่ตั้งทับ)
 * `PUT /api/menu-permissions` — `{ kind: "base"|"division"|"department", id?, menus }` บันทึกชั้นเดียว
 *   คืนสิทธิ์ทุกชั้นหลังบันทึก
 *
 * `proxy.ts` กันคำสั่งเขียนของคนที่ยังไม่ล็อกอินไว้แล้ว · กฎกันล็อกตัวเองอยู่ใน `saveMenuScope()`
 */

function failRules(err: unknown) {
  if (err instanceof MenuPermissionError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return fail(err);
}

export async function GET() {
  try {
    return ok(await getMenuScopes());
  } catch (err) {
    return failRules(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return ok(await saveMenuScope({ kind: body.kind, id: body.id, menus: body.menus }));
  } catch (err) {
    return failRules(err);
  }
}
