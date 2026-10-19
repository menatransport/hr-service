import { fail } from "@/app/api/_lib/respond";
import { unlink } from "@/lib/driver-links/api";

import { liveDeps, respond } from "../_deps";

/** `DELETE /api/driver-links/{contractCode}` — ปลดคู่ (ลบแถว + จด log ว่าใครปลด) · ต้องมี session */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/driver-links/[contractCode]">) {
  try {
    const { contractCode } = await ctx.params;
    return respond(await unlink(liveDeps(), decodeURIComponent(contractCode)));
  } catch (err) {
    return fail(err);
  }
}
