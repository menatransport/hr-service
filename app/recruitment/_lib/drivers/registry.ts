import type { Collection } from "mongodb";

import { etlCol, hrCol } from "@/lib/db";
import { deleteDriverDocumentFile } from "./documents";
import { driverExists, HR_FIELDS, IN_REGISTRY, PROFILE_FIELDS, readDriver, readDrivers, type DriverField } from "./master";
import { mediaKeyOf } from "@/lib/media";
import { deleteMedia } from "@/lib/s3";
import { pickResignReason } from "@/app/recruitment/_lib/resign-reasons/store";
import { isExitType } from "@/app/recruitment/_lib/resign-reasons/types";
import {
  collectDocExpiries,
  DRIVER_EDIT_FIELDS,
  isDriverDocType,
  normalizeDriverEdit,
  isWorkStatusCode,
  ownerTypeLabel,
  resolveOwnerTypeKey,
  siteLabel,
  siteOfBranch,
  vehicleMixLabel,
  type DocExpiry,
  type DriverDocument,
  type DriverPick,
  type DriverRecord,
  type DriverRegistry,
  type DriverResignation,
  type DriverStatus,
  type DriverVehicle,
  type DriverWorkMonth,
  type DriverWorkStatus,
  type TraineeDailyEntry,
} from "./types";

/**
 * ทะเบียนประวัติ พจส. — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * รายชื่อหลักคือ `hr_service.master_driver` ที่มี `registry` (นำเข้าจาก Excel ทะเบียน 2026 +
 * คนใหม่จากหน้าติดตามพนักงานใหม่) — อ่านผ่าน `./master.ts` ที่เดียว · **ไม่อ่าน `Boom_ETL.main_driver` แล้ว**
 *
 * ส่วนรถกับสถานะการทำงานเป็นข้อมูล **ยืมมาอ่านเฉย ๆ** ไม่มีฟิลด์ของ hr-service
 * ปนอยู่ จึงอ่านสดจาก `Boom_ETL` ได้เลย ไม่ต้อง sync ซ้ำอีกชุด · ถ้าอ่านไม่ได้
 * ก็แค่ไม่มีข้อมูลเสริม รายชื่อยังขึ้นครบ (`enrichmentFailed`)
 */

/** เอกสาร พจส. ใน `master_driver` ตามที่ `readDrivers()` คืนมา */
interface MasterDriverDoc {
  drivercode?: unknown;
  driverName?: unknown;
  /** ฟิลด์ของ hr-service เอง ไม่ได้มาจาก ETL — ดู `setDriverPhoto()` / `setDriverStatus()` */
  photoUrl?: unknown;
  statusOverride?: unknown;
  /** วันหมดอายุบัตรประชาชนที่ฝ่ายบุคคลกรอกเอง — ดู `setDriverIdCardExpiry()` */
  idCardExpiryDate?: unknown;
  resignation?: unknown;
  /** เอกสารในแฟ้มประวัติ — ดู `attachDriverDocument()` */
  documents?: StoredDocumentEntry[];
  /** เวลาที่ลบรูปและเอกสารทิ้งตามนโยบายเก็บ 1 เดือนหลังพ้นสภาพ — ดู `media-retention.ts` */
  mediaPurgedAt?: unknown;
  ownerType?: unknown;
  branch?: unknown;
  vehicleCode?: unknown;
  startDate?: unknown;
  licenseExpiryDate?: unknown;
  licenseNo?: unknown;
  licenseType?: unknown;
  nationalId?: unknown;
  phone?: unknown;
  phoneAlt?: unknown;
  emergencyContactName?: unknown;
  emergencyContactRelation?: unknown;
  emergencyContactPhone?: unknown;
  bankAccountNo?: unknown;
  bankBranch?: unknown;
  profileEditedAt?: unknown;
  profileEditedBy?: unknown;
  customer?: unknown;
  plant?: unknown;
  position?: unknown;
  active?: unknown;
  syncedAt?: unknown;
  /** มี = อยู่ในทะเบียน — ดู `./master.ts` */
  registry?: unknown;
}

/**
 * เอกสารหนึ่งใบตามที่เก็บอยู่จริงในฐานข้อมูล — ต่างจาก `DriverDocument` ตรงที่
 * `uploadedAt` เป็น `Date` ของ Mongo · ประกาศไว้เพื่อให้ `$push`/`$pull`
 * ตรวจชนิดได้ ส่วนขาอ่านยังผ่าน `toDocuments()` ที่ไม่เชื่อรูปร่างอะไรทั้งนั้น
 */
interface StoredDocumentEntry {
  fileId: string;
  key: string;
  name: string;
  type: string;
  size: number;
  docType: string;
  note: string;
  uploadedAt: Date | string;
  uploadedBy: string;
}

export class DriverRegistryError extends Error {}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/* ------------------------------------------------------------- วันที่ */

/**
 * แปลงวันที่จากต้นทางให้เป็น `YYYY-MM-DD` (ค.ศ.) — คืนค่าว่างถ้าอ่านไม่ออก
 *
 * ETL ส่งวันที่มาเป็น **string** ที่รูปแบบไม่การันตี จึงรับไว้หลายแบบเท่าที่พบ
 * ได้ในข้อมูลไทยทั่วไป (ท่าเดียวกับ `parseDriverDate` ของระบบเดิม) · ปีที่มากกว่า
 * 2400 ถือว่าเป็น พ.ศ. แล้วลบ 543 ให้ — ปี ค.ศ. จริงไม่มีทางแตะ 2400
 */
export function toIsoDate(raw: unknown): string {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : raw.toISOString().slice(0, 10);
  }

  const value = str(raw);
  if (!value) return "";

  let y = 0;
  let m = 0;
  let d = 0;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value);

  if (iso) [, y, m, d] = iso.map(Number);
  else if (slash) [, d, m, y] = slash.map(Number);
  else return "";

  if (y > 2400) y -= 543;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * วันนี้ตามเวลาไทย เป็น `YYYY-MM-DD` — ฐานของทุกการนับวันในหน้านี้
 *
 * หน้าที่ให้กรอกรายวันต้องใช้ค่านี้ด้วย **ห้ามให้ client อ่านนาฬิกาเครื่องตัวเอง** —
 * เครื่องที่ตั้งเวลาไว้คนละโซนจะกรอกลงวันที่ผิดโดยไม่มีอะไรเตือน
 */
export function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const DAY_MS = 86_400_000;

/** จำนวนวันจาก `from` ถึง `to` — ทั้งคู่เป็น `YYYY-MM-DD` จึงเทียบเป็น UTC ได้ตรง */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/* ---------------------------------------------------- ข้อมูลเสริมจาก ETL */

function toVehicle(doc: Record<string, unknown>): DriverVehicle {
  const vehicleType = str(doc.vehicle_type) || str(doc.vehicle_type_extra);

  return {
    code: str(doc.code),
    plateNo: str(doc.plate_no),
    vehicleType,
    mix: vehicleMixLabel(vehicleType),
    brand: str(doc.brand),
    model: str(doc.model),
    fleet: str(doc.fleet),
    plant: str(doc.plant),
  };
}

/**
 * แกะ `months` ของ `employee_work_status` ให้เป็น **สถานะรายวัน** `YYYY-MM-DD → รหัส`
 *
 * **โครงข้างในยังไม่ได้ยืนยันกับข้อมูลจริง** (ต้นทางอยู่หลัง service `MONGODBAPI`
 * ที่อ่านโค้ดไม่ได้) จึงรับไว้ทุกแบบที่ตีความได้ชัดโดยไม่ต้องเดา แล้วข้ามอันที่
 * ตีความไม่ออกไปเงียบ ๆ — ปฏิทินที่ว่างดีกว่าปฏิทินที่ลงวันผิด:
 *
 * ```
 * months: { "2026-09": { "01": "A", "02": "ล" } }        ← วัน → รหัส
 * months: { "2026-09": { "01": { status: "A" } } }       ← วัน → อ็อบเจกต์
 * months: { "2026-09": [ { work_date: "2026-09-01", status: "A" } ] }
 * months: { "2026-09": { "2026-09-01": "A" } }           ← คีย์เป็นวันที่เต็ม
 * ```
 *
 * ปีที่มากกว่า 2400 ถือว่าเป็น พ.ศ. แล้วลบ 543 ให้ ทั้งในคีย์เดือนและคีย์วันที่เต็ม
 */
function toWorkDays(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};

  const days: Record<string, string> = {};

  /** ลงวันหนึ่งช่อง — กันค่าที่ไม่ใช่รหัสสถานะ (ตัวเลขยอดรวม ค่าว่าง) หลุดเข้าไป */
  const put = (iso: string, value: unknown) => {
    const code = typeof value === "string" ? value.trim() : statusOf(value);
    if (iso && code) days[iso] = code;
  };

  for (const [monthKey, monthValue] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = /^(\d{4})[-/]?(\d{1,2})$/.exec(monthKey.trim());
    if (!parsed) continue;

    let year = Number(parsed[1]);
    const month = Number(parsed[2]);
    if (month < 1 || month > 12) continue;
    if (year > 2400) year -= 543;
    const prefix = `${year}-${String(month).padStart(2, "0")}`;

    if (Array.isArray(monthValue)) {
      for (const entry of monthValue) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        put(toIsoDate(row.work_date ?? row.date ?? row.day), row.status);
      }
      continue;
    }

    if (!monthValue || typeof monthValue !== "object") continue;

    for (const [dayKey, dayValue] of Object.entries(monthValue as Record<string, unknown>)) {
      const key = dayKey.trim();

      // คีย์เป็นวันที่เต็มอยู่แล้ว
      if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(key)) {
        put(toIsoDate(key), dayValue);
        continue;
      }

      const day = Number(key);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;
      put(`${prefix}-${String(day).padStart(2, "0")}`, dayValue);
    }
  }

  return days;
}

