import type { NextRequest } from "next/server";

import { badRequest, fail, ok } from "@/app/api/_lib/respond";
import { getActorEmployeeId } from "@/lib/auth/session";
import { canDeleteCase, deleteBlockedReason } from "@/lib/case-flow";
import { buildDirectory, toHrCase } from "@/lib/ncac/adapt";
import {
  NcacError,
  defineReviewer,
  deleteComplaint,
  getComplaint,
  listComplaints,
  listUsers,
  updateComplaint,
} from "@/lib/ncac/client";
import type { ComplaintPatch } from "@/lib/ncac/types";

/**
 * เคสเดียว — `GET` อ่าน · `PATCH` บันทึกทุกช่องพร้อมกัน · `DELETE` ลบแบบ soft
 *
 * `PATCH` รับ payload แบบ camelCase ของหน้าจอ แล้วแปลงเป็น snake_case ให้ NCAC
 * ตรงนี้ที่เดียว · ผู้อนุมัติสองระดับใช้คนละ endpoint (`define-reviewer`)
 * แต่ถูกมัดรวมมาในคำขอเดียว เพื่อให้ปุ่ม “บันทึก” ปุ่มเดียวใน footer ครอบคลุมทุกช่อง
 */

interface PatchBody {
  departmentId?: string | null;
  complaintType?: string | null;
  problem?: string | null;
  rootCause?: string | null;
  solution?: string | null;
  result?: string | null;
  damageCost?: number | null;
  approverL1?: string | null;
  approverL2?: string | null;
}

/**
 * ข้อความเดียวที่ผู้ใช้เห็นตอน NCAC ยังไม่เปิดให้ลบ — ครอบทั้งสองอาการที่เจอจริง
 * (`DELETE` ตอบ 405 · หรือรับคำสั่งแล้วไม่เปลี่ยนอะไร) เพราะสำหรับผู้ใช้มันคือ
 * เรื่องเดียวกัน และบอกไปเลยว่าตอนนี้ทำอะไรแทนได้
 */
const NOT_SUPPORTED =
  "เซิร์ฟเวอร์ NCAC ที่ใช้อยู่ยังไม่มีเส้น DELETE /complaints/{tracking_no} — โค้ดฝั่ง backend มีแล้วแต่ยังไม่ได้ deploy · ระหว่างนี้ใช้การปิดคำร้องแทนได้";

async function reload(trackingNo: string) {
  const [complaint, users] = await Promise.all([
    getComplaint(trackingNo),
    listUsers().catch(() => []),
  ]);
  return toHrCase(complaint, buildDirectory(users));
}

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]">,
) {
  try {
    const { trackingNo } = await ctx.params;
    return ok(await reload(decodeURIComponent(trackingNo)));
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]">,
) {
  try {
    const { trackingNo } = await ctx.params;
    const id = decodeURIComponent(trackingNo);
    const body = (await request.json()) as PatchBody;

    const patch: ComplaintPatch = {};
    if (body.departmentId !== undefined && body.departmentId !== null)
      patch.department_id = body.departmentId;
    if (body.complaintType !== undefined) patch.complaint_type = body.complaintType;
    if (body.problem !== undefined) patch.problem = body.problem;
    if (body.rootCause !== undefined) patch.root_cause = body.rootCause;
    if (body.solution !== undefined) patch.solution = body.solution;
    if (body.result !== undefined) patch.result = body.result;
    if (body.damageCost !== undefined) patch.damage_cost = body.damageCost;

    const reviewers = [
      { level: 1 as const, id: body.approverL1 },
      { level: 2 as const, id: body.approverL2 },
    ].filter((r) => Boolean(r.id));

    if (!Object.keys(patch).length && !reviewers.length) {
      return badRequest("ไม่มีข้อมูลที่จะบันทึก");
    }

    if (Object.keys(patch).length) await updateComplaint(id, patch);
    // ทีละระดับตามลำดับ — NCAC ตรวจว่าระดับ 1 ต้องมาก่อนระดับ 2
    for (const reviewer of reviewers) {
      await defineReviewer(id, reviewer.level, reviewer.id as string);
    }

    return ok(await reload(id));
  } catch (err) {
    return fail(err);
  }
}

/**
 * ลบคำร้อง — soft delete, ตรวจกฎฝั่งเซิร์ฟเวอร์ซ้ำแล้ว **อ่านกลับมายืนยันเสมอ**
 *
 * ที่ต้องอ่านซ้ำเพราะ NCAC มีพฤติกรรมตอบ 200 ทั้งที่ไม่ได้ทำอะไร (ยิงทดสอบแล้ว
 * 8 ส.ค. 2026 — ดู `deleteComplaint()`) ถ้าเชื่อ 200 ตรง ๆ หน้าจอจะบอกว่าลบแล้ว
 * ทั้งที่คำร้องยังอยู่ ซึ่งคือหน้าจอโกหก · **ห้ามตัดขั้นตอนตรวจซ้ำนี้ทิ้ง**
 * (แพตเทิร์นเดียวกับ `PUT /api/employees/[id]/photo`)
 *
 * กฎว่าใครลบได้อยู่ใน `canDeleteCase()` ที่เดียว — ฝั่ง UI ซ่อนปุ่มด้วยกฎเดียวกัน
 * แต่ที่นี่ยังต้องตรวจ เพราะ UI ไม่ใช่ด่านความปลอดภัย
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/cases/[trackingNo]">,
) {
  try {
    const { trackingNo } = await ctx.params;
    const id = decodeURIComponent(trackingNo);

    const before = await reload(id);
    if (!canDeleteCase(before)) {
      return badRequest(deleteBlockedReason(before) ?? "ลบคำร้องนี้ไม่ได้");
    }

    try {
      // ผู้ลบมาจาก session — ค่าที่ client ส่งมาไม่ถูกนำมาใช้เลย (ดู `getActorEmployeeId`)
      await deleteComplaint(id, await getActorEmployeeId());
    } catch (err) {
      // 405 = ยังไม่มีเส้นนี้ใน NCAC · แปลงเป็นข้อความที่บอกสาเหตุจริง ไม่ใช่
      // ปล่อย “Method Not Allowed” ดิบ ๆ ซึ่งผู้ใช้อ่านแล้วไม่รู้ว่าต้องทำอะไรต่อ
      if (err instanceof NcacError && (err.status === 405 || err.status === 404)) {
        return fail(new NcacError(NOT_SUPPORTED, 501));
      }
      throw err;
    }

    // ลบติดจริงแปลว่าคำร้องต้องหลุดจากรายการ (upstream กรอง `is_deleted` ให้)
    // หรืออย่างน้อยธงต้องเป็น true — ไม่เข้าเงื่อนไขไหนเลย = ไม่มีอะไรเกิดขึ้น
    const still = (await listComplaints()).find((c) => c.tracking_no === id);
    if (still && !still.is_deleted) {
      return fail(new NcacError(NOT_SUPPORTED, 501));
    }

    return ok({ trackingNo: id, deleted: true });
  } catch (err) {
    return fail(err);
  }
}
