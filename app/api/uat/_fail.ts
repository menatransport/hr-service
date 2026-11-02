import { NextResponse } from "next/server";

import { fail } from "@/app/api/_lib/respond";
import { RecruitmentError } from "@/app/recruitment/_lib/questions";
import { UatError } from "@/lib/uat-store";

/** ข้อผิดพลาดที่ตั้งใจ (`UatError` / `RecruitmentError`) ตอบข้อความตรง ๆ · ที่เหลือส่ง `fail()` */
export function failUat(err: unknown) {
  if (err instanceof UatError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof RecruitmentError) return NextResponse.json({ error: err.message }, { status: 400 });
  return fail(err);
}
