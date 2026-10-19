import type { NextRequest } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { confirmLink, getOverview } from "@/lib/driver-links/api";

import { liveDeps, respond } from "./_deps";

/**
 * `GET /api/driver-links` — ภาพรวมสายเชื่อมคนขับรถร่วม ↔ ทะเบียน พจส.
 * (ข้อเสนอคู่ · คู่ที่ยืนยันแล้ว · ตัวเลขคนขับทั้งบริษัท · รายการขัดแย้ง) — ต้องมี session
 *
 * `POST /api/driver-links` — ยืนยันคู่
 * ```
 * { "contractCode": "MTM145-01", "drivercode": "6501234", "matchedBy": "name+plate", "confidence": "medium" }
 * { "contractCode": "MTM145-01", "drivercode": "6501234", "matchedBy": "manual", "note": "หัวหน้าคิวยืนยัน" }
 * ```
 * สัญญาเดิมจับคู่ไว้แล้ว = 409 · ผู้ยืนยันมาจาก session ไม่รับจาก client
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return respond(await getOverview(liveDeps()));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json().catch(() => null);
    return respond(await confirmLink(liveDeps(), raw));
  } catch (err) {
    return fail(err);
  }
}
