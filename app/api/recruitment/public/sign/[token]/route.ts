import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failRecruitment, readBody } from "@/app/api/recruitment/_lib";
import { signAsApplicant } from "@/app/recruitment/_lib/sign-link-store";

/**
 * `POST /api/recruitment/public/sign/{token}` `{ docId, image }` — ผู้สมัครลงลายมือชื่อ
 * ในช่องของตัวเองหนึ่งฉบับ (หน้า `/recruitment/sign/{token}`)
 *
 * เปิดสาธารณะ — ด่านคือ token สุ่ม 256 บิตที่ยังไม่หมดอายุ · เขียนได้แค่ช่องผู้สมัคร
 * ของฉบับที่อยู่ในลิงก์ ครั้งเดียวต่อฉบับ (ดู `signAsApplicant()`)
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return ok(await signAsApplicant(token, await readBody(request)));
  } catch (err) {
    return failRecruitment(err);
  }
}
