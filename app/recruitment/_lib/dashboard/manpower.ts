import { todayInBangkok } from "@/lib/record-case-flow";
import { driversSyncedAt, readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { toIsoDate } from "@/app/recruitment/_lib/drivers/registry";
import { getOnboardingRecords } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { hasPerson, stageOf, trainingStart, val, type OnboardingRecord } from "@/app/recruitment/_lib/requisitions/onboarding";
import { customerLabel } from "@/app/recruitment/_lib/requisitions/types";

/**
 * Manpower รายแพล้นท์ — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียว**
 *
 * หนึ่งแถว = ลูกค้า × แพล้นท์ · สองแหล่ง:
 * - **ทะเบียน พจส.** (`master_driver` ที่มี `registry`) → ปฏิบัติงาน · เข้า/ออกปีนี้
 * - **คำขอสรรหา** (`recruitment_requests` + ATMS) → อัตราว่าง · รอฝึกงาน · กำลังฝึกงาน · รอรับรถ
 *   ขั้นคิดด้วย `stageOf()` ชุดเดียวกับหน้าติดตามพนักงานใหม่ — รอรับรถ = ขั้นฝึกงานที่ ST ประเมินผ่านแล้ว
 *   หรือสถานะ พจส. “รอรับรถ”
 *
 * **จับคู่สองแหล่ง:** ทะเบียนแยกลูกค้า Mixer S เป็น `<ลูกค้า> MS` (เช่น `Scco MS`) ส่วนคำขอเก็บลูกค้ากับ
 * ตำแหน่งแยกกัน → คำขอตำแหน่ง MS ต่อ ` MS` ให้ · ชื่อเทียบแบบไม่สนตัวพิมพ์/ช่องว่าง (`SCCO` = `Scco`,
 * `รัชดา1` = `รัชดา 1`) · ชื่อที่โชว์ใช้ตัวสะกดของทะเบียนก่อน
 */

/**
 * สถานะ Onboarding ล่าสุดของคนที่ RC ส่งเข้าฝึก (ลำดับ = ลำดับแท่งในกราฟ)
 * · คิดจาก `stageOf()` + ผลสิ้นสุด (`outcome`) ชุดเดียวกับหน้าติดตามพนักงานใหม่
 */
const ONBOARD_STATUSES = [
  "waitTraining",
  "training",
  "waitHandover",
  "handedOver",
  "cancelled",
  "waived",
  "trialExit",
  "leftBeforeHandover",
  "unknown",
] as const;
export type OnboardStatus = (typeof ONBOARD_STATUSES)[number];

export interface ManpowerRow {
  key: string;
  customer: string;
  plant: string;
  /** ปฏิบัติงานอยู่ตามทะเบียน */
  working: number;
  /** ปฏิบัติงานแยกตำแหน่ง — ที่เหลือ (`working − L − S`) = Senior / Spare */
  mixerL: number;
  mixerS: number;
  /** คำขอที่ยังไม่มีคน */
  open: number;
  waitTraining: number;
  training: number;
  waitHandover: number;
  /** เริ่มงานในปีนี้ (ตามวันเริ่มงานในทะเบียน) */
  joined: number;
  /** พ้นสภาพในปีนี้ */
  left: number;
  /** เข้า/ออก รายเดือนของปีนี้ (index 0 = ม.ค.) */
  joinedByMonth: number[];
  leftByMonth: number[];
  /** คนที่เข้าฝึกปีนี้ แยกตามสถานะ Onboarding ล่าสุด */
  onboard: Record<OnboardStatus, number>;
}

export interface ManpowerBoard {
  rows: ManpowerRow[];
  /** ปี ค.ศ. ของคอลัมน์ เข้า/ออก */
  year: number;
  /** ปฏิบัติงานแยกตำแหน่ง (ทั้งบริษัท) */
  positions: { mixerL: number; mixerS: number; other: number };
  registrySyncedAt: string | null;
  /** เวลาที่หน้านี้อ่านคำขอสรรหา (อ่านสดทุกครั้ง) */
  readAt: string;
}

interface RegistryDoc {
  customer?: unknown;
  plant?: unknown;
  position?: unknown;
  active?: unknown;
  statusOverride?: unknown;
  startDate?: unknown;
  resignation?: { dateISO?: unknown; date?: unknown } | null;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const NONE = "ไม่ระบุ";

/** ผ่านฝึกแล้ว รอรถ — ผล ST ครั้งสุดท้าย หรือสถานะ พจส. จากไฟล์ */
const READY = "ผ่านฝึกงาน พร้อมรับรถ";

function pipelineOf(r: OnboardingRecord): "open" | "waitTraining" | "training" | "waitHandover" | null {
  const stage = stageOf(r);
  if (stage === "open") return "open";
  if (stage === "recruiting") return "waitTraining";
  if (stage !== "training") return null;
  return r.outcome === "waiting_handover" || val(r.onboarding, "er", "day8") === READY
    ? "waitHandover"
    : "training";
}

const EXIT_OUTCOME: Partial<Record<string, OnboardStatus>> = {
  cancelled_training: "cancelled",
  cancelled_recruit: "cancelled",
  waived: "waived",
  trial_exit: "trialExit",
  resigned: "leftBeforeHandover",
  dismissed: "leftBeforeHandover",
  left: "leftBeforeHandover",
};

/** ลูกค้าของคำขอในรูปเดียวกับทะเบียน — ตำแหน่ง MS ต่อ ` MS` */
function customerOf(r: OnboardingRecord): string {
  const base = customerLabel(r);
  return r.position === "MS" && base && !/\sMS$/i.test(base) ? `${base} MS` : base;
}

/** สถานะ Onboarding ของคนหนึ่งคน · ยังไม่มีคน (อัตราว่าง) = `null` */
function onboardOf(r: OnboardingRecord): OnboardStatus | null {
  if (!hasPerson(r)) return null;
  const stage = stageOf(r);
  if (stage === "open") return null;
  if (stage === "working") return "handedOver";
  if (stage !== "ended") return pipelineOf(r) as OnboardStatus;
  if (EXIT_OUTCOME[r.outcome]) return EXIT_OUTCOME[r.outcome]!;
  if (r.match?.status === "cancelled") return "cancelled";
  if (r.atms?.exited) return "leftBeforeHandover";
  return "unknown";
}

export async function getManpowerBoard(): Promise<ManpowerBoard> {
  const [drivers, records, registrySyncedAt] = await Promise.all([
    readDrivers<RegistryDoc>(["customer", "plant", "position", "active", "statusOverride", "startDate", "resignation"]),
    getOnboardingRecords(),
    driversSyncedAt(),
  ]);
  const year = Number(todayInBangkok().slice(0, 4));
  const inYear = (iso: string) => iso.startsWith(`${year}-`);

  const rows = new Map<string, ManpowerRow>();
  const names = new Map<string, string>();
  const nameOf = (raw: string) => {
    const k = norm(raw);
    if (!names.has(k)) names.set(k, raw);
    return names.get(k)!;
  };
  const rowOf = (customer: string, plant: string) => {
    const c = customer || NONE;
    const p = plant || NONE;
    const key = `${norm(c)}|${norm(p)}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, customer: nameOf(c), plant: nameOf(p), working: 0, mixerL: 0, mixerS: 0, open: 0, waitTraining: 0, training: 0, waitHandover: 0, joined: 0, left: 0, joinedByMonth: Array(12).fill(0), leftByMonth: Array(12).fill(0), onboard: Object.fromEntries(ONBOARD_STATUSES.map((k) => [k, 0])) as Record<OnboardStatus, number> };
      rows.set(key, row);
    }
    return row;
  };

  const positions = { mixerL: 0, mixerS: 0, other: 0 };
  for (const d of drivers) {
    const override = str(d.statusOverride);
    /* กติกาเดียวกับ `toRecord()` — บันทึกการพ้นสภาพชนะ `active` ของ ETL */
    const active = override ? override === "active" : Boolean(d.active);
    const row = rowOf(str(d.customer), str(d.plant));
    if (active) {
      row.working++;
      const pos = str(d.position);
      if (pos === "Mixer L") {
        positions.mixerL++;
        row.mixerL++;
      } else if (pos === "Mixer S") {
        positions.mixerS++;
        row.mixerS++;
      } else positions.other++;
    }
    const start = toIsoDate(d.startDate);
    if (inYear(start)) {
      row.joined++;
      row.joinedByMonth[Number(start.slice(5, 7)) - 1]++;
    }
    const exit = active ? "" : toIsoDate(d.resignation?.dateISO ?? d.resignation?.date);
    if (inYear(exit)) {
      row.left++;
      row.leftByMonth[Number(exit.slice(5, 7)) - 1]++;
    }
  }

  for (const r of records) {
    const bucket = pipelineOf(r);
    if (!bucket) continue;
    rowOf(customerOf(r), r.plant)[bucket]++;
  }

  /* คนที่เข้าฝึกปีนี้ (ยังไม่มีวันเริ่มฝึก = รอฝึก นับด้วย) */
  for (const r of records) {
    const status = onboardOf(r);
    const start = trainingStart(r);
    if (!status || (start && !inYear(start))) continue;
    rowOf(customerOf(r), r.plant).onboard[status]++;
  }

  return {
    rows: [...rows.values()].filter(
      (r) =>
        r.working || r.open || r.waitTraining || r.training || r.waitHandover || r.joined || r.left || Object.values(r.onboard).some(Boolean),
    ),
    year,
    positions,
    registrySyncedAt,
    readAt: new Date().toISOString(),
  };
}
