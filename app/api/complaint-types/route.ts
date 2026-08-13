import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { toComplaintType } from "@/lib/ncac/adapt";
import { createComplaintMaster, listComplaintMasters } from "@/lib/ncac/client";

/**
 * “ประเภทเรื่อง” (`complaint_master` ของ NCAC) — `GET` อ่านทั้งหมด · `POST` เพิ่มใหม่
 *
 * รับ/ตอบเป็น camelCase ของหน้าจอ แล้วแปลงเป็น snake_case ให้ NCAC ที่นี่ที่เดียว
 * เหมือน `/api/cases` · server component ไม่ต้องผ่านเส้นนี้ ใช้
 * `getComplaintTypes()` ใน `lib/complaint-types.ts` ตรง ๆ ได้เลย
 */

interface CreateBody {
  departmentId?: string | number | null;
  name?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
}

/**
 * `department_id` ของ NCAC เป็นตัวเลข — หน้าจอถือรหัสหน่วยงานเป็นสตริง
 * (`DepartmentId`) จึงต้องแปลงและ **ปฏิเสธค่าที่ไม่ใช่ตัวเลข** ไม่ใช่ปล่อยให้
 * `NaN` หลุดไปถึง upstream แล้วได้ 422 ที่อ่านไม่รู้เรื่องกลับมา
 */
function toDepartmentNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const rows = await listComplaintMasters({
      // หน้าจอจัดการต้องเห็นของที่ปิดใช้งานด้วย ไม่งั้นเปิดกลับมาไม่ได้
      includeInactive: params.get("includeInactive") === "1",
      departmentId: params.get("departmentId") ?? undefined,
    });
    return ok(rows.map(toComplaintType));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBody;

    const departmentId = toDepartmentNumber(body.departmentId);
    if (departmentId === null) return badRequest("เลือกหน่วยงานผู้รับผิดชอบก่อน");

    const name = body.name?.trim();
    if (!name) return badRequest("ใส่ชื่อประเภทเรื่องก่อน");

    const created = await createComplaintMaster({
      department_id: departmentId,
      name,
      icon: body.icon?.trim() || null,
      sort_order: body.sortOrder ?? 0,
      is_active: body.isActive ?? true,
    });

    return ok(toComplaintType(created));
  } catch (err) {
    return fail(err);
  }
}
