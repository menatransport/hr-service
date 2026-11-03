import type { NextRequest } from "next/server";

import { createRoom } from "@/lib/rentals/store";

import { handle } from "../_respond";

/** `POST /api/rentals/rooms` — เพิ่มห้อง `{ apartmentId, roomNo, … }` */
export async function POST(request: NextRequest) {
  return handle(request, (body, actor) => createRoom(body, actor));
}
