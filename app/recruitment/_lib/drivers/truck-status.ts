import { atmsCol, etlCol, hrCol } from "@/lib/db";
import { todayInBangkok } from "@/lib/record-case-flow";
import { readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { readRepairBoard, type RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import { getFleetStops, type FleetStop } from "@/app/recruitment/_lib/drivers/fleet-current";
import { personName } from "@/app/recruitment/_lib/requisitions/types";
import { getOnboardingRecords } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { PIPELINE_LABEL, pipelineOf, type Pipeline } from "@/app/recruitment/_lib/requisitions/onboarding";
import {
  isExitStatus,
  workStatusFullLabel,
  workStatusTone,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * สถานะรถรายคันในภาพเดียว — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียวจาก `Boom_ETL`**
 *
 * แนวคิดจากหน้า `driver-handover` ของ mena-wms (รถ + คน + งานซ่อมบนจอเดียว) · รถ/คน/สถานะงานมาจาก ETL:
 * `vehicles` (รถ) · **คนขับอยู่รถไหน + รหัสสถานะวันนี้ = `atms.vehicle_daily_asia`** (Bew สั่ง 6 พ.ย. 2026
 * — แทน `main_driver.vehicle` ของทะเบียน) · วันนี้ ETL ยังไม่ลง → ใช้วันล่าสุดที่มี แล้วเอารหัสวันนี้จาก
 * `employee_work_status` · **รถซ่อม** ตัดสินแบบ dashboard-op3 “รถค้างซ่อม” = ATMS `fleet/current`
 * สถานะ B/อ/PM สด (`fleet-current.ts`) · บอร์ดซ่อม (`repair-status.ts`) ใช้แค่บอกขั้นงาน/กำหนดเสร็จ
 * (Bew เลือก 15 ต.ค. 2026 — บอร์ดซ่อมมีใบที่ยังไม่ปิดทั้งที่รถวิ่งแล้ว เช่น สบ.70-6292)
 * อ่าน ATMS ไม่ได้ → ถอยไปใช้บอร์ดซ่อมแบบเดิม (`repairSource: "board"`)
 *
 * **ใครเขียน `Boom_ETL`** — ไม่ใช่ mena-next · mena-next เองก็อ่านผ่าน `mongodbapi` (Cloud Run) ·
 * `_source` บอกที่มา: `vehicles` = `scrap_truck` · `main_driver` = `scrap_driver` (ดึงจาก ATMS) ·
 * `maintenance_request` = `atms_scrape` · `employee_work_status` = `excel-YYYY-MM-groupN` (ไฟล์ Excel
 * ที่อัปเป็นรอบ) · เวลาที่เห็นจากข้อมูล 14 ต.ค. 2026 (เวลาไทย): รถ ~09:00 · คนขับ/สถานะงาน ~15:00 ·
 * ใบแจ้งซ่อมหลายรอบต่อวัน — เป็นสิ่งที่สังเกตจาก timestamp ไม่ใช่ตารางที่ยืนยันแล้ว
 *
 * ลำดับการตัดสิน (ข้อแรกที่เข้า = สถานะของคัน):
 * 0. **รถรอสรรหา** — มี JR ผูกรถคันนี้ที่ยังไม่ได้คนเริ่มฝึก (รอสรรหา · รอฝึกงาน) · ฝึกงาน/รอรับรถ = มีคนแล้ว
 *    ไปตามสถานะตัวรถ และถ้า ATMS ยังไม่มีคนขับก็นับคนฝึกงานเป็นคนขับ (พร้อมวิ่ง) · Bew 6 พ.ย. 2026
 * 1. **รถซ่อม** — ATMS บอกว่าหยุดวิ่ง (ไม่สนว่ามีคนขับไหม)
 * 2. **ไม่มีคนขับ** — `vehicle_daily` ไม่มีคนขับของคันนี้ (รวมคนที่วันนี้เป็น ลอ/ปอ)
 * 3. **คนขับไม่มา** — มีคนขับ แต่วันนี้ทุกคนเป็นรหัสลา/หยุด/ตกคิว
 * 4. **พร้อมวิ่ง** — มีคนขับที่วันนี้ทำงาน (A…/ฝ) หรือยังไม่มีบันทึกของวันนี้
 *
 * `car` = สถานะตัวรถล้วน (ข้อ 1–4 ไม่ดู JR) ใช้กับคอลัมน์สถานะรถ — คันรอสรรหาก็ยังบอกได้ว่าซ่อม/จอด/วิ่ง
 */

export type TruckState = "hiring" | "ready" | "absent" | "repair" | "nodriver";
export type CarState = Exclude<TruckState, "hiring">;

export interface TruckDriver {
  code: string;
  name: string;
  phone: string;
  /** รหัสสถานะของวันนี้ เช่น `A` `ล` · ว่าง = ยังไม่มีบันทึกของวันนี้ */
  today: string;
  todayLabel: string;
  tone: ReturnType<typeof workStatusTone>;
}

/** คำขอสรรหา (JR) ที่ผูกรถคันนี้และยังไม่รับรถ */
export interface TruckJob {
  id: string;
  code: string;
  /** ช่วงก่อนรับรถ — ชุดเดียวกับหน้าติดตามพนักงานใหม่ (`pipelineOf`) */
  status: Pipeline;
  statusLabel: string;
  /** ชื่อผู้สมัครที่ผูกแล้ว · ว่าง = ยังไม่มี */
  candidate: string;
  /** รหัส พจส. ของผู้สมัคร (ถ้ามีแล้ว) — ใช้ตัดชื่อซ้ำกับคนขับใน ATMS */
  candidateCode: string;
  /** `true` = ยังหาคน (รอสรรหา · รอฝึกงาน) → รถรอสรรหา · `false` = มีคนฝึกงาน/รอรับรถแล้ว */
  hiring: boolean;
  requestedOn: string;
}

export interface TruckRow {
  id: string;
  /** เลขรถ เช่น `ME127` */
  code: string;
  plate: string;
  /** `vehicles.fleet` = ลูกค้า */
  fleet: string;
  branch: string;
  plant: string;
  vehicleType: string;
  state: TruckState;
  /** สถานะตัวรถไม่นับ JR — คอลัมน์สถานะรถ */
  car: CarState;
  drivers: TruckDriver[];
  /** ATMS บอกว่าหยุดวิ่ง (B/อ/PM) · `null` = วิ่งอยู่ หรืออ่าน ATMS ไม่ได้ */
  stop: FleetStop | null;
  /** ขั้นงานบนบอร์ดซ่อม — ขึ้นเฉพาะคันที่หยุดวิ่ง */
  repair: RepairStatus | null;
  /** รอบ ETL ล่าสุดที่มีแถวของคันนี้ใน `vehicle_daily` (ISO) · คันที่ไม่มีแถวเกิน 30 วันถูกตัดออกตั้งแต่ฝั่งเซิร์ฟเวอร์ */
  updatedAt: string | null;
  /** JR ที่กำลังสรรหาคนให้คันนี้ (หน้าติดตามพนักงานใหม่) · `null` = ไม่มี */
  job: TruckJob | null;
}

export interface TruckBoard {
  trucks: TruckRow[];
  /** สาขาที่หน้านี้แสดง (`vehicles.branch`) */
  branch: string;
  /** วันที่ที่ใช้อ่านสถานะคนขับ `YYYY-MM-DD` */
  today: string;
  /** `atms` = สถานะซ่อมสดจาก `fleet/current` · `board` = อ่าน ATMS ไม่ได้ ใช้บอร์ดซ่อมแทน */
  repairSource: "atms" | "board";
  /** รอบ sync ล่าสุดของแต่ละแหล่ง (ISO · `null` = อ่านไม่ได้) — ขึ้นในกล่อง ⓘ ของหน้า */
  synced: { vehicles: string | null; drivers: string | null; work: string | null; repairs: string | null };
}

/** ค่ามากสุดของเวลา sync — เก็บทั้ง `Date` และสตริง ISO ได้ */
function latest(prev: string | null, raw: unknown): string | null {
  const v = raw instanceof Date ? raw.toISOString() : str(raw);
  return v && (!prev || v > prev) ? v : prev;
}

/**
 * นับเฉพาะรถที่ต้องมีคนขับ — หาง / กล้วยหอม (หางพ่วง) / รถหลอก / รถสำนักงาน ไม่มีคนขับประจำ
 * ใส่มาจะทำให้ “ไม่มีคนขับ” พองเกินจริงร้อยกว่าคัน (ตรวจ 14 ต.ค. 2026)
 */
const NON_DRIVEN_TYPE = /^หาง|กล้วยหอม|รถหลอก|รถสำนักงาน|ตัดยาง/;
const SKIP_FLEETS = new Set(["รถขาย", "รถสำนักงาน"]);
/**
 * รถที่ dashboard-op3 นับ (พจส. + พจร.) — `รถร่วมมีนา` = พจร. ใน ATMS · คนขับอยู่ใน `main_driver`
 * แทบทุกคัน (123/129 · ตรวจ 15 ต.ค. 2026) · รถร่วมภายนอก/Supplier ไม่นับ
 */
const OWN_FLEET_TYPES = ["รถมีนา", "รถบริหารฟลีท", "รถร่วมมีนา"];
/** หน้านี้ดูแลเฉพาะรถลาดกระบัง (`vehicles.branch` · Bew สั่ง 6 พ.ย. 2026 — สาขาอื่น/DIST ไม่แสดง) */
const TRUCK_BRANCH = "ลาดกระบัง";
/** แถวใน `atms.vehicle_daily_asia` ที่ใช้ — ชื่อฟิลด์ไทยตาม ATMS */
interface VehicleDailyDoc {
  วันที่?: string;
  เบอร์รถ?: unknown;
  ทะเบียน?: string;
  คนขับ?: string | null;
  รหัสคนขับ?: unknown;
  ชื่อคนขับ?: string | null;
  etl_run_at?: unknown;
}

/** dashboard-op3 ตัดคันที่ขั้นซ่อม “รถรอขาย” ออกจากรถค้างซ่อม — ทำตาม */
const FOR_SALE_STEP = "รถรอขาย";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : String(v ?? "").trim());
/** ช่องว่างใน `vehicle_daily` มาเป็น `NaN` (ตัวเลข/ข้อความ — ETL ฝั่ง pandas) — นับเป็นว่าง */
const cell = (v: unknown) => {
  const s = typeof v === "number" && Number.isNaN(v) ? "" : str(v);
  return /^nan$/i.test(s) ? "" : s;
};
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : str(v) || null);

/** `dd/MM/yyyy` (ค.ศ.) → `yyyy-MM-dd` · อ่านไม่ออก = `""` */
function dmyToIso(raw: unknown): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str(raw));
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** `t_date` ของเดือน (`01/MM/yyyy`) — คีย์ที่มีดัชนี */
const monthKey = (ym: string) => `01/${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

function prevMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * แถวคนขับของ “วันล่าสุดที่ไม่เกินวันนี้” — ปกติคือวันนี้ (ETL ลงวันละรอบ ~10:20) · ต้นเดือนที่
 * ETL ยังไม่ลงเดือนใหม่ถอยไปเดือนก่อน · วันเดียวกันมีหลายรอบให้รอบใหม่สุดชนะ
 */
async function readVehicleDaily(today: string): Promise<{ day: string; rows: VehicleDailyDoc[] }> {
  const col = await atmsCol<VehicleDailyDoc>("vehicleDaily");
  const projection = {
    _id: 0,
    วันที่: 1,
    เบอร์รถ: 1,
    ทะเบียน: 1,
    คนขับ: 1,
    รหัสคนขับ: 1,
    ชื่อคนขับ: 1,
    etl_run_at: 1,
  };
  for (const ym of [today.slice(0, 7), prevMonth(today.slice(0, 7))]) {
    const docs = await col.find({ t_date: monthKey(ym) }, { projection }).toArray();
    const day = docs.reduce((max, d) => {
      const at = dmyToIso(d.วันที่);
      return at <= today && at > max ? at : max;
    }, "");
    if (!day) continue;
    const byPlate = new Map<string, VehicleDailyDoc>();
    for (const d of docs) {
      if (dmyToIso(d.วันที่) !== day) continue;
      const key = cell(d.ทะเบียน) || cell(d.เบอร์รถ);
      const prev = byPlate.get(key);
      if (!prev || (iso(d.etl_run_at) ?? "") >= (iso(prev.etl_run_at) ?? "")) byPlate.set(key, d);
    }
    return { day, rows: [...byPlate.values()] };
  }
  return { day: "", rows: [] };
}

/**
 * JR ที่ผูกรถ (`vehicle`) และยังไม่รับรถ — ช่วงคิดด้วย `pipelineOf()` ชุดเดียวกับหน้าติดตามพนักงานใหม่
 * (รับรถแล้ว / จบ / ยกเลิก = ไม่ขึ้น) · คีย์ทั้งทะเบียนและเบอร์รถ · คันเดียวมีหลายใบให้ใบที่ขอล่าสุดชนะ
 */
/** ช่วงที่ยังนับเป็นรถรอสรรหา — ฝึกงาน/รอรับรถ มีคนแล้ว (Bew 6 พ.ย. 2026) */
const HIRING = new Set<Pipeline>(["open", "waitTraining"]);

async function readJobs(): Promise<Map<string, TruckJob>> {
  const records = (await getOnboardingRecords()).sort((a, b) => a.requestedOn.localeCompare(b.requestedOn));
  const jobs = new Map<string, TruckJob>();
  for (const r of records) {
    const status = pipelineOf(r);
    if (!status || !r.vehicle) continue;
    const job: TruckJob = {
      id: r.id,
      code: r.code,
      status,
      statusLabel: PIPELINE_LABEL[status],
      candidate: status === "open" ? "" : personName(r),
      candidateCode: r.drivercode ?? "",
      hiring: HIRING.has(status),
      requestedOn: r.requestedOn,
    };
    for (const ref of [r.vehicle.plateNo, r.vehicle.code]) if (ref) jobs.set(ref, job);
  }
  return jobs;
}

/** ไม่มีแถวใน `vehicle_daily` นานเท่านี้ = เลิกใช้/ไม่ได้วิ่งแล้ว ไม่แสดงบนหน้า (Bew สั่ง 6 พ.ย. 2026) */
const STALE_DAYS = 30;

/**
 * วันล่าสุดที่แต่ละคันมีแถวใน `vehicle_daily` ภายใน `STALE_DAYS` วัน (คีย์ทั้งทะเบียนและเบอร์รถ) ·
 * `at` = รอบ ETL ล่าสุดที่มีคันนี้ — ขึ้นเป็นเวลาอัปเดตของคันที่วันนี้ไม่มีแถว
 */
async function readLastSeen(today: string): Promise<Map<string, { day: string; at: string | null }>> {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - STALE_DAYS * 86_400_000);
  const col = await atmsCol("vehicleDaily");
  const groups = await col
    .aggregate<{ _id: { plate: unknown; code: unknown }; day: Date; at: unknown }>([
      { $match: { t_date: { $in: [today.slice(0, 7), prevMonth(today.slice(0, 7))].map(monthKey) } } },
      {
        $set: {
          _day: { $dateFromString: { dateString: "$วันที่", format: "%d/%m/%Y", onError: null, onNull: null } },
        },
      },
      { $match: { _day: { $gte: cutoff } } },
      { $group: { _id: { plate: "$ทะเบียน", code: "$เบอร์รถ" }, day: { $max: "$_day" }, at: { $max: "$etl_run_at" } } },
    ])
    .toArray();
  const seen = new Map<string, { day: string; at: string | null }>();
  for (const g of groups) {
    const entry = { day: g.day.toISOString().slice(0, 10), at: iso(g.at) };
    for (const ref of [cell(g._id.plate), cell(g._id.code)]) {
      const prev = seen.get(ref);
      if (ref && (!prev || entry.day > prev.day)) seen.set(ref, entry);
    }
  }
  return seen;
}

export async function getTruckBoard(): Promise<TruckBoard> {
  const today = todayInBangkok();
  const ym = today.slice(0, 7);
  const dd = today.slice(8, 10);

  const [vehicleDocs, daily, lastSeen, jobs, drivers, workDocs, repairBoard, stops] = await Promise.all([
    etlCol("vehicles").then((c) =>
      c
        .find(
          { active: true, branch: TRUCK_BRANCH, co_owner_type: { $in: OWN_FLEET_TYPES } },
          {
            projection: {
              code: 1,
              plate_no: 1,
              fleet: 1,
              branch: 1,
              plant: 1,
              vehicle_type: 1,
              synced_at: 1,
            },
          },
        )
        .toArray(),
    ),
    readVehicleDaily(today),
    readLastSeen(today),
    readJobs(),
    /* เบอร์โทรจากทะเบียน พจส. — vehicle_daily ไม่มี */
    readDrivers<{ drivercode: string; phone?: string }>(["drivercode", "phone"]),
    etlCol("workStatus").then((c) =>
      c
        .find(
          {},
          {
            projection: {
              employee_code: 1,
              latest_status: 1,
              latest_work_date: 1,
              synced_at: 1,
              [`months.${ym}.${dd}`]: 1,
            },
          },
        )
        .toArray(),
    ),
    readRepairBoard(),
    getFleetStops(),
  ]);
  const repairs = repairBoard.statuses;

  /* สถานะของ “วันนี้” — ตารางรายเดือนก่อน · `latest_*` ใช้เมื่อเป็นวันนี้จริงเท่านั้น
     (ETL ลงวันลาล่วงหน้าได้ `latest_work_date` จึงอาจเป็นพรุ่งนี้) */
  /* ATMS อ่านสด เวลาข้อมูล = ตอนเปิดหน้า */
  const synced: TruckBoard["synced"] = {
    vehicles: null,
    drivers: null,
    work: null,
    repairs: stops ? new Date().toISOString() : repairBoard.syncedAt,
  };
  const todayStatus = new Map<string, string>();
  for (const w of workDocs) {
    synced.work = latest(synced.work, w.synced_at);
    const code = str(w.employee_code);
    const months = w.months as Record<string, Record<string, unknown>> | undefined;
    const fromMonth = str(months?.[ym]?.[dd]);
    const fromLatest = str(w.latest_work_date) === today ? str(w.latest_status) : "";
    if (code) todayStatus.set(code, fromMonth || fromLatest);
  }

  /* ทะเบียน/เลขรถ → คนขับจาก vehicle_daily · รหัสสถานะของแถวใช้ได้เมื่อแถวเป็นของวันนี้ */
  const phoneOf = new Map(drivers.map((d) => [d.drivercode, str(d.phone)]));
  const byVehicle = new Map<string, { crew: TruckDriver[]; at: string | null }>();
  for (const row of daily.rows) {
    const at = iso(row.etl_run_at);
    synced.drivers = latest(synced.drivers, at);
    const code = cell(row.รหัสคนขับ).replace(/\.0$/, "");
    const status = daily.day === today ? cell(row.คนขับ) || (todayStatus.get(code) ?? "") : (todayStatus.get(code) ?? "");
    const crew: TruckDriver[] =
      code && !isExitStatus(status)
        ? [
            {
              code,
              name: cell(row.ชื่อคนขับ),
              phone: phoneOf.get(code) ?? "",
              today: status,
              todayLabel: status ? workStatusFullLabel(status) : "ยังไม่มีบันทึกวันนี้",
              tone: workStatusTone(status),
            },
          ]
        : [];
    for (const ref of [cell(row.ทะเบียน), cell(row.เบอร์รถ)]) if (ref) byVehicle.set(ref, { crew, at });
  }

  const trucks: TruckRow[] = [];
  for (const v of vehicleDocs) {
    const vehicleType = str(v.vehicle_type);
    const fleet = str(v.fleet);
    if (NON_DRIVEN_TYPE.test(vehicleType) || SKIP_FLEETS.has(fleet)) continue;

    const code = str(v.code);
    const plate = str(v.plate_no);
    /* ไม่มีแถวใน vehicle_daily มา STALE_DAYS วัน = ไม่แสดง */
    const seen = lastSeen.get(plate) ?? (code ? lastSeen.get(code) : undefined);
    if (!seen) continue;
    const assigned = byVehicle.get(plate) ?? (code ? byVehicle.get(code) : undefined);
    const crew = assigned?.crew ?? [];
    const stop = stops ? (stops.get(plate) ?? (code ? stops.get(code) : undefined) ?? null) : null;
    const stopped = stops ? Boolean(stop) : Boolean(repairs[plate]);
    const repair = stopped ? (repairs[plate] ?? null) : null;
    if (stopped && repair?.label === FOR_SALE_STEP) continue;
    synced.vehicles = latest(synced.vehicles, v.synced_at);
    const car = stateOf(crew, stopped);
    const job = jobs.get(plate) ?? (code ? jobs.get(code) : undefined) ?? null;
    /* คนฝึกงานของคันนี้ยังไม่ขึ้นใน ATMS = นับเป็นคนขับ ไม่ใช่ "ไม่มีคนขับ" */
    const state: TruckState = job?.hiring ? "hiring" : car === "nodriver" && job ? "ready" : car;

    trucks.push({
      id: str(v._id),
      code,
      plate,
      fleet: fleet || "ไม่ระบุลูกค้า",
      branch: str(v.branch),
      plant: str(v.plant),
      vehicleType,
      state,
      car,
      drivers: crew,
      stop,
      repair,
      updatedAt: assigned?.at ?? seen.at,
      job,
    });
  }

  return { trucks, branch: TRUCK_BRANCH, today, repairSource: stops ? "atms" : "board", synced };
}

function stateOf(crew: TruckDriver[], stopped: boolean): CarState {
  if (stopped) return "repair";
  if (!crew.length) return "nodriver";
  const working = crew.some((d) => !d.today || d.tone === "work" || d.today === "ฝ");
  return working ? "ready" : "absent";
}
