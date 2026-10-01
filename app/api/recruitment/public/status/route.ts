import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { failRecruitment, readBody } from "@/app/api/recruitment/_lib";
import { cancelApplication, lookupStatus } from "@/app/recruitment/_lib/applications";

/**
 * `POST /api/recruitment/public/status` — ผู้สมัครเปิดดูสถานะของตัวเอง
 * `DELETE /api/recruitment/public/status` — ยกเลิกใบสมัครของตัวเองและลบข้อมูล
 *
 * ใช้ `POST` แทน `GET` เพราะต้องส่งเลขอ้างอิงคู่กับเบอร์ และ**ไม่ควรให้เบอร์
 * ไปโผล่ใน query string** ซึ่งค้างอยู่ใน log ของเซิร์ฟเวอร์และประวัติเบราว์เซอร์
 *
 * ทั้งสองเส้นเปิดสาธารณะ — ด่านคือต้องรู้เลขอ้างอิงคู่กับเบอร์ที่ใช้สมัคร
 * (ดูเหตุผลที่ `lookupStatus()`)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    return ok(await lookupStatus(body.ref, body.phone));
  } catch (err) {
    return failRecruitment(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await readBody(request);
    return ok(await cancelApplication(body.ref, body.phone));
  } catch (err) {
    return failRecruitment(err);
  }
}
