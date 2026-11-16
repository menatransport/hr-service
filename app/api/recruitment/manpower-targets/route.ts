import type { NextRequest } from "next/server";

import { badRequest, forbidden, ok } from "@/app/api/_lib/respond";
import { editor, failRecruitment, unauthorized } from "@/app/api/recruitment/_lib";
import { canAccessMenu } from "@/lib/menu-permissions";
import { saveManpowerTargets } from "@/app/recruitment/_lib/dashboard/manpower-daily";

/**
 * `PUT /api/recruitment/manpower-targets` — บันทึกเป้า Manpower (RC Owner · Target Truck) ต่อ กลุ่มงาน × ลูกค้า
 * body: `{ targets: [{ group, customer, rcOwner, targetTruck }] }` (เฉพาะแถวที่แก้) · คืนเป้าทั้งหมดหลังบันทึก
 * · สิทธิ์ย่อย “↳ แก้เป้า Manpower” (`dashboard-targets`) ที่ /desk/permissions — หน้าจอซ่อนปุ่มอยู่แล้ว ตัวนี้กันยิงตรง
 */
export async function PUT(request: NextRequest) {
  try {
    const actor = await editor();
    if (!actor) return unauthorized();
    if (!(await canAccessMenu("dashboard-targets"))) return forbidden("ฝ่าย/แผนกของคุณดูแดชบอร์ดได้อย่างเดียว — ไม่มีสิทธิ์แก้เป้า");
    const body = (await request.json().catch(() => null)) as { targets?: unknown } | null;
    if (!body) return badRequest("รูปแบบข้อมูลไม่ถูกต้อง");
    return ok({ targets: await saveManpowerTargets(body.targets, actor) });
  } catch (err) {
    return failRecruitment(err);
  }
}
