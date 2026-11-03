import type { NextRequest } from "next/server";

import { checkIn } from "@/lib/rentals/store";

import { handle } from "../_respond";

/** `POST /api/rentals/stays` — เข้าพัก `{ roomId, drivercode, checkIn, livingWith, note }` */
export async function POST(request: NextRequest) {
  return handle(request, (body, actor) => checkIn(body, actor));
}
