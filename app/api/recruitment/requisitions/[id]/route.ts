import { NextResponse, type NextRequest } from "next/server";

import { ok } from "@/app/api/_lib/respond";
import { readBody, unauthorized } from "@/app/api/recruitment/_lib";
import { failRequisition } from "@/app/api/recruitment/requisitions/_lib";
import { readSessionUser } from "@/lib/auth/session";
import { canCancelRequisition } from "@/app/recruitment/_lib/requisitions/cancel-rights";
import { requesterIdOf, updateRequisition } from "@/app/recruitment/_lib/requisitions/store";

/**
 * `PATCH /api/recruitment/requisitions/[id]` — แก้คำขอทีละเรื่อง:
 * ครูฝึก · รถ · ผูก/ปลดผู้สมัคร · ยกเลิก/เปิดรับอีกครั้ง · รหัส พจส. · หมายเหตุ
 *
 * **ไม่มี `DELETE` โดยตั้งใจ** — คำขอที่ไม่เอาแล้วถูก “ยกเลิก” พร้อมเหตุผท
 * ไม่ใช่ลบทิ้ง เพราะ “เดือนนี้ยกเลิกไปกี่อัตรา เพราะอะไร” เป็นตัวเลขที่ต้องรวมยอดได้
 * (หลักเดียวกับ `EXIT_REASONS` ของใบสมัครที่แยกเหตุผลออกจากสถานะ)
 * · ยกเลิก (ไอคอนลบ) ได้เฉพาะคนฝ่ายเดียวกับผู้ขอ (`cancel-rights.ts`)
 *
 * ผู้แก้ไขมาจาก session เสมอ — ประวัติต้องบอกได้ว่าใครเปลี่ยนอะไร
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await readSessionUser();
    if (!user) return unauthorized();

    const { id } = await params;
    const body = await readBody(request);
    if (body?.status === "cancelled" && !(await canCancelRequisition(await requesterIdOf(id), user)))
      return NextResponse.json({ error: "ลบได้เฉพาะคำขอของฝ่ายตัวเอง" }, { status: 403 });
    return ok(await updateRequisition(id, body, user.name || user.employeeId));
  } catch (err) {
    return failRequisition(err);
  }
}
