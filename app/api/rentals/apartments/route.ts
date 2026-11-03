import type { NextRequest } from "next/server";

import { createApartment } from "@/lib/rentals/store";

import { handle } from "../_respond";

/** `POST /api/rentals/apartments` — เพิ่มที่พัก */
export async function POST(request: NextRequest) {
  return handle(request, (body, actor) => createApartment(body, actor));
}