/** ดึงรหัสสถานะออกจากอ็อบเจกต์รายวัน — ต้นทางอาจห่อไว้ในฟิลด์ชื่อใดชื่อหนึ่ง */
const STATUS_KEYS = ["status", "work_status", "code", "value"];

function statusOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  for (const key of STATUS_KEYS) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

/**
 * ยอดรวมรายเดือน — **คิดจากสถานะรายวันถ้ามี** ไม่งั้นค่อยใช้ตัวเลขที่ต้นทางส่งมา
 *
 * นับเฉพาะวันที่ได้ออกงานจริง (รหัสขึ้นต้นด้วย `A`) ไม่ใช่ทุกวันที่มีบันทึก —
 * วันลากับวันตกคิวก็มีบันทึกเหมือนกัน ถ้านับรวมจะอ่านเป็น “ทำงาน 30 วัน” ทั้งที่ลาไป 12
 */
const DAY_COUNT_KEYS = ["days", "work_days", "workdays", "total", "count"];

function toWorkMonths(raw: unknown, days: Record<string, string>): DriverWorkMonth[] {
  const totals = new Map<string, number>();

  if (Object.keys(days).length) {
    for (const [iso, code] of Object.entries(days)) {
      if (!code.toUpperCase().startsWith("A")) continue;
      const key = iso.slice(0, 7);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  } else if (raw && typeof raw === "object") {
    for (const [monthKey, value] of Object.entries(raw as Record<string, unknown>)) {
      const parsed = /^(\d{4})[-/]?(\d{1,2})$/.exec(monthKey.trim());
      if (!parsed) continue;

      let year = Number(parsed[1]);
      const month = Number(parsed[2]);
      if (month < 1 || month > 12) continue;
      if (year > 2400) year -= 543;

      let count: number | null = null;
      if (typeof value === "number") count = value;
      else if (value && typeof value === "object") {
        for (const field of DAY_COUNT_KEYS) {
          const candidate = (value as Record<string, unknown>)[field];
          if (typeof candidate === "number") {
            count = candidate;
            break;
          }
        }
      }
      if (count === null || !Number.isFinite(count)) continue;
      totals.set(`${year}-${String(month).padStart(2, "0")}`, Math.max(0, Math.round(count)));
    }
  }

  return [...totals]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const [year, month] = key.split("-").map(Number);
      return { key, year, month, days: count };
    });
}

function toWorkStatus(doc: Record<string, unknown>): DriverWorkStatus {
  const days = toWorkDays(doc.months);

  return {
    latestStatus: str(doc.latest_status),
    latestWorkDateISO: toIsoDate(doc.latest_work_date),
    days,
    months: toWorkMonths(doc.months, days),
  };
}

/**
 * ดึงรถและสถานะงานของรหัสที่ขอมา แล้วทำเป็น Map ให้ประกบกับรายชื่อได้ในรอบเดียว
 *
 * **หา `vehicles` ด้วยทั้ง `code` และ `plate_no`** — ค่าใน `main_driver.vehicle`
 * เป็นคนละอย่างกันแล้วแต่สาขา (ลาดกระบังเรียกกันด้วยเลขรถ สาขาอื่นใช้ทะเบียน)
 * ยิงคำสั่งเดียวด้วย `$or` แล้วทำดัชนีทั้งสองคีย์ จะได้ไม่ต้องเดาว่าแถวไหนเป็นแบบไหน
 *
 * ยิงสองคำสั่งพร้อมกัน ไม่ใช่ `$lookup` — สองคอลเลกชันนี้อยู่คนละ db กับรายชื่อหลัก
 * (`hr_service` กับ `Boom_ETL`) aggregate ข้าม db ไม่ได้อยู่แล้ว
 *
 * `work` บอกว่าต้องการสถานะงานไหม — **`months` คือก้อนใหญ่สุดของทั้งทะเบียน**
 * (ราว 3 KB ต่อคน · 4.4 MB ทั้งคอลเลกชัน) หน้าที่ไม่ได้วาดปฏิทินจึงต้องไม่ขอมา:
 * `"full"` = ปฏิทินรายวันครบ (หน้ารายคน) · `"none"` = ไม่อ่านเลย (ศูนย์เอกสาร) ·
 * ตารางรายชื่อที่ต้องการแค่สถานะล่าสุดใช้ `loadLatestEnrichmentAll()`
 */
type WorkDetail = "full" | "latest" | "none";

/** ฟิลด์ของ `vehicles` ที่ `toVehicle()` อ่านจริง — เลขตัวถัง ไฟแนนซ์ ฯลฯ ไม่ต้องข้ามเน็ตมา */
const VEHICLE_FIELDS = {
  code: 1,
  plate_no: 1,
  vehicle_type: 1,
  vehicle_type_extra: 1,
  brand: 1,
  model: 1,
  fleet: 1,
  plant: 1,
} as const;

const WORK_LATEST_FIELDS = { employee_code: 1, latest_status: 1, latest_work_date: 1 } as const;

async function loadEnrichment(
  vehicleRefs: string[],
  driverCodes: string[],
  work: WorkDetail = "full",
) {
  const [vehicleCol, workCol] = await Promise.all([etlCol("vehicles"), etlCol("workStatus")]);

  const [vehicleDocs, workDocs] = await Promise.all([
    vehicleRefs.length
      ? vehicleCol
          .find(
            { $or: [{ code: { $in: vehicleRefs } }, { plate_no: { $in: vehicleRefs } }] },
            { projection: VEHICLE_FIELDS },
          )
          .toArray()
      : Promise.resolve([]),
    driverCodes.length && work !== "none"
      ? workCol
          .find(
            { employee_code: { $in: driverCodes } },
            { projection: work === "full" ? { ...WORK_LATEST_FIELDS, months: 1 } : WORK_LATEST_FIELDS },
          )
          .toArray()
      : Promise.resolve([]),
  ]);

  return { vehicles: toVehicleMap(vehicleDocs), work: toWorkMap(workDocs) };
}

/**
 * รถกับสถานะล่าสุดของ **ทุกคัน/ทุกคน** — สำหรับตารางรายชื่อที่ขอทั้งทะเบียนอยู่แล้ว
 *
 * ไม่ต้องรอรหัสจาก `master_driver` ก่อน จึงยิงพร้อมกันได้ทั้งสามคำสั่ง (แบบ `$in` ต้องรอกัน
 * เป็นทอด ≈ +90 ms) · ผลการจับคู่เท่ากับ `loadEnrichment()` ทุกแถว — คันที่ `code`/ทะเบียน
 * ตรงกับรหัสที่อ้างถูกดึงมาด้วยทั้งสองแบบ ส่วนคันที่ไม่มีใครอ้างก็แค่ค้างอยู่ใน Map เฉย ๆ
 * (ตรวจ 10 ต.ค. 2026: `code` `plate_no` `employee_code` ไม่มีค่าซ้ำ ลำดับการอ่านจึงไม่มีผล)
 */
async function loadLatestEnrichmentAll() {
  const [vehicleCol, workCol] = await Promise.all([etlCol("vehicles"), etlCol("workStatus")]);

  const [vehicleDocs, workDocs] = await Promise.all([
    vehicleCol.find({}, { projection: VEHICLE_FIELDS }).toArray(),
    workCol.find({}, { projection: WORK_LATEST_FIELDS }).toArray(),
  ]);

  return { vehicles: toVehicleMap(vehicleDocs), work: toWorkMap(workDocs) };
}

function toVehicleMap(docs: Record<string, unknown>[]): Map<string, DriverVehicle> {
  const vehicles = new Map<string, DriverVehicle>();
  for (const doc of docs) {
    const vehicle = toVehicle(doc);
    if (vehicle.code) vehicles.set(vehicle.code, vehicle);
    // ทะเบียนใส่ทีหลังและไม่ทับของเดิม — เลขรถเป็นคีย์ที่ตรงตัวกว่าเมื่อมีทั้งคู่
    if (vehicle.plateNo && !vehicles.has(vehicle.plateNo)) {
      vehicles.set(vehicle.plateNo, vehicle);
    }
  }
  return vehicles;
}

function toWorkMap(docs: Record<string, unknown>[]): Map<string, DriverWorkStatus> {
  return new Map(docs.map((doc) => [str(doc.employee_code), toWorkStatus(doc)]));
}

/* --------------------------------------------- บันทึกรายวันที่กรอกเอง */

/** เอกสารหนึ่งใบใน `trainee_daily` — หนึ่งคน หนึ่งวัน */
interface TraineeDailyDoc {
  _id: string;
  drivercode: string;
  dateISO: string;
  code: string;
  note: string;
  recordedAt: Date;
  recordedBy: string;
}

const dailyId = (drivercode: string, dateISO: string) => `${drivercode}_${dateISO}`;

