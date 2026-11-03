import type { NextRequest } from "next/server";

import { saveBill } from "@/lib/rentals/store";

import { handle } from "../_respond";

/** `PUT /api/rentals/bills` — ค่าไฟ/น้ำ/ส่วนกลางของห้องในเดือนนั้น `{ month, roomId, electric?, water?, common? }` */
export async function PUT(request: NextRequest) {
  return handle(request, (body, actor) => saveBill(body, actor));
}
