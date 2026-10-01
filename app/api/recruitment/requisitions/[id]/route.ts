import type { NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { editor, readBody, unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { updateRequisition } from "@/app/recruitment/_lib/requisitions/store";

/**
 * `PATCH /api/recruitment/requisitions/[id]` — แก้คำขอทีละเรื่อง:
 * ครูฝึก · รถ · ผูก/ปลดผู้สมัคร · ยกเลิก/เปิดรับอีกครั้ง · รหัส พจส. · หมายเหตุ
 *
 * **ไม่มี `DELETE` โดยตั้งใจ** — คำขอที่ไม่เอาแล้วถูก “ยกเลิก” พร้อมเหตุผท
 * ไม่ใช่ลบทิ้ง เพราะ “เดือนนี้ยกเลิกไปกี่อัตรา เพราะอะไร” เป็นตัวเลขที่ต้องรวมยอดได้
 * (หลักเดียวกับ `EXIT_REASONS` ของใบสมัครที่แยกเหตุผลออกจากสถานะ)
 *
 * ผู้แก้ไขมาจาก session เสมอ — ประวัติต้องบอกได้ว่าใครเปลี่ยนอะไร
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const who = await editor();
    if (!who) return unauthorized();

    const { id } = await params;
    const body = await readBody(request);
    return ok(await updateRequisition(id, body, who));
  } catch (err) {
    return failRequisition(err);
  }
}