/**
 * คอลเลกชัน `trainee_daily` — สถานะรายวันที่ฝ่ายบุคคลกรอกเองบนหน้าติดตามฝึกงาน
 * **อยู่ใน `hr_service`** · ทุกที่ที่แตะต้องผ่านตัวนี้
 *
 * แยกคอลเลกชันไม่ได้ยัดลงเอกสารใน `master_driver` เหมือน `statusOverride`
 * เพราะของนี้โตทุกวันต่อคน (คนละ 1 เอกสารต่อวัน) เอกสารเดียวจะบวมไม่รู้จบ
 * และตอนอ่านหน้าอื่นก็ต้องลากมาด้วยทั้งที่ไม่ได้ใช้
 *
 * `_id` = `<drivercode>_<YYYY-MM-DD>` — คน+วันเป็นคีย์ตรง ๆ กดซ้ำจึง `upsert`
 * ทับใบเดิมเสมอ ไม่มีทางเกิดสองใบของวันเดียวกัน โดยไม่ต้องทำ unique index เอง
 *
 * ขาอ่านหาแบบ `{ drivercode: { $in: [...] } }` แล้วคัดต่อด้วย `dateISO` — ดัชนี `driver_date`
 * ที่ครอบ query นี้ประกาศไว้ที่ `lib/db/registry.mjs` (ไม่มี = COLLSCAN ทุกครั้งที่เปิดหน้า
 * และคอลเลกชันนี้โตวันละหนึ่งใบต่อคนที่ยังฝึกอยู่)
 */
function traineeDaily(): Promise<Collection<TraineeDailyDoc>> {
  return hrCol<TraineeDailyDoc>("traineeDaily");
}

/**
 * ดึงวันที่กรอกเองของรหัสที่ขอมา แล้วทำเป็น `Map<drivercode, { iso: entry }>`
 *
 * ไม่จำกัดช่วงวันที่ — ตารางเลื่อนย้อนไปเดือนไหนก็ต้องเห็นของที่กรอกไว้เดือนนั้น
 * และคอลเลกชันนี้โตเท่ากับ “จำนวนวันที่มีคนกรอกจริง” ซึ่งน้อยกว่าทะเบียนมาก
 * (มีแต่คนที่กำลังฝึกอยู่ ไม่ใช่ทั้ง 2,600 คน) · ถ้าวันหนึ่งโตจนช้า ค่อยตัดเป็น
 * ช่วงเดือนแล้วส่งเดือนที่เปิดอยู่ลงมาเป็นพารามิเตอร์
 */
/**
 * รหัส พจส. ที่ฝ่ายบุคคลกรอกสถานะ `code` ไว้อย่างน้อยหนึ่งวันในเดือนนั้น
 * — หน้าติดตามฝึกงานใช้หาคนที่ฝึกอยู่แต่ ATMS ยังไม่ส่งสถานะมา (ดู `getTraineeBoard()`)
 */
export async function manualCodesInMonth(monthPrefix: string, code: string): Promise<string[]> {
  const codes = await (await traineeDaily()).distinct("drivercode", {
    dateISO: { $gte: `${monthPrefix}-00`, $lte: `${monthPrefix}-99` },
    code,
  });
  return codes.map((c) => str(c)).filter(Boolean);
}

export async function loadManualDays(
  driverCodes: string[],
  /** จำกัดเฉพาะเดือนที่กำลังดู (`YYYY-MM`) — ไม่ส่ง = ทุกวันที่มี */
  monthPrefix?: string,
): Promise<Map<string, Record<string, TraineeDailyEntry>>> {
  const byDriver = new Map<string, Record<string, TraineeDailyEntry>>();
  if (!driverCodes.length) return byDriver;

  const docs = await (await traineeDaily())
    .find({
      drivercode: { $in: driverCodes },
      /* `dateISO` เป็น `YYYY-MM-DD` เสมอ ช่วง `-00` ถึง `-99` จึงครอบเดือนนั้นพอดี
         เทียบเป็น string ตรง ๆ แบบนี้ index `driver_date` ใช้เป็นขอบเขตได้
         ต่างจาก `$regex` ที่ต้องลุ้นว่า planner จะแปลงให้หรือไม่ */
      ...(monthPrefix ? { dateISO: { $gte: `${monthPrefix}-00`, $lte: `${monthPrefix}-99` } } : {}),
    })
    .toArray();

  for (const doc of docs) {
    const drivercode = str(doc.drivercode);
    const dateISO = toIsoDate(doc.dateISO);
    const code = str(doc.code);
    if (!drivercode || !dateISO || !code) continue;

    const days = byDriver.get(drivercode) ?? {};
    days[dateISO] = {
      code,
      note: str(doc.note),
      recordedAt:
        doc.recordedAt instanceof Date ? doc.recordedAt.toISOString() : str(doc.recordedAt),
      recordedBy: str(doc.recordedBy),
    };
    byDriver.set(drivercode, days);
  }

  return byDriver;
}

/* ------------------------------------------------------ การพ้นสภาพ */

function toResignation(raw: unknown): DriverResignation | null {
  if (!raw || typeof raw !== "object") return null;

  const doc = raw as Record<string, unknown>;
  const dateISO = toIsoDate(doc.dateISO ?? doc.date);
  const reasonCode = str(doc.reasonCode);

  // ไม่มีวันที่หรือไม่มีเหตุผล = บันทึกไม่ครบ ถือว่าใช้ไม่ได้ ดีกว่าโชว์ครึ่ง ๆ
  if (!dateISO || !reasonCode) return null;

  const recordedAt = doc.recordedAt;
  return {
    dateISO,
    reasonCode,
    reasonLabel: str(doc.reasonLabel) || reasonCode,
    categoryLabel: str(doc.categoryLabel),
    exitType: isExitType(doc.exitType) ? doc.exitType : "",
    note: str(doc.note),
    recordedAt:
      recordedAt instanceof Date ? recordedAt.toISOString() : str(recordedAt),
    recordedBy: str(doc.recordedBy),
  };
}

/* ------------------------------------------------------ เอกสารในแฟ้ม */

/**
 * แกะรายการเอกสารจากเอกสารดิบ — ข้ามรายการที่ไม่มี `fileId` ไปเงียบ ๆ
 *
 * รายการที่ไม่มี id คือรายการที่เปิดไม่ได้ ซึ่งบนหน้าจอจะกลายเป็นชื่อเอกสาร
 * ที่กดแล้วไม่มีอะไรเกิดขึ้น — อ่านว่า “มีเอกสารใบนี้แล้ว” ทั้งที่ไม่มี
 *
 * `docType` ที่ไม่รู้จักไม่ได้ถูกทิ้ง — `groupDriverDocuments()` จะพาไปลงกอง
 * `เอกสารอื่น ๆ` ให้เอง ไฟล์จึงไม่หายไปจากหน้าจอเพราะป้ายถูกแก้ทีหลัง
 */
function toDocuments(raw: unknown): DriverDocument[] {
  if (!Array.isArray(raw)) return [];

  const documents: DriverDocument[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const doc = entry as Record<string, unknown>;

    const fileId = str(doc.fileId);
    if (!fileId) continue;

    const uploadedAt = doc.uploadedAt;
    documents.push({
      fileId,
      key: str(doc.key),
      name: str(doc.name) || "เอกสาร",
      type: str(doc.type) || "application/octet-stream",
      size: typeof doc.size === "number" && Number.isFinite(doc.size) ? doc.size : 0,
      docType: str(doc.docType),
      note: str(doc.note),
      uploadedAt:
        uploadedAt instanceof Date ? uploadedAt.toISOString() : str(uploadedAt),
      uploadedBy: str(doc.uploadedBy),
    });
  }

  return documents;
}

function toStatusOverride(raw: unknown): DriverStatus | null {
  const value = str(raw);
  return value === "active" || value === "resigned" ? value : null;
}

/* ------------------------------------------------------------- ประกอบร่าง */

/**
 * สถานะการจ้างมาจากทะเบียนของฝ่ายบุคคลอย่างเดียว — **ไม่เดาจาก `employee_work_status`**
 * (เดิมคนที่ไม่มีแถวสถานะงานถูกนับเป็น “ไม่มีข้อมูลการทำงาน” · เลิกแล้ว 19 ต.ค. 2569 เพราะทะเบียน
 * เป็นของเราเอง ยอดปฏิบัติงานต้องตรงกับที่ฝ่ายบุคคลบันทึก ไม่ใช่ตามว่า ATMS ส่งแถวมาหรือยัง)
 */
