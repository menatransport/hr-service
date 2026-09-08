import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { failMaster } from "@/app/api/complaint-master/_lib";
import { deleteMaster, updateMaster } from "@/lib/complaint-master";

/**
 * master data รายตัว — `PUT` แก้ · `DELETE` ลบถาวร
 *
 * ไม่ต้องส่ง `kind` มาด้วย: `_id` ไม่ซ้ำกันทั้งคอลเลกชัน ชั้นข้อมูลจึงอ่านชนิดจาก
 * ตัวเอกสารเองแล้วเลือกปลายทางการเขียนให้ถูก (ประเภทเรื่อง → NCAC + sync · สาเหตุ → Mongo)
 *
 * **`DELETE` ประเภทเรื่องตอบ 409 เมื่อมีคำร้องอ้างถึงอยู่** (กฎอยู่ฝั่ง NCAC)
 * ข้อความจาก upstream บอกจำนวนคำร้องและทางออก (ปิดใช้งานแทน) มาแล้ว จึงส่งต่อตรง ๆ
 */

export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/complaint-master/[id]">,
) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // ส่งเฉพาะช่องที่มีมาจริง — `undefined` แปลว่า “ไม่แตะ” ไม่ใช่ “ล้างค่า”
    const patch = {
      ...(body.group !== undefined ? { group: body.group } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.order !== undefined ? { order: body.order } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    };
    if (!Object.keys(patch).length) return badRequest("ไม่มีข้อมูลที่จะบันทึก");

    return ok(await updateMaster(decodeURIComponent(id), patch));
  } catch (err) {
    return failMaster(err);
  }
}

export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/complaint-master/[id]">,
) {
  try {
    const { id } = await ctx.params;
    await deleteMaster(decodeURIComponent(id));
    return ok({ id, deleted: true });
  } catch (err) {
    return failMaster(err);
  }
}
