import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { toComplaintType } from "@/lib/ncac/adapt";
import { deleteComplaintMaster, updateComplaintMaster } from "@/lib/ncac/client";
import type { ComplaintMasterPatch } from "@/lib/ncac/types";

/**
 * ประเภทเรื่องรายตัว — `PUT` แก้ · `DELETE` ลบ
 *
 * **`DELETE` ตอบ 409 เมื่อมีคำร้องอ้างถึงประเภทนั้นอยู่** (กฎอยู่ฝั่ง NCAC)
 * ข้อความจาก upstream บอกจำนวนคำร้องและทางออก (ปิดใช้งานแทน) มาแล้ว
 * จึงส่งต่อตรง ๆ ไม่ต้องเขียนทับ
 */

interface PatchBody {
  departmentId?: string | number | null;
  name?: string | null;
  icon?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
}

function parseId(raw: string): number | null {
  const id = Number(decodeURIComponent(raw));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/complaint-types/[id]">,
) {
  try {
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);
    if (id === null) return badRequest("รหัสประเภทเรื่องไม่ถูกต้อง");

    const body = (await request.json()) as PatchBody;
    const patch: ComplaintMasterPatch = {};

    if (body.departmentId !== undefined && body.departmentId !== null) {
      const departmentId = Number(body.departmentId);
      if (!Number.isInteger(departmentId) || departmentId <= 0) {
        return badRequest("รหัสหน่วยงานไม่ถูกต้อง");
      }
      patch.department_id = departmentId;
    }

    if (body.name !== undefined) {
      const name = body.name?.trim();
      // ชื่อว่าง = ประเภทที่ไม่มีป้าย เลือกในดรอปดาวน์แล้วอ่านไม่ออก
      if (!name) return badRequest("ชื่อประเภทเรื่องว่างไม่ได้");
      patch.name = name;
    }

    if (body.icon !== undefined) patch.icon = body.icon?.trim() || null;
    if (body.sortOrder !== undefined && body.sortOrder !== null) {
      patch.sort_order = body.sortOrder;
    }
    if (body.isActive !== undefined && body.isActive !== null) {
      patch.is_active = body.isActive;
    }

    if (!Object.keys(patch).length) return badRequest("ไม่มีข้อมูลที่จะบันทึก");

    return ok(toComplaintType(await updateComplaintMaster(id, patch)));
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/complaint-types/[id]">,
) {
  try {
    const { id: rawId } = await ctx.params;
    const id = parseId(rawId);
    if (id === null) return badRequest("รหัสประเภทเรื่องไม่ถูกต้อง");

    await deleteComplaintMaster(id);
    return ok({ id, deleted: true });
  } catch (err) {
    return fail(err);
  }
}