function toRecord(
  doc: MasterDriverDoc,
  today: string,
  vehicles: Map<string, DriverVehicle>,
  work: Map<string, DriverWorkStatus>,
  manual: Map<string, Record<string, TraineeDailyEntry>>,
): DriverRecord {
  const drivercode = str(doc.drivercode);
  const vehicleRef = str(doc.vehicleCode);
  const startDateISO = toIsoDate(doc.startDate);
  const licenseExpiryISO = toIsoDate(doc.licenseExpiryDate);
  const idCardExpiryISO = toIsoDate(doc.idCardExpiryDate);
  const ownerType = str(doc.ownerType);
  const branch = str(doc.branch);
  const statusOverride = toStatusOverride(doc.statusOverride);
  const vehicle = vehicleRef ? (vehicles.get(vehicleRef) ?? null) : null;

  return {
    drivercode,
    name: str(doc.driverName),
    phone: str(doc.phone),
    phoneAlt: str(doc.phoneAlt),
    photoUrl: str(doc.photoUrl),
    ownerType,
    ownerTypeKey: resolveOwnerTypeKey(ownerType),
    ownerTypeLabel: ownerTypeLabel(ownerType),
    branch,
    siteKey: siteOfBranch(branch),
    siteLabel: siteLabel(branch),
    vehicleRef,
    vehicle,
    /* ลูกค้า/แพล้นท์ตามทะเบียนก่อน — รถใน ETL เป็นแค่ค่าสำรองของคนที่ทะเบียนไม่ได้กรอก */
    customer: str(doc.customer) || (vehicle?.fleet ?? ""),
    plant: str(doc.plant) || (vehicle?.plant ?? ""),
    position: str(doc.position),
    startDateISO,
    tenureMonths: startDateISO ? monthsBetween(startDateISO, today) : null,
    tenureDays: startDateISO ? Math.max(0, daysBetween(startDateISO, today)) : null,
    licenseNo: str(doc.licenseNo),
    licenseType: str(doc.licenseType),
    licenseExpiryISO,
    licenseDaysLeft: licenseExpiryISO ? daysBetween(today, licenseExpiryISO) : null,
    nationalId: str(doc.nationalId),
    idCardExpiryISO,
    idCardDaysLeft: idCardExpiryISO ? daysBetween(today, idCardExpiryISO) : null,
    emergencyContactName: str(doc.emergencyContactName),
    emergencyContactRelation: str(doc.emergencyContactRelation),
    emergencyContactPhone: str(doc.emergencyContactPhone),
    bankAccountNo: str(doc.bankAccountNo),
    bankBranch: str(doc.bankBranch),
    profileEditedAt:
      doc.profileEditedAt instanceof Date ? doc.profileEditedAt.toISOString() : str(doc.profileEditedAt),
    profileEditedBy: str(doc.profileEditedBy),
    /* บันทึกการพ้นสภาพชนะ `active` ที่ค้างอยู่ในเอกสารเสมอ */
    active: statusOverride ? statusOverride === "active" : Boolean(doc.active),
    statusOverride,
    resignation: toResignation(doc.resignation),
    mediaPurgedAt:
      doc.mediaPurgedAt instanceof Date ? doc.mediaPurgedAt.toISOString() : str(doc.mediaPurgedAt),
    documents: toDocuments(doc.documents),
    work: work.get(drivercode) ?? null,
    manualDays: manual.get(drivercode) ?? {},
  };
}

/** เวลาที่ ETL mirror `main_driver` ล่าสุด = ค่ามากที่สุดในทะเบียน */
function latestSyncedAt(docs: MasterDriverDoc[]): string | null {
  let latest = 0;

  for (const doc of docs) {
    const value = doc.syncedAt;
    const time = value instanceof Date ? value.getTime() : Date.parse(str(value));
    if (Number.isFinite(time) && time > latest) latest = time;
  }

  return latest ? new Date(latest).toISOString() : null;
}

/* ------------------------------------------------------------------ API */

/**
 * ทะเบียนทั้งก้อน **รวมปฏิทินรายวันของทุกคน** (~8 MB) — ไม่มีหน้าไหนใช้แล้ว
 * ตารางรายชื่อใช้ `getDriverList()` · ศูนย์เอกสารใช้ `getDocExpiries()` · ติดตามฝึกงานใช้
 * `getTraineeBoard()` · **หน้าใหม่ให้ทำตัวอ่านที่ขอเฉพาะของที่วาด อย่ากลับมาใช้ตัวนี้**
 */
export async function getDriverRegistry(): Promise<DriverRegistry> {
  const docs = await readMasterDrivers("all");

  const today = todayInBangkok();
  const vehicleRefs = uniq(docs.map((d) => str(d.vehicleCode)));
  const driverCodes = uniq(docs.map((d) => str(d.drivercode)));

  /*
   * ยิงพร้อมกัน — สองชุดนี้อยู่คนละ db และไม่ได้ขึ้นกัน การรอทีละอันคือการ
   * ต่อเวลาโหลดหน้าฟรี ๆ · `allSettled` เพราะ **แต่ละชุดพังแยกกันได้**
   * ข้อมูลเสริมพังไม่ควรทำให้ทั้งทะเบียนหาย และของที่กรอกเองพังก็ไม่ควรทำให้
   * ข้อมูลเสริมหายตามไปด้วย — ขึ้นรายชื่อไปก่อนแล้วบอกว่าส่วนไหนขาด
   */
  const [enriched, own] = await Promise.allSettled([
    loadEnrichment(vehicleRefs, driverCodes),
    loadManualDays(driverCodes),
  ]);

  const enrichmentFailed = enriched.status === "rejected";
  const vehicles = enriched.status === "fulfilled" ? enriched.value.vehicles : new Map();
  const work = enriched.status === "fulfilled" ? enriched.value.work : new Map();

  /* อ่านไม่ได้ไม่ล้มทั้งหน้า แต่ต้องบอกให้รู้ — หน้าติดตามฝึกงานจะปิดการกรอกไว้
     ไม่งั้นจอขึ้นว่า “ยังไม่มีใครกรอก” ทั้งที่ของเดิมมีอยู่ แล้วคนกรอกทับของจริง */
  const manualFailed = own.status === "rejected";
  const manual = own.status === "fulfilled" ? own.value : new Map();

  return {
    drivers: docs
      .filter((doc) => str(doc.drivercode))
      .map((doc) => toRecord(doc, today, vehicles, work, manual)),
    syncedAt: latestSyncedAt(docs),
    enrichmentFailed,
    manualFailed,
  };
}

/** อ่านทะเบียน (`./master.ts`) — ห่อ error เป็นข้อความเดียวกับ `getDriverRegistry()` */
async function readMasterDrivers(
  fields: readonly DriverField[] | "all",
): Promise<MasterDriverDoc[]> {
  try {
    return await readDrivers<MasterDriverDoc>(fields);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`อ่านทะเบียนประวัติจากฐานข้อมูลไม่สำเร็จ — ${reason}`);
  }
}

const uniq = (values: string[]) => [...new Set(values.filter(Boolean))];

/**
 * ฟิลด์ที่ `toRecord()` / `latestSyncedAt()` อ่าน **ยกเว้น `documents`**
 * **เพิ่มฟิลด์ที่ `toRecord()` อ่านเมื่อไหร่ ต้องเพิ่มที่นี่ด้วย** ไม่งั้นตารางจะได้ค่าว่างเงียบ ๆ
 * — ยกเว้นเลขบัตรประชาชน/เลขใบขับขี่ ที่ตั้งใจไม่ขอ: ตารางไม่ได้แสดง และรายชื่อทั้งก้อนส่งลง browser
 * (ดูได้ทีละคนที่หน้าประวัติ)
 */
const LIST_FIELDS: DriverField[] = [
  "drivercode",
  "driverName",
  "photoUrl",
  "statusOverride",
  "idCardExpiryDate",
  "resignation",
  "mediaPurgedAt",
  "ownerType",
  "branch",
  "vehicleCode",
  "startDate",
  "licenseExpiryDate",
  "phone",
  "customer",
  "plant",
  "position",
  "active",
  "syncedAt",
];

/**
 * ทะเบียนสำหรับ **ตารางรายชื่อ** `/recruitment/admin/drivers` — ทุกคน แต่ไม่มีปฏิทิน
 *
 * ตารางใช้แค่ `work.latestStatus` · เดิมหน้านั้นเรียก `getDriverRegistry()` แล้วค่อยตัด
 * `days`/`months`/`manualDays`/`documents` ทิ้งก่อนส่งลง client — ตัดหลังอ่านไม่ช่วยฝั่ง
 * เซิร์ฟเวอร์เลย ยังลาก `months` ทุกคน (4.4 MB) ข้ามเน็ตมาแล้วแกะทิ้งทุกครั้งที่เปิดหน้า
 * (วัดได้ 2.1–2.5 วินาที · 10 ต.ค. 2026) · ตัวนี้ไม่ขอของพวกนั้นตั้งแต่ใน query
 * แต่คืนรูป `DriverRegistry` เดิม — `work.days` `{}` · `manualDays` `{}` · `documents` `[]`
 * ตรงกับที่ตัดเองเดิมทุกช่อง หน้าจอจึงเหมือนเดิม
 *
 * **ไม่มี `manualDays` → `manualFailed` เป็น `false` เสมอ** — ตารางนี้ไม่มีช่องกรอกรายวัน
 * ห้ามเอาไปใช้กับหน้าที่ให้กรอก (หน้าติดตามฝึกงานมี `getTraineeBoard()` ของตัวเอง)
 */
