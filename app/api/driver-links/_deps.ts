import { readSessionUser } from "@/lib/auth/session";
import type { ApiDeps, ApiResult } from "@/lib/driver-links/api";
import { writeLinkEvent } from "@/lib/driver-links/audit";
import { createRepo } from "@/lib/driver-links/repo";
import { NextResponse } from "next/server";

/** session + repo จริง — route ทุกเส้นของ `/api/driver-links` ใช้ชุดนี้ */
export function liveDeps(): ApiDeps {
  return { readUser: readSessionUser, repo: createRepo(), audit: writeLinkEvent };
}

export function respond(result: ApiResult) {
  return NextResponse.json(result.body, { status: result.status });
}
