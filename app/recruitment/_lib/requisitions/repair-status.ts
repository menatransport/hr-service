import { etlCol } from "@/lib/db";

/**
 * สถานะซ่อมปัจจุบันของรถ — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียว ไม่บันทึกลงคำขอ**
 *
 * ทางเดียวกับบอร์ดซ่อมของ mena-next-lb (`/inspection/bymaintenance`):
 * `Boom_ETL.repair_board` (ทะเบียน → ใบแจ้งซ่อมที่ค้างบนบอร์ด) →
 * `Boom_ETL.maintenance_request.timeline_job` → ขั้นล่าสุดของงานที่ยังไม่ปิด
 *
 * **ไม่อยู่บนบอร์ด / งานปิดแล้ว / ขั้น 15 “รถซ่อมเสร็จสิ้น” = ปกติ** ไม่ต้องขึ้นอะไร
 * (เจ้าของงานกำหนด 14 ต.ค. 2026) · เลือกเส้นนี้แทน `MAIN_API_URL/fleet/current`
 * เพราะเส้นนั้นตอบ 503 อยู่ และ hr-service อ่าน `Boom_ETL` ได้อยู่แล้ว
 */

/** ป้ายขั้นงานซ่อม — ลอกจาก `maintenance-status-steps.ts` ของ mena-next-lb ห้ามตั้งคำเอง */
const STEP_LABEL: Record<number, string> = {
  1: "รอประเมินการซ่อม",
  2: "รอราคา",
  3: "รออนุมัติ",
  4: "รออะไหล่",
  5: "รอคนขับ",
  6: "รอเข้าช่อง",
  7: "รถซ่อม",
  8: "ซ่อมเสร็จภายในอู่",
  9: "รอทำความสะอาด",
  10: "ยาง",
  11: "รอตรวจสภาพ",
  12: "แย็กโม่",
  13: "รถรอขาย",
  14: "รถที่ชะลอการซ่อม",
  16: "อื่นๆ",
};
const DONE_STEP = 15;

export interface RepairStatus {
  /** ป้ายขั้นล่าสุด เช่น “รออะไหล่” · งานที่ยังไม่มีขั้นใดเลยขึ้น “แจ้งซ่อม” */
  label: string;
  /** กำหนดเสร็จ `YYYY-MM-DD` (เวลาไทย) · ว่าง = ยังไม่มีใครประเมิน */
  due: string;
  /** เลขใบแจ้งซ่อม เช่น `LBMR26100106` — ไว้ขึ้นใน tooltip ให้ไปตามต่อได้ */
  mrCode: string;
  /** หมายเหตุที่ฝ่ายซ่อมกรอกตอนเปลี่ยนขั้นล่าสุด — ช่องเดียวกับ “หมายเหตุ” ในสถานะปัจจุบันของ dashboard-op3 · ว่าง = ไม่ได้กรอก */
  note: string;
  /** ผู้บันทึกขั้นล่าสุด (username ATMS) */
  noteBy: string;
  /** เวลาบันทึกขั้นล่าสุด (ISO) */
  noteAt: string;
}

interface TimelineEvent {
  to_step_id?: number | null;
  action_by?: string | null;
  note?: string | null;
  created_at?: string | null;
}
interface TimelineJob {
  closed_at?: string | null;
  expected_done_at?: string | null;
  segments?: { events?: TimelineEvent[] }[];
}