export async function getDriverList(): Promise<DriverRegistry> {
  /* เริ่มอ่าน ETL ก่อนแล้วค่อยรอ — `.catch` ติดไว้ตั้งแต่ตอนสร้าง ถ้ารายชื่อหลักพังแล้วโยนออกไป
     promise นี้จะไม่กลายเป็น unhandled rejection · ข้อมูลเสริมพังไม่ล้มทั้งทะเบียน */
  const enrichment = loadLatestEnrichmentAll().catch(() => null);
  const docs = await readMasterDrivers(LIST_FIELDS);
  const enriched = await enrichment;

  const today = todayInBangkok();
  const enrichmentFailed = !enriched;
  const vehicles = enriched?.vehicles ?? new Map<string, DriverVehicle>();
  const work = enriched?.work ?? new Map<string, DriverWorkStatus>();

  return {
    drivers: docs
      .filter((doc) => str(doc.drivercode))
      .map((doc) => toRecord(doc, today, vehicles, work, new Map())),
    syncedAt: latestSyncedAt(docs),
    enrichmentFailed,
    manualFailed: false,
  };
}

/** ฟิลด์ที่ `getDriverPicks()` ใช้ — ไม่มีเบอร์โทร/เลขบัตร เพราะรายชื่อทั้งก้อนส่งลง browser */
const PICK_FIELDS: DriverField[] = [
  "drivercode",
  "driverName",
  "photoUrl",
  "plant",
  "customer",
  "position",
  "active",
  "statusOverride",
];

/**
 * รายชื่อ พจส. สำหรับช่อง “ผู้เกี่ยวข้อง” ของบันทึกเคส (`GET /api/drivers/picker`)
 *
 * อ่านแค่ชื่อ/รหัส/แพล้นท์ ไม่แตะ ETL เลย (~1,000 แถว เบามาก) · **คนพ้นสภาพยังอยู่ในรายการ**
 * — เคสวินัยมักเกิดกับคนที่ออกไปแล้ว · เรียงคนที่ยังปฏิบัติงานขึ้นก่อน แล้วตามรหัส
 */
export async function getDriverPicks(): Promise<DriverPick[]> {
  const docs = await readMasterDrivers(PICK_FIELDS);

  return docs
    .map((doc) => {
      const override = toStatusOverride(doc.statusOverride);
      return {
        code: str(doc.drivercode),
        name: str(doc.driverName),
        photoUrl: str(doc.photoUrl),
        plant: str(doc.plant),
        customer: str(doc.customer),
        position: str(doc.position),
        active: override ? override === "active" : Boolean(doc.active),
      };
    })
    .filter((p) => p.code && p.name)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
}

/** ฟิลด์ที่ `collectDocExpiries()` ใช้ (ผ่าน `toRecord()`) */
const EXPIRY_FIELDS: DriverField[] = [
  "drivercode",
  "driverName",
  "phone",
  "branch",
  "vehicleCode",
  "licenseExpiryDate",
  "idCardExpiryDate",
  "active",
  "statusOverride",
];

/**
 * วันหมดอายุเอกสารของ พจส. ที่ยังปฏิบัติงาน — ข้อมูลของศูนย์เอกสาร `/recruitment/admin/documents`
 *
 * หน้านั้นต้องการแค่ชื่อ เบอร์ สาขา ทะเบียนรถ กับสองวันที่ · เดิมอ่านทะเบียนทั้งก้อน
 * (`getDriverRegistry()` 8 MB รวมปฏิทินทุกคน) แล้วทิ้งเกือบหมด · ตัวนี้:
 * - คัดเฉพาะคนที่ **อาจ** ยังทำงาน (`active: true` หรือมี `statusOverride`) ก่อนอ่านรถ
 *   — เป็นชุดที่กว้างกว่าจริงโดยตั้งใจ ตัวตัดสินจริงยังเป็น `driver.active` ใน
 *   `collectDocExpiries()` (ค่าที่ `statusOverride` ทับแล้ว) **ห้ามเปลี่ยนไปเชื่อ `active` ของ ETL**
 * - ไม่อ่านสถานะงาน/ของที่กรอกเองเลย · รถอ่านเฉพาะของคนที่เหลือ
 *
 * คืน `DocExpiry[]` ไม่ใช่ `DriverRecord[]` — เรกคอร์ดที่ประกอบจาก projection นี้มีช่องว่าง
 * (รูป วันเริ่มงาน ฯลฯ) ถ้าหลุดออกไปจะอ่านเหมือน “ไม่มีข้อมูล” ทั้งที่แค่ไม่ได้ขอมา
 */
export async function getDocExpiries(): Promise<DocExpiry[]> {
  const docs = (await readMasterDrivers(EXPIRY_FIELDS)).filter(
    (doc) => doc.active === true || doc.statusOverride !== undefined,
  );
  const today = todayInBangkok();

  /* พังแค่คอลัมน์ทะเบียนรถว่าง — ปฏิทินวันหมดอายุยังใช้ได้ครบ · ไม่ต้องอ่านสถานะงาน */
  const enriched = await loadEnrichment(uniq(docs.map((d) => str(d.vehicleCode))), [], "none").catch(
    () => null,
  );
  const vehicles = enriched?.vehicles ?? new Map<string, DriverVehicle>();
  const work = enriched?.work ?? new Map<string, DriverWorkStatus>();

  return collectDocExpiries(
    docs
      .filter((doc) => str(doc.drivercode))
      .map((doc) => toRecord(doc, today, vehicles, work, new Map())),
  );
}

/** ประวัติรายคน — `code` คือ `drivercode` ตรง ๆ · คืน `null` ถ้าไม่มีรหัสนี้ในทะเบียน */
export async function getDriver(code: string): Promise<DriverRecord | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  let doc: MasterDriverDoc | null;

  try {
    doc = await readDriver<MasterDriverDoc>(drivercode);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`อ่านประวัติคนขับจากฐานข้อมูลไม่สำเร็จ — ${reason}`);
  }

  if (!doc) return null;

  const vehicleRef = str(doc.vehicleCode);
  let vehicles = new Map<string, DriverVehicle>();
  let work = new Map<string, DriverWorkStatus>();
  let manual = new Map<string, Record<string, TraineeDailyEntry>>();

  try {
    ({ vehicles, work } = await loadEnrichment(vehicleRef ? [vehicleRef] : [], [drivercode]));
  } catch {
    /* หน้ารายคนยังอ่านได้โดยไม่มีข้อมูลรถ — กล่องรถจะบอกเองว่าไม่มีข้อมูล */
  }

  try {
    manual = await loadManualDays([drivercode]);
  } catch {
    /* เหมือนกัน — ไม่มีของที่กรอกเองก็ยังอ่านประวัติได้ */
  }

  return toRecord(doc, todayInBangkok(), vehicles, work, manual);
}

/** ประวัติรายคนที่พร้อมส่งออกไปนอกเซิร์ฟเวอร์ — ดู `getDriverProfile()` */
export type DriverProfileRecord = DriverRecord & {
  /** `true` = คนนี้พ้นสภาพแล้ว ช่องข้อมูลส่วนบุคคลถูกล้างเป็นค่าว่างตั้งแต่ฝั่งเซิร์ฟเวอร์ */
  personalHidden: boolean;
};

/**
 * ประวัติ พจส. หนึ่งคน **ในรูปที่ส่งออกได้** — ตัวเดียวที่ทั้งหน้า
 * `/recruitment/admin/drivers/{code}` และ `GET /api/drivers/{drivercode}` ใช้
 * สองทางจึงได้ข้อมูลชุดเดียวกันเสมอ
 *
 * **พ้นสภาพแล้ว = ล้างข้อมูลส่วนบุคคลทิ้งก่อนออกจากเซิร์ฟเวอร์** (เบอร์โทร ·
 * เลขที่/วันหมดอายุใบขับขี่ · เลข/วันหมดอายุบัตรประชาชน · ผู้ติดต่อฉุกเฉิน · บัญชีรับเงิน) ตรงกับที่ `DriverProfile` ซ่อน —
 * เดิมซ่อนแค่ตอนวาดจอ ถ้า API คืน `getDriver()` ตรง ๆ ของที่ตั้งใจซ่อนจะหลุดออกไป
 * ข้อมูลในฐานข้อมูลยังอยู่ครบ · เพิ่มฟิลด์ส่วนบุคคลใหม่เมื่อไหร่ต้องล้างที่นี่ด้วย
 */
export async function getDriverProfile(code: string): Promise<DriverProfileRecord | null> {
  const driver = await getDriver(code);
  return driver ? withPersonalRule(driver) : null;
}

/** กติกาข้อมูลส่วนบุคคลของ `getDriverProfile()` — ใช้ร่วมกับไฟล์ Excel ทะเบียนเต็ม (`getDriversForExport()`) */
function withPersonalRule(driver: DriverRecord): DriverProfileRecord {
  if (driver.active) return { ...driver, personalHidden: false };
  return {
    ...driver,
    phone: "",
    phoneAlt: "",
    licenseNo: "",
    licenseType: "",
    licenseExpiryISO: "",
    licenseDaysLeft: null,
    nationalId: "",
    idCardExpiryISO: "",
    idCardDaysLeft: null,
    emergencyContactName: "",
    emergencyContactRelation: "",
    emergencyContactPhone: "",
    bankAccountNo: "",
    bankBranch: "",
    personalHidden: true,
  };
}

/** ฟิลด์ทะเบียนทั้งหมด **ยกเว้น `documents`** (แฟ้มเอกสาร ใหญ่ และไม่ใช่ข้อมูลทะเบียน) */
const EXPORT_FIELDS: DriverField[] = [...PROFILE_FIELDS, ...HR_FIELDS.filter((f) => f !== "documents"), "registry"];

