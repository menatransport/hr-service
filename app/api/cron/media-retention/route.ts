import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { fail, ok } from "@/app/api/_lib/respond";
import { purgeResignedDriverMedia } from "@/app/recruitment/_lib/drivers/media-retention";

/**
 * `GET /api/cron/media-retention` — งานรายวัน: ลบรูป/เอกสารของ พจส. ที่พ้นสภาพครบ 1 เดือน
 * (`media-retention.ts`) · ตั้งรอบไว้ใน `vercel.json` (02:00 น. เวลาไทย)
 *
 * **ต้องมี `Authorization: Bearer ${CRON_SECRET}`** — Vercel Cron ใส่ให้เองเมื่อตั้ง env
 * `CRON_SECRET` ในโปรเจกต์ · `GET` ผ่าน `proxy.ts` ได้โดยไม่ล็อกอิน จึงตรวจเองที่นี่
 * ไม่มี secret ในเครื่อง = ปิดเส้นนี้ทั้งเส้น (ไม่ใช่เปิดให้ใครยิงก็ได้)
 *
 * `?dry=1` = ดูรายชื่อที่จะถูกลบโดยไม่ลบจริง · สั่งมือ:
 * `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/media-retention?dry=1`
 *
 * ไฟล์ร่างของผู้สมัคร (`_drafts/`) ไม่ได้ลบที่นี่ — lifecycle ของ bucket ลบให้เองใน 1 วัน
 * (`setup_media_lifecycle.mjs`)
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 401 });
  }

  try {
    const dryRun = request.nextUrl.searchParams.get("dry") === "1";
    const report = await purgeResignedDriverMedia({ dryRun });
    if (report.failed.length) console.warn("[media-retention] ลบไม่สำเร็จบางราย", report.failed);
    return ok(report);
  } catch (err) {
    return fail(err);
  }
}
