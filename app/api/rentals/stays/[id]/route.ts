import type { NextRequest } from "next/server";

import { updateStay } from "@/lib/rentals/store";

import { handle } from "../../_respond";

/** `PATCH /api/rentals/stays/{id}` — ย้ายออก (`checkOut`) · แก้วันเข้าพัก/หมายเหตุ · ผูกทะเบียน (`drivercode`) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/rentals/stays/[id]">) {
  const { id } = await ctx.params;
  return handle(request, (body, actor) => updateStay(id, body, actor));
}