/** แถวของชีต “ทะเบียนเต็ม” — ประวัติรายคน + ที่มาของแถว (นำเข้า Excel / รับจากหน้าติดตามพนักงานใหม่) */
export type DriverExportRow = DriverProfileRecord & { source: string; sourceAt: string };

/**
 * ทะเบียนเต็มของรหัสที่ขอ — สำหรับชีตที่สองของไฟล์ Excel หน้าทะเบียน (`POST /api/drivers/export`)
 *
 * ตารางรายชื่อไม่ได้ขอเลขบัตร/ใบขับขี่/บัญชีลง browser (ดู `LIST_FIELDS`) · ตัวนี้อ่านครบ
 * แต่ **ผ่านกติกาเดียวกับหน้าประวัติ** — คนที่พ้นสภาพแล้วถูกล้างข้อมูลส่วนบุคคลก่อนออกจากเซิร์ฟเวอร์
 * · คืนตามลำดับของ `codes` (ลำดับที่ตารางเรียงอยู่)
 */
export async function getDriversForExport(codes: readonly string[]): Promise<DriverExportRow[]> {
  const wanted = uniq(codes.map((c) => c.trim()));
  if (!wanted.length) return [];

  let docs: (MasterDriverDoc & { registry?: unknown })[];
  try {
    docs = await readDrivers<MasterDriverDoc & { registry?: unknown }>(EXPORT_FIELDS, { codes: wanted });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`อ่านทะเบียนประวัติจากฐานข้อมูลไม่สำเร็จ — ${reason}`);
  }

  const enriched = await loadEnrichment(uniq(docs.map((d) => str(d.vehicleCode))), wanted, "latest").catch(
    () => null,
  );
  const vehicles = enriched?.vehicles ?? new Map<string, DriverVehicle>();
  const work = enriched?.work ?? new Map<string, DriverWorkStatus>();
  const today = todayInBangkok();

  const byCode = new Map(
    docs.map((doc) => {
      const reg = (doc.registry ?? {}) as Record<string, unknown>;
      const at = reg.importedAt ?? reg.at;
      const row: DriverExportRow = {
        ...withPersonalRule(toRecord(doc, today, vehicles, work, new Map())),
        source:
          reg.source === "onboarding"
            ? `ติดตามพนักงานใหม่${reg.requisitionCode ? ` ${str(reg.requisitionCode)}` : ""}`
            : reg.sheet
              ? `นำเข้า Excel · ${str(reg.sheet)}${reg.row ? ` แถว ${String(reg.row)}` : ""}`
              : str(reg.source),
        sourceAt: at instanceof Date ? at.toISOString() : str(at),
      };
      return [row.drivercode, row] as const;
    }),
  );
  return wanted.map((c) => byCode.get(c)).filter((r): r is DriverExportRow => Boolean(r));
}

export interface DriverStatusInput {
  status: DriverStatus;
  /** บังคับเมื่อ `status` เป็น `resigned` — `YYYY-MM-DD` */
  resignDate?: string;
  reasonCode?: string;
  /** Vol / Inv / Disap — ไม่ส่งมา = ใช้ค่าตั้งต้นของรหัสที่เลือก */
  exitType?: string;
  note?: string;
}

/**
 * บันทึกสถานะการจ้างที่ฝ่ายบุคคลกดเอง — คืนเรกคอร์ดที่ **อ่านกลับมาจากฐานข้อมูลจริง**
 *
 * เขียน `active` คู่กับ `statusOverride` + `resignation` เสมอ — ตัวอ่านอื่นที่ดูแค่ `active`
 * (รายชื่อครูฝึก · รถกับคนขับ) จึงเห็นสถานะเดียวกับหน้าทะเบียน
 *
 * กลับเป็น “ปฏิบัติงาน” = ล้างทั้ง `statusOverride` และ `resignation` ทิ้ง เหมือนไม่เคยมีการบันทึก
 * — ฝ่ายบุคคลใช้ปุ่มนี้ตอน**กดผิด** จึงไม่ควรเก็บซากการพ้นสภาพที่ยกเลิกไปแล้วไว้ให้คนอ่านทีหลังเข้าใจผิด
 */
export async function setDriverStatus(
  code: string,
  input: DriverStatusInput,
  actor: string,
): Promise<DriverRecord | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  let update: Record<string, unknown>;

  if (input.status === "active") {
    /* `mediaPurgedAt` ล้างด้วย — กลับมาทำงานแล้วพ้นสภาพอีกรอบ ต้องนับ 1 เดือนใหม่และลบได้อีก */
    update = {
      $set: { active: true },
      $unset: { statusOverride: "", resignation: "", mediaPurgedAt: "" },
    };
  } else {
    const dateISO = toIsoDate(input.resignDate);
    if (!dateISO) throw new DriverRegistryError("ต้องระบุวันที่พ้นสภาพ");
    if (dateISO > todayInBangkok())
      throw new DriverRegistryError("วันที่พ้นสภาพเป็นวันในอนาคตไม่ได้");

    /* รหัสต้องมีอยู่จริงใน Reason Code Master และยังเปิดใช้ — ยกเว้นรหัสเดิมของ
       ระเบียนนี้ที่ถูกปิดใช้ไปทีหลัง (กำลังแก้วันที่/หมายเหตุของข้อมูลเก่า) */
    const drivers = await hrCol<MasterDriverDoc>("drivers");
    const current = await drivers.findOne({ drivercode }, { projection: { resignation: 1 } });
    const held = str((current?.resignation as { reasonCode?: unknown } | undefined)?.reasonCode);
    const reason = await pickResignReason(input.reasonCode, held);
    if (!reason) throw new DriverRegistryError("ต้องเลือกเหตุผลการพ้นสภาพจากรหัสที่เปิดใช้อยู่");
    if (input.exitType && !isExitType(input.exitType))
      throw new DriverRegistryError("ประเภทการออกไม่ถูกต้อง");

    update = {
      $set: {
        active: false,
        statusOverride: "resigned",
        resignation: {
          dateISO,
          reasonCode: reason.code,
          reasonLabel: reason.label,
          categoryLabel: reason.categoryLabel,
          exitType: isExitType(input.exitType) ? input.exitType : reason.exitType,
          note: (input.note ?? "").trim(),
          recordedAt: new Date(),
          recordedBy: actor,
        },
      },
    };
  }

  try {
    if (!(await driverExists(drivercode))) return null;
    const drivers = await hrCol<MasterDriverDoc>("drivers");
    await drivers.updateOne({ drivercode }, update);
  } catch (err) {
    if (err instanceof DriverRegistryError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกสถานะลงทะเบียนประวัติไม่สำเร็จ — ${reason}`);
  }

  // อ่านกลับมาทั้งเรกคอร์ด — หน้าจอจะได้แสดงของที่บันทึกจริง ไม่ใช่ของที่ส่งไป
  return getDriver(drivercode);
}

/* -------------------------------------------- แก้ประวัติบนหน้าทะเบียน */

/**
 * แก้ประวัติ — `patch` คือ `{ ชื่อฟิลด์ใน master_driver: ค่าที่กรอก }` เฉพาะช่องที่เปลี่ยน
 * (รายการช่องที่แก้ได้อยู่ที่ `DRIVER_EDIT_FIELDS`) · คืน `null` เมื่อไม่มีรหัสนี้ในทะเบียน
 *
 * - ช่องที่ไม่อยู่ในรายการ / ค่าที่ใช้ไม่ได้ → `DriverRegistryError` ทั้งก้อน (ไม่บันทึกครึ่ง ๆ)
 * - **คนพ้นสภาพแล้วแก้ข้อมูลส่วนบุคคลไม่ได้** — หน้าจอก็ไม่ได้แสดง (`getDriverProfile()`)
 * - ช่องที่แก้ถูกจดลง `editedFields` → ตัวนำเข้า Excel รอบหน้า **ไม่ทับช่องนั้นอีก** (ค่าบนเว็บชนะไฟล์)
 * - ทุกครั้งลง `profileEdits` (ค่าเดิม → ค่าใหม่ · ใคร · เมื่อไหร่ · เก็บ 100 ครั้งล่าสุด) ตรวจย้อนได้
 */
export async function updateDriverProfile(
  code: string,
  patch: Record<string, unknown>,
  actor: string,
): Promise<DriverRecord | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  const current = await getDriver(drivercode);
  if (!current) return null;

  const $set: Record<string, string> = {};
  const changes: Record<string, { from: string; to: string }> = {};

  for (const [key, raw] of Object.entries(patch)) {
    const field = DRIVER_EDIT_FIELDS.find((f) => f.key === key);
    if (!field) throw new DriverRegistryError(`ช่อง “${key}” แก้จากหน้านี้ไม่ได้`);
    if (typeof raw !== "string") throw new DriverRegistryError(`${field.label} ต้องเป็นข้อความ`);
    if (field.personal && !current.active)
      throw new DriverRegistryError(`${field.label} เป็นข้อมูลส่วนบุคคลของคนที่พ้นสภาพแล้ว — แก้ไม่ได้`);

    const out = normalizeDriverEdit(field, raw);
    if ("error" in out) throw new DriverRegistryError(`${field.label}: ${out.error}`);

    const before = String(current[field.from] ?? "");
    if (out.value === before) continue;
    $set[key] = out.value;
    changes[key] = { from: before, to: out.value };
  }

  const keys = Object.keys($set);
  if (!keys.length) return current;

  const now = new Date();
  /* วันหมดอายุบัตร: ตัวนำเข้า Excel/วางจาก Excel ดูผู้กรอกที่ `idCardExpiryUpdatedBy` ไม่ใช่ `editedFields` */
  const idCardStamp =
    "idCardExpiryDate" in $set ? { idCardExpiryUpdatedAt: now, idCardExpiryUpdatedBy: actor } : {};
  try {
    const drivers = await hrCol<MasterDriverDoc>("drivers");
    await drivers.updateOne({ ...IN_REGISTRY, drivercode }, {
      $set: { ...$set, ...idCardStamp, profileEditedAt: now, profileEditedBy: actor },
      $addToSet: { editedFields: { $each: keys } },
      $push: { profileEdits: { $each: [{ at: now, by: actor, changes }], $slice: -100 } },
    } as Record<string, unknown>);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกประวัติไม่สำเร็จ — ${reason}`);
  }

  return getDriver(drivercode);
}

