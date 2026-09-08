import type { NextRequest } from "next/server";

import { badRequest, ok } from "@/app/api/_lib/respond";
import { failMaster } from "@/app/api/complaint-master/_lib";
import { createMaster, isMasterKind, listMasters } from "@/lib/complaint-master";

/**
 * master data ของคำร้องทั้งสองชุด (`master_complainte` ใน MongoDB)
 *
 * `GET  /api/complaint-master?kind=type|cause[&includeInactive=1]` — อ่านทั้งชุด
 * `POST /api/complaint-master` — เพิ่มใหม่ `{ kind, group, name }`
 *
 * เส้นเดียวรับทั้ง “ประเภทเรื่อง” และ “สาเหตุ” เพราะโครงข้อมูลเดียวกัน —
 * ต่างกันแค่ปลายทางของการเขียน ซึ่ง `lib/complaint-master.ts` จัดการให้แล้ว
 * server component ไม่ต้องผ่านเส้นนี้ ใช้ `getComplaintTypes()` / `getRootCauses()` ตรง ๆ
 */

function readKind(raw: string | null) {
  return isMasterKind(raw) ? raw : null;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const kind = readKind(params.get("kind"));
    if (!kind) return badRequest("ระบุ kind เป็น type หรือ cause");

    // หน้าจอจัดการต้องเห็นของที่ปิดใช้งานด้วย ไม่งั้นกดปิดแล้วเปิดกลับมาไม่ได้
    return ok(await listMasters(kind, params.get("includeInactive") === "1"));
  } catch (err) {
    return failMaster(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = readKind(typeof body.kind === "string" ? body.kind : null);
    if (!kind) return badRequest("ระบุ kind เป็น type หรือ cause");

    return ok(
      await createMaster({
        kind,
        group: body.group,
        name: body.name,
        order: body.order,
        active: body.active,
      }),
    );
  } catch (err) {
    return failMaster(err);
  }
}
