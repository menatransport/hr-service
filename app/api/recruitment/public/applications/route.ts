import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { clientMeta, failRecruitment, readBody } from "@/app/api/recruitment/_lib";
import { createApplication } from "@/app/recruitment/_lib/applications";

/**
 * `POST /api/recruitment/public/applications` — รับใบสมัครจากคนนอก
 *
 * **เส้นเดียวของระบบที่เขียนข้อมูลได้โดยไม่ต้องล็อกอิน** จึงถูกยกเว้นไว้ใน
 * `proxy.ts` เป็นกรณีพิเศษ · ด่านที่กันของเสียมีสามชั้นและอยู่ในชั้นข้อมูล
 * ทั้งหมด (`lib/recruitment/applications.ts`) ไม่ได้อยู่ที่นี่:
 * ความยินยอมต้องครบ · คำตอบต้องผ่านการตรวจด้วยคลังคำถามปัจจุบัน ·
 * เบอร์เดิมส่งซ้ำภายใน 30 วันถูกปัดกลับ
 */

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    return ok(await createApplication(body, clientMeta(request)));
  } catch (err) {
    return failRecruitment(err);
  }
}