/* -------------------------------------------- รับคนใหม่เข้าทะเบียน (หน้าติดตามพนักงานใหม่) */

/** ข้อมูลตั้งต้นของคนใหม่ — `requisitions/registry-sync.ts` ประกอบจากคำขอสรรหา + รหัสที่ ATMS ออกให้ */
export interface EnrollInput {
  drivercode: string;
  driverName: string;
  phone: string;
  ownerType: string;
  branch: string;
  vehicleCode: string;
  /** `YYYY-MM-DD` */
  startDate: string;
  licenseExpiryDate: string;
  /** จากใบสมัครที่ผูกไว้ (ข้อมูลที่อ่านจากรูปบัตร/ใบขับขี่) — ว่างได้ */
  licenseNo: string;
  licenseType: string;
  nationalId: string;
  idCardExpiryDate: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  bankAccountNo: string;
  customer: string;
  plant: string;
  position: string;
  requisitionId: string;
  requisitionCode: string;
}

/**
 * รับคนใหม่เข้าทะเบียน — คืน `true` เมื่อเพิ่งรับเข้า · `false` = อยู่ในทะเบียนอยู่แล้ว (ไม่แตะอะไรเลย)
 *
 * **ไม่ทับคนที่อยู่ในทะเบียนแล้ว** (เช่นคนที่นำเข้าจาก Excel) — ประวัติในทะเบียนชนะค่าจากคำขอเสมอ
 * · แถวเก่าที่ sync จาก ETL เดิม (ไม่มี `registry`) ถูกเขียนทับด้วยข้อมูลชุดนี้ ฟิลด์ของฝ่ายบุคคลยังอยู่
 */
export async function enrollDriver(input: EnrollInput, actor: string): Promise<boolean> {
  const drivercode = input.drivercode.trim();
  if (!drivercode) return false;
  if (await driverExists(drivercode)) return false;

  const { requisitionId, requisitionCode, ...profile } = input;
  const now = new Date();
  const drivers = await hrCol<MasterDriverDoc>("drivers");
  await drivers.updateOne(
    { drivercode },
    {
      $set: {
        ...profile,
        drivercode,
        active: true,
        syncedAt: now,
        registry: { source: "onboarding", requisitionId, requisitionCode, at: now, by: actor },
      },
      $unset: { statusOverride: "", resignation: "" },
    },
    { upsert: true },
  );
  return true;
}

/**
 * บันทึกพ้นสภาพตามผลสิ้นสุดบนหน้าติดตามพนักงานใหม่ (ลาออก · ปลด · ยกเลิกฝึกงาน …)
 *
 * **เฉพาะคนที่ยังไม่มีบันทึกสถานะ** — ถ้าฝ่ายบุคคลกดพ้นสภาพบนหน้าทะเบียนไว้แล้ว ของเดิมชนะ
 * · รหัสเหตุผลเป็น `ONB` (ไม่ใช่รหัสใน Reason Code Master) แก้เป็นรหัสจริงได้จากหน้าทะเบียน
 */
export async function resignFromOnboarding(
  code: string,
  exit: { dateISO: string; label: string; note: string },
  actor: string,
): Promise<boolean> {
  const drivercode = code.trim();
  const dateISO = toIsoDate(exit.dateISO);
  if (!drivercode || !dateISO) return false;

  const drivers = await hrCol<MasterDriverDoc>("drivers");
  const res = await drivers.updateOne(
    { ...IN_REGISTRY, drivercode, statusOverride: { $exists: false } },
    {
      $set: {
        active: false,
        statusOverride: "resigned",
        resignation: {
          dateISO,
          reasonCode: "ONB",
          reasonLabel: exit.label || "พ้นสภาพระหว่าง Onboarding",
          categoryLabel: "",
          exitType: "",
          note: exit.note,
          recordedAt: new Date(),
          recordedBy: actor,
        },
      },
    },
  );
  return res.modifiedCount > 0;
}

export interface TraineeDailyInput {
  /** `YYYY-MM-DD` (ค.ศ.) */
  dateISO: string;
  /** ตัวย่อสถานะ · ค่าว่าง = ลบบันทึกของวันนั้นทิ้ง (กรอกผิดคน/ผิดวัน) */
  code: string;
  note?: string;
}

/**
 * บันทึกสถานะรายวันที่ฝ่ายบุคคลกรอกเอง — คืน entry ที่ได้ หรือ `null` เมื่อเป็นการลบ
 *
 * เขียนลง `hr_service.trainee_daily` เท่านั้น — **ไม่แตะ `Boom_ETL` ทุกกรณี**
 * สิ่งที่กรอกที่นี่คือ *บันทึกของฝ่ายบุคคล* ไม่ใช่การแก้ข้อมูล ATMS · เมื่อ ATMS
 * ส่งรหัสของวันเดียวกันมาทีหลัง หน้าจอจะโชว์ของ ATMS เป็นหลัก (ตัวนั้นผูกกับค่าแรง)
 * แต่ **ไม่ลบของที่กรอกไว้** เพื่อให้ตามได้ว่าตอนนั้นหน้างานบันทึกว่าอะไร
 *
 * กติกาวันที่บังคับที่นี่ ไม่ใช่แค่ซ่อนปุ่มบนหน้าจอ — เป็นเส้นที่ยิงตรงได้
 */
export async function setTraineeDaily(
  code: string,
  input: TraineeDailyInput,
  actor: string,
): Promise<TraineeDailyEntry | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  const dateISO = toIsoDate(input.dateISO);
  if (!dateISO) throw new DriverRegistryError("วันที่ไม่ถูกต้อง");

  /* ย้อนหลังได้ไม่จำกัด — ตารางนี้ถูกใช้ตามเก็บของที่ค้างมาหลายเดือนด้วย
     ห้ามเฉพาะอนาคต เพราะวันที่ยังไม่เกิดขึ้นไม่มีใครรู้ว่าเกิดอะไร */
  if (dateISO > todayInBangkok()) throw new DriverRegistryError("บันทึกล่วงหน้าไม่ได้");

  const status = input.code.trim();
  if (status && !isWorkStatusCode(status)) {
    throw new DriverRegistryError(`ไม่รู้จักรหัสสถานะ “${status}”`);
  }

  const note = (input.note ?? "").trim();

  try {
    // ต้องมีรหัสนี้ในทะเบียนจริง — ไม่งั้นพิมพ์รหัสอะไรมาก็สร้างแถวผีได้
    if (!(await driverExists(drivercode))) return null;

    const collection = await traineeDaily();
    const _id = dailyId(drivercode, dateISO);

    if (!status) {
      await collection.deleteOne({ _id });
      return null;
    }

    const entry: TraineeDailyDoc = {
      _id,
      drivercode,
      dateISO,
      code: status,
      note,
      recordedAt: new Date(),
      recordedBy: actor,
    };

    await collection.replaceOne({ _id }, entry, { upsert: true });

    return {
      code: entry.code,
      note: entry.note,
      recordedAt: entry.recordedAt.toISOString(),
      recordedBy: entry.recordedBy,
    };
  } catch (err) {
    if (err instanceof DriverRegistryError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกสถานะรายวันไม่สำเร็จ — ${reason}`);
  }
}

/**
 * บันทึก URL รูปประจำตัวของคนขับ — คืนค่าที่ **อ่านกลับมาจากฐานข้อมูลจริง**
 *
 * เขียนลง `hr_service.master_driver` เท่านั้น **ไม่แตะ `Boom_ETL` เด็ดขาด** ·
 * ใช้ `$set` เฉพาะสามฟิลด์นี้ ไม่ใช่ `replaceOne` — ฟิลด์อื่นของ hr-service ในแถวเดียวกันต้องอยู่ครบ
 *
 * อ่านกลับมาแทนที่จะคืนค่าที่เพิ่งส่งไป — หน้าจอต้องแสดงของที่บันทึกจริง
 */
export async function setDriverPhoto(
  code: string,
  photoUrl: string,
  actor: string,
): Promise<string | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  try {
    if (!(await driverExists(drivercode))) return null;
    const collection = await hrCol<MasterDriverDoc>("drivers");

    /* upsert — คนที่เพิ่งมาจาก ETL ยังไม่มีแถว · `before` เป็น `null` ได้ (ยังไม่เคยมีรูป) */
    const before = await collection.findOneAndUpdate(
      { drivercode },
      { $set: { photoUrl, photoUpdatedAt: new Date(), photoUpdatedBy: actor } },
      { returnDocument: "before", upsert: true },
    );

    /* รูปเก่าบน S3 ไม่มีใครอ้างถึงแล้ว — ลบทิ้ง (โฟลเดอร์ avatar เหลือรูปเดียวเสมอ)
       ลบไม่ติดไม่ใช่เหตุให้บอกว่าเปลี่ยนรูปไม่สำเร็จ ไฟล์ private ที่ค้างเปิดไม่ได้อยู่แล้ว */
    const oldKey = mediaKeyOf(str(before?.photoUrl));
    if (oldKey && str(before?.photoUrl) !== photoUrl) {
      await deleteMedia(oldKey).catch((err: unknown) => {
        console.warn("[registry] ลบรูปประจำตัวเดิมบน S3 ไม่สำเร็จ —", oldKey, err);
      });
    }

    const after = await collection.findOne({ drivercode });
    return str(after?.photoUrl);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกรูปลงทะเบียนประวัติไม่สำเร็จ — ${reason}`);
  }
}

