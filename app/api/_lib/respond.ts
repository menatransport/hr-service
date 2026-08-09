import { NextResponse } from "next/server";

import { NcacError } from "@/lib/ncac/client";

/**
 * ตัวช่วยตอบกลับของ route handler ทั้งหมดใน `app/api/**`
 *
 * ทุกเส้นตอบรูปแบบเดียวกัน: สำเร็จได้ payload ตรง ๆ · ล้มเหลวได้ `{ error }`
 * ฝั่ง client จึงอ่าน `json.error` ได้เสมอโดยไม่ต้องเดา
 */

export function ok<T>(data: T) {
  return NextResponse.json(data);
}

export function fail(err: unknown) {
  if (err instanceof NcacError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่รู้จัก";
  console.error("[api]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