/** วันที่ตามปฏิทินไทย — ISO ที่เก็บเป็น UTC แปลงตรง ๆ จะเพี้ยนไปหนึ่งวันช่วงหลัง 17:00 */
function bangkokYmd(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return "";
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

function statusOf(
  job: TimelineJob | undefined,
  estimateFinishAt: string | null | undefined,
  mrCode: string,
): RepairStatus | null {
  if (!job || job.closed_at) return null;

  /* ขั้นล่าสุดดูจากเวลาของเหตุการณ์ ไม่ใช่ลำดับในอาร์เรย์ — บางใบมีเหตุการณ์ที่บันทึกย้อนหลัง */
  let last: TimelineEvent | undefined;
  for (const seg of job.segments ?? [])
    for (const ev of seg.events ?? [])
      if (!last || (ev.created_at ?? "") >= (last.created_at ?? "")) last = ev;

  const step = last?.to_step_id ?? null;
  if (step === DONE_STEP) return null;

  return {
    label: step === null ? "แจ้งซ่อม" : (STEP_LABEL[step] ?? "อยู่ระหว่างซ่อม"),
    due: bangkokYmd(job.expected_done_at) || bangkokYmd(estimateFinishAt),
    mrCode,
    note: (last?.note ?? "").trim(),
    noteBy: (last?.action_by ?? "").trim(),
    noteAt: last?.created_at ?? "",
  };
}

/** ค่ามากสุดของ `ingested_at` — เก็บได้ทั้ง `Date` และสตริง ISO */
function latestIso(prev: string | null, raw: unknown): string | null {
  const v = raw instanceof Date ? raw.toISOString() : typeof raw === "string" ? raw : "";
  return v && (!prev || v > prev) ? v : prev;
}

const boardMrIds = (board: { mr_id?: number }[]) =>
  board.map((b) => b.mr_id).filter((id): id is number => id != null);

/**
 * ทะเบียน → สถานะซ่อม **เฉพาะคันที่ไม่ปกติ** (คันปกติไม่อยู่ในผลลัพธ์) + เวลาข้อมูลของบอร์ด
 * บอร์ดมีราว 450 คัน — อ่านทั้งบอร์ดครั้งเดียวต่อการเปิดหน้า ถูกกว่าถามทีละคัน
 * อ่านไม่ได้ → `{}` ทั้งก้อน (ทุกคันขึ้นเป็นปกติ) ไม่ล้มทั้งหน้า
 *
 * **`syncedAt`** = `ingested_at` ล่าสุดของใบแจ้งซ่อมที่ค้างบนบอร์ด (ETL ดึงใบแจ้งซ่อมหลายรอบต่อวัน)
 * — `repair_board` เองไม่มีเวลา · ไม่ใช้ค่าล่าสุดของทั้งคอลเลกชันเพราะไม่มีดัชนี (sort ทั้งก้อน ~20 วิ)
 */
export async function getRepairBoard(): Promise<{ statuses: Record<string, RepairStatus>; syncedAt: string | null }> {
  try {
    const board = await (
      await etlCol<{ plate?: string; mr_id?: number; mr_code?: string }>("repairBoard")
    )
      .find({}, { projection: { plate: 1, mr_id: 1, mr_code: 1 } })
      .toArray();
    if (!board.length) return { statuses: {}, syncedAt: null };

    const mrs = await (
      await etlCol<{
        _id: number;
        code?: string;
        estimate_finish_at?: string | null;
        ingested_at?: unknown;
        timeline_job?: { jobs?: TimelineJob[] };
      }>("maintenanceRequest")
    )
      .find(
        { _id: { $in: boardMrIds(board) } },
        { projection: { code: 1, estimate_finish_at: 1, ingested_at: 1, timeline_job: 1 } },
      )
      .toArray();
    const byId = new Map(mrs.map((m) => [m._id, m]));

    const out: Record<string, RepairStatus> = {};
    let syncedAt: string | null = null;
    for (const m of mrs) syncedAt = latestIso(syncedAt, m.ingested_at);
    for (const b of board) {
      const plate = (b.plate ?? "").trim();
      const mr = b.mr_id != null ? byId.get(b.mr_id) : undefined;
      if (!plate || !mr) continue;
      const status = statusOf(
        mr.timeline_job?.jobs?.at(-1),
        mr.estimate_finish_at,
        mr.code ?? b.mr_code ?? "",
      );
      if (status) out[plate] = status;
    }
    return { statuses: out, syncedAt };
  } catch {
    return { statuses: {}, syncedAt: null };
  }
}

export async function getRepairStatuses(): Promise<Record<string, RepairStatus>> {
  return (await getRepairBoard()).statuses;
}

/** เวลาข้อมูลของบอร์ดซ่อมอย่างเดียว (นิยามเดียวกับ `getRepairBoard().syncedAt`) — ไม่อ่าน timeline */
export async function getRepairBoardSyncedAt(): Promise<string | null> {
  try {
    const board = await (await etlCol<{ mr_id?: number }>("repairBoard"))
      .find({}, { projection: { mr_id: 1 } })
      .toArray();
    if (!board.length) return null;
    const mrs = await (await etlCol<{ _id: number; ingested_at?: unknown }>("maintenanceRequest"))
      .find({ _id: { $in: boardMrIds(board) } }, { projection: { ingested_at: 1 } })
      .toArray();
    let syncedAt: string | null = null;
    for (const m of mrs) syncedAt = latestIso(syncedAt, m.ingested_at);
    return syncedAt;
  } catch {
    return null;
  }
}

export interface RepairDetail extends RepairStatus {
  /** อู่/ช่างที่รับงาน เช่น “ซ่อมร้านนอก” */
  garage: string;
  /** อาการที่แจ้ง — แยกทีละบรรทัดจาก `tasks[].problem` */
  problems: string[];
}

/**
 * สถานะซ่อมของรถ**คันเดียว** แบบละเอียด (อาการ + อู่) — ใช้ใน dialog รายละเอียดรถ
 * `null` = รถปกติ (ไม่อยู่บนบอร์ด / งานปิดแล้ว) · อ่านไม่ได้ก็ `null` เหมือน `getRepairStatuses()`
 */
export async function getRepairDetail(plate: string): Promise<RepairDetail | null> {
  const key = plate.trim();
  if (!key) return null;
  try {
    const board = await (await etlCol<{ plate?: string; mr_id?: number; mr_code?: string }>("repairBoard")).findOne(
      { plate: key },
      { projection: { mr_id: 1, mr_code: 1 } },
    );
    if (board?.mr_id == null) return null;

    const mr = await (
      await etlCol<{
        _id: number;
        code?: string;
        estimate_finish_at?: string | null;
        mechanic_name?: string | null;
        tasks?: { problem?: string | null }[];
        timeline_job?: { jobs?: TimelineJob[] };
      }>("maintenanceRequest")
    ).findOne(
      { _id: board.mr_id },
      { projection: { code: 1, estimate_finish_at: 1, mechanic_name: 1, "tasks.problem": 1, timeline_job: 1 } },
    );
    if (!mr) return null;

    const status = statusOf(mr.timeline_job?.jobs?.at(-1), mr.estimate_finish_at, mr.code ?? board.mr_code ?? "");
    if (!status) return null;
    return {
      ...status,
      garage: (mr.mechanic_name ?? "").trim(),
      /* ช่างพิมพ์เป็นรายการ “- อาการ” หลายบรรทัดในช่องเดียว */
      problems: (mr.tasks ?? [])
        .flatMap((t) => (t.problem ?? "").split(/\r?\n/))
        .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
        .filter(Boolean),
    };
  } catch {
    return null;
  }
}