/* --------------------------------------------- วันหมดอายุบัตรประชาชน */

/**
 * บันทึกวันหมดอายุบัตรประชาชน — ค่าว่าง = ลบวันที่ที่กรอกไว้ทิ้ง (กรอกผิดคน/ผิดใบ)
 *
 * **มีแค่บัตรประชาชน ไม่มีใบขับขี่** โดยตั้งใจ — `licenseExpiryDate` อ่านสดจาก ETL
 * (`./master.ts` ทับค่าที่นี่ทุกครั้ง) เขียนไว้ก็ไม่มีใครเห็น
 * ส่วนบัตรประชาชนไม่มีใน `Boom_ETL.main_driver` เลย จึงเป็นฟิลด์ของ hr-service
 * เต็มตัวเหมือน `photoUrl` / `statusOverride`
 *
 * ไม่ห้ามวันในอดีต — บัตรที่หมดอายุไปแล้วคือสิ่งที่ศูนย์เอกสารต้องเห็นเป็นอันดับแรก
 * ถ้าปฏิเสธไว้ จะกรอกของจริงที่ค้างอยู่ไม่ได้เลย (ต่างจากวันพ้นสภาพที่ห้ามอนาคต)
 *
 * อ่านกลับมาทั้งเรกคอร์ดเหมือน `setDriverStatus()` — หน้าจอต้องแสดงของที่บันทึกจริง
 */
export async function setDriverIdCardExpiry(
  code: string,
  dateISO: string,
  actor: string,
): Promise<DriverRecord | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  const raw = dateISO.trim();
  const iso = raw ? toIsoDate(raw) : "";
  if (raw && !iso) throw new DriverRegistryError("อ่านวันหมดอายุที่ส่งมาไม่ได้");

  /* `Record<string, unknown>` เหมือน `setDriverStatus()` — union ของ `$set`/`$unset`
     ตรง ๆ ทำให้ `""` ของ `$unset` ถูกขยายเป็น `string` แล้วชนกับชนิดของ driver */
  const update: Record<string, unknown> = iso
    ? {
        $set: {
          idCardExpiryDate: iso,
          idCardExpiryUpdatedAt: new Date(),
          idCardExpiryUpdatedBy: actor,
        },
      }
    : {
        $unset: {
          idCardExpiryDate: "",
          idCardExpiryUpdatedAt: "",
          idCardExpiryUpdatedBy: "",
        },
      };

  try {
    if (!(await driverExists(drivercode))) return null;
    const drivers = await hrCol<MasterDriverDoc>("drivers");
    await drivers.updateOne({ drivercode }, update, { upsert: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกวันหมดอายุบัตรประชาชนไม่สำเร็จ — ${reason}`);
  }

  return getDriver(drivercode);
}

/* ------------------------------------------------------ เอกสารในแฟ้ม */

export interface DriverDocumentInput {
  /** id กับ key ที่ได้จาก `saveDriverDocumentFile()` — ไฟล์ต้องขึ้น S3 มาก่อนแล้ว */
  fileId: string;
  key: string;
  name: string;
  type: string;
  size: number;
  docType: string;
  note?: string;
}

/**
 * เพิ่มเอกสารเข้าแฟ้มของ พจส. คนหนึ่ง — คืน **รายการที่อ่านกลับมาจากฐานข้อมูลจริง**
 * · `null` = ไม่มีรหัสนี้ในทะเบียน (คนเรียกต้องไปลบไฟล์ที่เพิ่งอัปทิ้งเอง)
 *
 * `$push` ลง `hr_service.master_driver.documents` เท่านั้น **ไม่แตะ `Boom_ETL`**
 *
 * **ไม่ทับของเดิมแม้เป็นประเภทเดียวกัน** — สำเนาบัตรประชาชนใบใหม่ไม่ได้แปลว่า
 * ใบเก่าผิด สัญญาจ้างมีได้หลายฉบับตามอายุสัญญา และใบรับรองแพทย์ก็ตรวจซ้ำได้เรื่อย ๆ
 * หน้าจอเรียงใหม่สุดไว้บนแทน ส่วนการลบเป็นการกดของคนเท่านั้น
 */
export async function attachDriverDocument(
  code: string,
  input: DriverDocumentInput,
  actor: string,
): Promise<DriverDocument[] | null> {
  const drivercode = code.trim();
  if (!drivercode) return null;

  if (!isDriverDocType(input.docType)) {
    throw new DriverRegistryError("ประเภทเอกสารไม่ถูกต้อง");
  }

  const entry = {
    fileId: input.fileId,
    key: input.key,
    name: input.name,
    type: input.type,
    size: input.size,
    docType: input.docType,
    note: (input.note ?? "").trim(),
    uploadedAt: new Date(),
    uploadedBy: actor,
  };

  try {
    if (!(await driverExists(drivercode))) return null;
    const collection = await hrCol<MasterDriverDoc>("drivers");

    await collection.updateOne({ drivercode }, { $push: { documents: entry } }, { upsert: true });

    // อ่านกลับมาทั้งแฟ้ม — หน้าจอจะได้แสดงของที่บันทึกจริง ไม่ใช่ของที่ส่งไป
    const after = await collection.findOne({ drivercode });
    return toDocuments(after?.documents);
  } catch (err) {
    if (err instanceof DriverRegistryError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`บันทึกเอกสารลงแฟ้มประวัติไม่สำเร็จ — ${reason}`);
  }
}

/** เอกสารใบเดียวในแฟ้มของคนนี้ — `null` เมื่อไฟล์นั้นไม่ได้อยู่ในแฟ้มของรหัสนี้ */
export async function getDriverDocument(
  code: string,
  fileId: string,
): Promise<DriverDocument | null> {
  const driver = await getDriver(code);
  return driver?.documents.find((doc) => doc.fileId === fileId) ?? null;
}

/**
 * ถอดเอกสารออกจากแฟ้ม **แล้วลบตัวไฟล์ตามไปด้วย** — คืนรายการที่เหลือ ·
 * `null` = ไม่มีรหัสนี้ หรือไม่มีไฟล์นั้นในแฟ้มของคนนี้
 *
 * ถอดชื่อออกจากแฟ้มก่อนแล้วค่อยลบไฟล์เสมอ — ลำดับกลับกันจะได้แฟ้มที่มีรายการ
 * ซึ่งกดเปิดแล้ว 404 (ดูคอมเมนต์ `deleteDriverDocumentFile()`)
 *
 * **ลบจริง ไม่ได้ซ่อน** — เอกสารที่แนบผิดคนคือข้อมูลส่วนบุคคลของคนอื่นที่ค้าง
 * อยู่ในแฟ้มที่ไม่ใช่ของเขา เก็บ “ซากที่ลบแล้ว” ไว้เท่ากับไม่ได้ลบ
 */
export async function detachDriverDocument(
  code: string,
  fileId: string,
): Promise<DriverDocument[] | null> {
  const drivercode = code.trim();
  if (!drivercode || !fileId) return null;

  let remaining: DriverDocument[];
  let key = "";

  try {
    const collection = await hrCol<MasterDriverDoc>("drivers");

    /* อ่านแถวก่อนถอด — ต้องรู้ `key` ของไฟล์บน S3 ที่จะลบตามไป */
    const before = await collection.findOneAndUpdate(
      { drivercode, "documents.fileId": fileId },
      { $pull: { documents: { fileId } } },
      { returnDocument: "before" },
    );
    if (!before) return null;
    key = toDocuments(before.documents).find((d) => d.fileId === fileId)?.key ?? "";

    const after = await collection.findOne({ drivercode });
    remaining = toDocuments(after?.documents);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`ลบเอกสารออกจากแฟ้มประวัติไม่สำเร็จ — ${reason}`);
  }

  /* ไฟล์กำพร้าที่ลบไม่สำเร็จไม่ใช่เหตุให้บอกผู้ใช้ว่าลบไม่สำเร็จ — สิ่งที่เขาเห็น
     และสิ่งที่ระบบอ้างถึงหายไปแล้วจริง ส่วนที่เหลือคือขยะที่เก็บกวาดทีหลังได้ */
  await deleteDriverDocumentFile(key);

  return remaining;
}
