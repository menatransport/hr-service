import type { NextRequest } from "next/server";

import { updateApartment } from "@/lib/rentals/store";

import { handle } from "../../_respond";

/** `PATCH /api/rentals/apartments/{id}` — แก้ที่พัก (ส่งทุกช่อง) */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/rentals/apartments/[id]">) {
  const { id } = await ctx.params;
  return handle(request, (body, actor) => updateApartment(id, body, actor));
}
