import { etlCol } from "@/lib/db";
import { todayInBangkok } from "@/lib/record-case-flow";
import { readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { getRepairBoard, type RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";
import { getFleetStops, type FleetStop } from "@/app/recruitment/_lib/drivers/fleet-current";
import {
  isExitStatus,
  workStatusFullLabel,
  workStatusTone,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * สถานะรถรายคันในภาพเดียว — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียวจาก `Boom_ETL`**
 *
 * แนวคิดจากหน้า `driver-handover` ของ mena-wms (รถ + คน + งานซ่อมบนจอเดียว) · รถ/คน/สถานะงานมาจาก ETL:
 * `vehicles` (รถ) · `main_driver.vehicle` (คนขับประจำ — เก็บเป็นทะเบียน) · สถานะงานวันนี้ของคนขับ
 * (`employee_work_status`) · **รถซ่อม** ตัดสินแบบ dashboard-op3 “รถค้างซ่อม” = ATMS `fleet/current`
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
 * 1. **รถซ่อม** — ATMS บอกว่าหยุดวิ่ง (ไม่สนว่ามีคนขับไหม)
 * 2. **ไม่มีคนขับ** — ไม่มี พจส. ที่ยังทำงานประจำคันนี้ (รวมคนที่วันนี้เป็น ลอ/ปอ)
 * 3. **คนขับไม่มา** — มีคนขับ แต่วันนี้ทุกคนเป็นรหัสลา/หยุด/ตกคิว
 * 4. **พร้อมวิ่ง** — มีคนขับที่วันนี้ทำงาน (A…/ฝ) หรือยังไม่มีบันทึกของวันนี้
 */

export type TruckState = "ready" | "absent" | "repair" | "nodriver";

export interface TruckDriver {
  code: string;
  name: string;
  phone: string;
  /** รหัสสถานะของวันนี้ เช่น `A` `ล` · ว่าง = ยังไม่มีบันทึกของวันนี้ */
  today: string;
  todayLabel: string;
  tone: ReturnType<typeof workStatusTone>;
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
  drivers: TruckDriver[];
  /** ATMS บอกว่าหยุดวิ่ง (B/อ/PM) · `null` = วิ่งอยู่ หรืออ่าน ATMS ไม่ได้ */
  stop: FleetStop | null;
  /** ขั้นงานบนบอร์ดซ่อม — ขึ้นเฉพาะคันที่หยุดวิ่ง */
  repair: RepairStatus | null;
}

export interface TruckBoard {
  trucks: TruckRow[];
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
/** dashboard-op3 ตัดคันที่ขั้นซ่อม “รถรอขาย” ออกจากรถค้างซ่อม — ทำตาม */
const FOR_SALE_STEP = "รถรอขาย";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : String(v ?? "").trim());

export async function getTruckBoard(): Promise<TruckBoard> {
  const today = todayInBangkok();
  const ym = today.slice(0, 7);
  const dd = today.slice(8, 10);

  const [vehicleDocs, drivers, workDocs, repairBoard, stops] = await Promise.all([
    etlCol("vehicles").then((c) =>
      c
        .find(
          { active: true, co_owner_type: { $in: OWN_FLEET_TYPES } },
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
    readDrivers<{
      drivercode: string;
      driverName?: string;
      vehicleCode?: string;
      phone?: string;
      active?: boolean;
      statusOverride?: string;
      syncedAt?: unknown;
    }>(["drivercode", "driverName", "vehicleCode", "phone", "active", "statusOverride", "syncedAt"]),
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
    getRepairBoard(),
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

  /* ทะเบียน/เลขรถ → คนขับที่ยังทำงาน (ค่าที่ฝ่ายบุคคลกดเองชนะ ETL) */
  const byVehicle = new Map<string, TruckDriver[]>();
  for (const d of drivers) {
    synced.drivers = latest(synced.drivers, d.syncedAt);
    const ref = str(d.vehicleCode);
    const active = d.statusOverride ? d.statusOverride === "active" : Boolean(d.active);
    if (!ref || !active) continue;
    const today = todayStatus.get(d.drivercode) ?? "";
    if (isExitStatus(today)) continue;
    const list = byVehicle.get(ref) ?? [];
    list.push({
      code: d.drivercode,
      name: str(d.driverName),
      phone: str(d.phone),
      today,
      todayLabel: today ? workStatusFullLabel(today) : "ยังไม่มีบันทึกวันนี้",
      tone: workStatusTone(today),
    });
    byVehicle.set(ref, list);
  }

  const trucks: TruckRow[] = [];
  for (const v of vehicleDocs) {
    const vehicleType = str(v.vehicle_type);
    const fleet = str(v.fleet);
    if (NON_DRIVEN_TYPE.test(vehicleType) || SKIP_FLEETS.has(fleet)) continue;

    const code = str(v.code);
    const plate = str(v.plate_no);
    const crew = [
      ...(byVehicle.get(plate) ?? []),
      ...(code && code !== plate ? (byVehicle.get(code) ?? []) : []),
    ];
    const stop = stops ? (stops.get(plate) ?? (code ? stops.get(code) : undefined) ?? null) : null;
    const stopped = stops ? Boolean(stop) : Boolean(repairs[plate]);
    const repair = stopped ? (repairs[plate] ?? null) : null;
    if (stopped && repair?.label === FOR_SALE_STEP) continue;
    synced.vehicles = latest(synced.vehicles, v.synced_at);

    trucks.push({
      id: str(v._id),
      code,
      plate,
      fleet: fleet || "ไม่ระบุลูกค้า",
      branch: str(v.branch),
      plant: str(v.plant),
      vehicleType,
      state: stateOf(crew, stopped),
      drivers: crew,
      stop,
      repair,
    });
  }

  return { trucks, today, repairSource: stops ? "atms" : "board", synced };
}

function stateOf(crew: TruckDriver[], stopped: boolean): TruckState {
  if (stopped) return "repair";
  if (!crew.length) return "nodriver";
  const working = crew.some((d) => !d.today || d.tone === "work" || d.today === "ฝ");
  return working ? "ready" : "absent";
}
