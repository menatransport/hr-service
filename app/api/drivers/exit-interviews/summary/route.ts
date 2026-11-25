import { fail, ok } from "@/app/api/_lib/respond";
import { exitInterviewDenied } from "@/app/api/drivers/_lib/exit-guard";
import { getResignedDriverList } from "@/app/recruitment/_lib/drivers/registry";
import { getInterviewSummaries } from "@/app/recruitment/_lib/exit-interview/store";

/**
 * `GET /api/drivers/exit-interviews/summary` — สถานะ Exit Interview ต่อคน (ไม่มีคำตอบ) ของทุกคนที่พ้นสภาพแบบ `resign`
 * สำหรับคอลัมน์/ตัวกรอง/tile ในแท็บ “พ้นสภาพแล้ว” · สิทธิ์ `exit-interview` แบบ fail-closed
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const denied = await exitInterviewDenied();
    if (denied) return denied;
    const exits = (await getResignedDriverList())
      .filter((d) => d.resignation?.kind === "resign" && d.resignation.dateISO)
      .map((d) => ({ drivercode: d.drivercode, exitDateISO: d.resignation!.dateISO }));
    const res = ok(await getInterviewSummaries(exits));
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  } catch (err) {
    return fail(err);
  }
}
