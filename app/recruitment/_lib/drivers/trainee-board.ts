import type { WithId } from "mongodb";

import { etlCol, hrCol } from "@/lib/db";
import { readDrivers } from "./master";
import {
  DriverRegistryError,
  loadManualDays,
  manualCodesInMonth,
  toIsoDate,
  todayInBangkok,
} from "./registry";
import { isExitStatus, siteOfBranch, workStatusFullLabel } from "./types";
import type { DriverSiteKey, TraineeDailyEntry } from "./types";

/**
 * ข้อมูลของหน้าติดตามฝึกงาน — **ตัวอ่านของตัวเอง ไม่ใช่ `getDriverRegistry()`**
 *
 * หน้านี้เคยใช้ทะเบียนทั้งก้อนร่วมกับหน้าทะเบียนประวัติ ซึ่งแปลว่าทุกครั้งที่เปิด
 * เบราว์เซอร์ต้องรับ พจส. **ทั้ง 2,617 คน พร้อมสถานะรายวันทุกวันเท่าที่มีในระบบ
 * (378,002 ช่อง ≈ 6.9 MB)** เพื่อวาดตารางของคนราว 150 คนในเดือนเดียว — ตัววัดอยู่ที่
 * ท้าย `.claude/docs/registry-history.md` · ตัวอ่านนี้จึงตัดตั้งแต่ต้นทาง:
 *
 * 1. **เริ่มจากสถานะการทำงาน ไม่ใช่จากทะเบียน** — หารหัสที่มี `ฝ` ในเดือนนั้นใน
 *    `employee_work_status` (+ ที่ฝ่ายบุคคลกรอกเอง) แล้วค่อยอ่าน `master_driver`
 *    เฉพาะรหัสเหล่านั้นเพื่อเติมชื่อ/รูป/สาขา (ดูเหตุผลในตัว `getTraineeBoard()`)
 * 2. `employee_work_status` **project เฉพาะเดือนที่เปิดอยู่** (`months.<YYYY-MM>`)
 *    — ฟิลด์แบบจุดทำได้ตรง ๆ กับ Mongo จึงไม่ต้องลากทั้ง 13,516 เดือนมาแล้วค่อยทิ้ง
 * 3. คัดเหลือ “คนที่ต้องติดตาม” ตั้งแต่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ส่งไปให้ client กรองเอง
 * 4. `vehicles` ดึงเฉพาะรถของคนที่เหลือ (798 → ~150 คัน)
 *
 * ผลคือ payload ราว 80 KB ต่อหนึ่งเดือน · **เดือนจึงกลายเป็นพารามิเตอร์ของหน้า**
 * (`?m=`) ไม่ใช่ state ในเบราว์เซอร์ — เปลี่ยนเดือนคือโหลดเดือนนั้นมาจริง ๆ
 * แลกการรออีกครั้งหนึ่งกับการไม่ต้องขนทั้งปีมาตั้งแต่แรก
 */

/**
 * เลื่อนดูย้อนหลังได้กี่เดือน
 *
 * ไม่ได้คิดจากข้อมูลว่ามีเดือนไหนบ้าง เพราะการถามฐานข้อมูลว่า “มีเดือนอะไรบ้าง”
 * คือการสแกนทั้งคอลเลกชันเพื่อได้รายการสั้น ๆ ที่เดาได้อยู่แล้ว · ปฏิทินมีทุกเดือน
 * ไม่ว่าจะมีข้อมูลหรือไม่ เดือนที่ว่างก็ขึ้นว่าไม่มีใครต้องติดตาม ซึ่งเป็นความจริง
 */
const VISIBLE_MONTHS = 12;

export interface TraineeBoardDriver {
  drivercode: string;
  name: string;
  photoUrl: string;
  siteKey: DriverSiteKey | null;
  /** แพล้นท์ของรถประจำ — มีไว้ให้ช่องค้นหาเท่านั้น */
  plant: string;
  startDateISO: string;
  tenureMonths: number | null;
  tenureDays: number | null;
  /** สถานะรายวันจาก ATMS **เฉพาะเดือนที่ขอ** — คีย์เป็น `YYYY-MM-DD` */
  days: Record<string, string>;
  /** สถานะรายวันที่ฝ่ายบุคคลกรอกเอง **เฉพาะเดือนที่ขอ** */
  manualDays: Record<string, TraineeDailyEntry>;
  /**
   * วันที่พ้นสภาพ ถ้าพ้นภายในเดือนที่ขอ (`YYYY-MM-DD`) · ว่าง = ยังปฏิบัติงานอยู่
   *
   * คนที่พ้นสภาพไป**ก่อน**เดือนที่เปิดอยู่ไม่ถูกส่งมาเลย (ดู `getTraineeBoard()`)
   * ฟิลด์นี้จึงมีค่าได้แค่สองแบบ: ว่าง หรือวันในเดือนนี้ — แถวที่มีค่าขึ้นธีมแดง
   */
  exitedOn: string;
  /** เหตุผลที่พ้นสภาพเท่าที่รู้ — ความหมายของรหัส `ลอ`/`ปอ` หรือเหตุผลที่ฝ่ายบุคคลบันทึก */
  exitReason: string;
  /**
   * 🔗 คำขอสรรหาที่ผูก `drivercode` นี้ไว้ (ที่ยังไม่ยกเลิก) — ว่าง = ไม่มี
   * (พจส. เก่าที่ขึ้นทะเบียนก่อนมีระบบนี้ หรือคนที่ไม่ได้มาจากการขอสรรหาเลย)
   *
   * มีไว้เพื่อเป็นปลายทางของ `PATCH /api/recruitment/requisitions/{id}` ตอนผูก
   * ทะเบียนรถให้คนที่กำลังฝึกงานอยู่ — ไม่มีค่านี้ = ผูกทะเบียนรถจากหน้านี้ไม่ได้
   */
  requisitionId: string;
  requisitionCode: string;
  /** ทะเบียนรถของคำขอที่ผูกไว้ — **แหล่งความจริงเดียวกับตารางขอสรรหา** ไม่ใช่สำเนา
      แยกต่างหาก แก้จากหน้านี้แล้วตารางขอสรรหาเห็นค่าเดียวกันทันทีที่โหลดใหม่ */
  vehicle: { code: string; plateNo: string; brand: string } | null;
}

export interface TraineeBoard {
  month: string;
  drivers: TraineeBoardDriver[];
  /** เดือนที่เลื่อนดูได้ เรียงใหม่→เก่า (`YYYY-MM`) */
  months: string[];
  todayISO: string;
  /** ต่อ `Boom_ETL` ไม่ติด — รายชื่อยังขึ้น แต่ไม่มีสถานะจากระบบ */
  enrichmentFailed: boolean;
  /** อ่านของที่กรอกเองไม่สำเร็จ — หน้าจอต้องปิดการกรอกไว้ */
  manualFailed: boolean;
}

/** สถานะการทำงานเท่าที่หน้านี้ขอมา — เดือนที่เปิดอยู่ กับสถานะล่าสุด */
interface WorkMonth {
  month: unknown;
  latestStatus: string;
  latestISO: string;
}

/** เอกสาร พจส. (`readDrivers()`) เท่าที่หน้านี้ขอมา — ไม่ใช่ทั้งใบ */
interface DriverLite {
  drivercode?: unknown;
  driverName?: unknown;
  photoUrl?: unknown;
  branch?: unknown;
  vehicleCode?: unknown;
  startDate?: unknown;
  active?: unknown;
  statusOverride?: unknown;
  resignation?: { dateISO?: unknown; reasonCode?: unknown; reasonLabel?: unknown };
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** รหัสฝึกงานของ ATMS — ตัวเดียวกับ `TRAIN_CODES` ใน `trainees.ts` (`ฝ` = พจส.ฝึกงาน) */
const TRAINING_CODE = "ฝ";
const isTrainingCode = (code: string) => code.trim() === TRAINING_CODE;

/**
 * รหัส พจส. ที่ ATMS ส่งสถานะ `ฝ` มาอย่างน้อยหนึ่งวันในเดือนนั้น — **ตัวตั้งต้นของตาราง**
 *
 * คัดใน Mongo ด้วย `$objectToArray` (ก้อนเดือนเป็น `{ "01": "A", "02": "ฝ" … }`) จึงได้
 * กลับมาแค่รหัสไม่กี่สิบตัว ไม่ต้องลากสถานะทั้ง ~1,500 คนมากรองเอง · แบบ `{ "YYYY-MM-DD": … }`
 * ก็ผ่านเหมือนกันเพราะดูแค่ค่า ไม่ดูคีย์
 */
async function trainingCodesInMonth(month: string): Promise<string[]> {
  const workStatus = await etlCol("workStatus");
  const rows = await workStatus
    .aggregate<{ employee_code?: unknown }>([
      { $match: { [`months.${month}`]: { $type: "object" } } },
      { $project: { employee_code: 1, days: { $objectToArray: `$months.${month}` } } },
      { $match: { "days.v": { $regex: `^\\s*${TRAINING_CODE}\\s*$` } } },
      { $project: { employee_code: 1 } },
    ])
    .toArray();
  return rows.map((row) => str(row.employee_code)).filter(Boolean);
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}

/** `YYYY-MM` ย้อนหลังจากเดือนของ `todayISO` — ใหม่→เก่า */
function monthList(todayISO: string): string[] {
  const [y, m] = todayISO.split("-").map(Number);
  return Array.from({ length: VISIBLE_MONTHS }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

/** เดือนที่ขอมาใช้ได้ไหม — นอกช่วงที่เลื่อนดูได้ให้ตกกลับเป็นเดือนปัจจุบัน */
function resolveMonth(requested: string, months: string[]): string {
  return months.includes(requested) ? requested : months[0];
}

/**
 * แกะสถานะรายวันของเดือนเดียวออกจากก้อน `months` ที่ project มา
 *
 * โครงข้างในยังไม่ยืนยัน (ดู `toWorkDays()` ใน `registry.ts` ที่รับไว้สี่แบบ) —
 * ที่นี่รับสองแบบที่พบจริงกับเดือนเดี่ยว: `{ "01": "A" }` และ `{ "2026-09-01": "A" }`
 * แบบอื่นตกไปเงียบ ๆ เหมือนเดิม เพราะตารางว่างอ่านง่ายกว่าตารางที่เดาผิด
 */
function daysOfMonth(raw: unknown, month: string): Record<string, string> {
  const days: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return days;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const code = str(value);
    if (!code) continue;

    if (/^\d{1,2}$/.test(key)) days[`${month}-${key.padStart(2, "0")}`] = code;
    else if (key.startsWith(`${month}-`)) days[key] = code;
  }

  return days;
}

export async function getTraineeBoard(requestedMonth: string): Promise<TraineeBoard> {
  const todayISO = todayInBangkok();
  const months = monthList(todayISO);
  const month = resolveMonth(requestedMonth, months);

  /*
   * **คนที่ต้องติดตาม = คนที่มีสถานะฝึกงาน (`ฝ`) ภายในเดือนที่เปิดอยู่** — เริ่มจาก
   * สถานะการทำงาน ไม่ใช่จากทะเบียน พจส.
   *
   * 🔀 เปลี่ยนตามคำสั่งเจ้าของงาน (29 ก.ย. 2026) — เดิมเริ่มจาก `master_driver` ที่
   * `active` แล้วคัดด้วยอายุงาน < `PROBATION_MONTHS` เดือน **หรือ** มีวันฝึก ผลคือ:
   * (1) คนที่ออกงานจริงไปแล้วเป็นร้อยคนติดมาเพราะอายุงานยังน้อย และ (2) คนที่ฝึกอยู่จริง
   * หายไปเกือบหมด — วัดเดือน ก.ย. 2569 ได้ 37 คนที่มี `ฝ` แต่ขึ้นแค่ 4 คน เพราะ ETL
   * ตั้ง `active: false` ให้คนฝึกงาน 18 คน และอีก 15 คนยังไม่มีใน `master_driver` เลย
   *
   * สองแหล่งของเดือนเดียวกัน: `employee_work_status.months.<YYYY-MM>` ของ ATMS และวันที่
   * ฝ่ายบุคคลกรอก `ฝ` เอง (`trainee_daily`) — คนที่เพิ่งเริ่มฝึกบางคนยังไม่ขึ้นใน ATMS ·
   * `master_driver` ถูกใช้แค่เติมชื่อ รูป สาขา และวันเริ่มงาน **ไม่ใช่ตัวคัดคน** ·
   * **อย่ากลับไปใช้อายุงานหรือ `active` ของ ETL เป็นเกณฑ์ถ้าไม่ได้สั่ง**
   */
  const [atmsCodes, hrCodes] = await Promise.allSettled([
    trainingCodesInMonth(month),
    manualCodesInMonth(month, TRAINING_CODE),
  ]);
  const codes = [
    ...new Set([
      ...(atmsCodes.status === "fulfilled" ? atmsCodes.value : []),
      ...(hrCodes.status === "fulfilled" ? hrCodes.value : []),
    ]),
  ];

  let docs: DriverLite[] = [];
  try {
    if (codes.length) {
      docs = await readDrivers<DriverLite>(
        ["drivercode", "driverName", "photoUrl", "branch", "vehicleCode", "startDate", "resignation"],
        { codes },
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DriverRegistryError(`อ่านทะเบียนประวัติจากฐานข้อมูลไม่สำเร็จ — ${reason}`);
  }
  const docByCode = new Map(docs.map((doc) => [str(doc.drivercode), doc]));

  /* ยิงพร้อมกัน คนละ db และไม่ขึ้นกัน · `allSettled` เพราะพังแยกกันได้
     — ไม่มีสถานะจากระบบยังกรอกเองได้ และกลับกัน */
  const [workResult, manualResult] = await Promise.allSettled([
    loadWorkMonth(codes, month),
    loadManualDays(codes, month),
  ]);

  const enrichmentFailed = atmsCodes.status === "rejected" || workResult.status === "rejected";
  const work = workResult.status === "fulfilled" ? workResult.value : new Map<string, WorkMonth>();
  const manualFailed = hrCodes.status === "rejected" || manualResult.status === "rejected";
  const manual =
    manualResult.status === "fulfilled"
      ? manualResult.value
      : new Map<string, Record<string, TraineeDailyEntry>>();

  const drivers: TraineeBoardDriver[] = [];

  for (const drivercode of codes) {
    /* ยังไม่มีในทะเบียน = พจส. ใหม่ที่ ETL ยังไม่สร้างให้ — ยังต้องขึ้นในตาราง
       ชื่อเติมจากคำขอสรรหาที่ผูกรหัสนี้ไว้ทีหลัง (`attachRequisitions()`) */
    const doc: DriverLite = docByCode.get(drivercode) ?? { drivercode };
    const status = work.get(drivercode);
    const days = daysOfMonth(status?.month, month);
    const manualDays = manual.get(drivercode) ?? {};

    const trainedByAtms = Object.values(days).some(isTrainingCode);
    const trainedByHr = Object.values(manualDays).some((entry) => isTrainingCode(entry.code));
    if (!trainedByAtms && !trainedByHr) continue;

    const startDateISO = toIsoDate(doc.startDate);
    const tenureMonths = startDateISO ? monthsBetween(startDateISO, todayISO) : null;

    /*
     * พ้นสภาพในเดือนนี้ไหม — วันที่ที่ฝ่ายบุคคลบันทึกเอง > รหัส `ลอ`/`ปอ` ในเดือนนี้ >
     * สถานะล่าสุดที่เป็น `ลอ`/`ปอ` และตกอยู่ในเดือนนี้ · **ไม่ใช้ `active` ของ ETL แล้ว**
     * เพราะ ETL ตั้ง `false` ให้คนที่ยังฝึกอยู่ด้วย · คนที่มี `ฝ` ในเดือนนี้ย่อมอยู่ในเดือนนี้
     * จริง จึงไม่มีการซ่อนแถวเพราะพ้นสภาพอีก มีแต่ธีมแดงเมื่อพ้นกลางเดือน
     */
    const exitedOn = pickExitDate(
      toIsoDate(doc.resignation?.dateISO),
      days,
      manualDays,
      status,
      month,
    );

    drivers.push({
      drivercode,
      name: str(doc.driverName),
      photoUrl: str(doc.photoUrl),
      siteKey: siteOfBranch(str(doc.branch)),
      plant: "",
      startDateISO,
      tenureMonths,
      tenureDays: startDateISO ? Math.max(0, daysBetween(startDateISO, todayISO)) : null,
      days,
      manualDays,
      exitedOn,
      exitReason: exitedOn
        ? exitReasonOf(doc, days, manualDays, exitedOn, status?.latestStatus ?? "")
        : "",
      requisitionId: "",
      requisitionCode: "",
      vehicle: null,
    });
  }

  /* คนละ db กัน (`Boom_ETL` vs `hr_service`) และไม่ขึ้นกัน — ยิงพร้อมกันได้ */
  await Promise.all([attachPlants(drivers, docs), attachRequisitions(drivers)]);

  return { month, drivers, months, todayISO, enrichmentFailed, manualFailed };
}

/**
 * วันที่พ้นสภาพ **เฉพาะที่อยู่ในเดือนที่เปิดอยู่** — ว่าง = ไม่ได้พ้นในเดือนนี้
 *
 * วันที่ที่ฝ่ายบุคคลบันทึกเองมาก่อน เพราะเป็นตัวที่มีคนรับผิดชอบกำกับ · ไม่มีค่อย
 * มองหารหัส `ลอ`/`ปอ` ในเดือนนั้น (เอาวันหลังสุด เผื่อมีทั้งลาออกและถูกปลดปนกัน)
 */
function pickExitDate(
  recordedISO: string,
  days: Record<string, string>,
  manualDays: Record<string, TraineeDailyEntry>,
  status: WorkMonth | undefined,
  month: string,
): string {
  if (recordedISO) return recordedISO.startsWith(`${month}-`) ? recordedISO : "";

  let latest = "";
  for (const [iso, code] of Object.entries(days)) {
    if (isExitStatus(code) && iso > latest) latest = iso;
  }
  for (const [iso, entry] of Object.entries(manualDays)) {
    if (isExitStatus(entry.code) && iso > latest) latest = iso;
  }
  if (latest) return latest;

  /* ไม่มีรหัสพ้นสภาพในรายวัน แต่สถานะล่าสุดบอกว่าออกไปแล้ว — ใช้วันทำงานล่าสุด
     แทน และรับเฉพาะที่ตกอยู่ในเดือนนี้ (ต้นทางบางแถวมีแต่ยอดรวม ไม่มีรายวัน) */
  if (isExitStatus(status?.latestStatus ?? "") && status?.latestISO.startsWith(`${month}-`)) {
    return status.latestISO;
  }
  return "";
}

/** เหตุผลที่พ้นสภาพเท่าที่รู้ — ของฝ่ายบุคคลมาก่อน ไม่มีก็ใช้ความหมายของรหัสวันนั้น */
function exitReasonOf(
  doc: DriverLite,
  days: Record<string, string>,
  manualDays: Record<string, TraineeDailyEntry>,
  exitedOn: string,
  latestStatus: string,
): string {
  const recorded = str(doc.resignation?.reasonLabel);
  const recordedCode = str(doc.resignation?.reasonCode);
  /* รหัสจาก Reason Code Master (P4, X1 …) ขึ้นนำหน้า — ระเบียนเก่าที่รหัสเป็นคำยาว
     แบบ `voluntary-job` ไม่ต้องโชว์รหัส */
  if (recorded) return /^[A-Z]{1,3}\d+$/.test(recordedCode) ? `${recordedCode} · ${recorded}` : recorded;

  const code = days[exitedOn] || manualDays[exitedOn]?.code || latestStatus;
  return isExitStatus(code) ? workStatusFullLabel(code) : "";
}

/**
 * สถานะรายวัน **เฉพาะเดือนเดียว** — `months.<YYYY-MM>` เป็นฟิลด์แบบจุด
 *
 * นี่คือจุดที่ประหยัดที่สุดของทั้งหน้า: ก้อน `months` ของทุกคนรวมกันคือ 3.5 MB
 * แต่เดือนเดียวของคนที่ต้องติดตามคือหลักสิบ KB · Mongo คัดให้ตั้งแต่ก่อนส่งออกมา
 */
async function loadWorkMonth(codes: string[], month: string): Promise<Map<string, WorkMonth>> {
  if (!codes.length) return new Map();

  const workStatus = await etlCol("workStatus");
  const docs = await workStatus
    .find(
      { employee_code: { $in: codes } },
      /* `latest_*` เป็นฟิลด์บนสุดสองช่อง ไม่ใช่ก้อน — ขอมาด้วยแทบไม่มีต้นทุน
         และเป็นทางเดียวที่รู้ว่าคนนี้พ้นสภาพไปตั้งแต่เดือนก่อนโดยไม่ต้องอ่าน
         `months` ทั้งก้อนกลับมา (ซึ่งคือ 3.5 MB ที่เพิ่งตัดทิ้งไป) */
      {
        projection: {
          employee_code: 1,
          latest_status: 1,
          latest_work_date: 1,
          [`months.${month}`]: 1,
        },
      },
    )
    .toArray();

  return new Map(
    docs.map((doc) => [
      str(doc.employee_code),
      {
        month: (doc.months as Record<string, unknown> | undefined)?.[month],
        latestStatus: str(doc.latest_status),
        latestISO: toIsoDate(doc.latest_work_date),
      },
    ]),
  );
}

/**
 * เติมแพล้นท์ให้คนที่เหลือ — **ยิงหลังคัดคนแล้ว ไม่ใช่ก่อน**
 *
 * แพล้นท์ถูกใช้ที่เดียวคือช่องค้นหา ("ค้นหาชื่อ รหัส หรือแพล้นท์") การดึงรถของ
 * ทั้งทะเบียนมาเพื่อสิ่งนี้คือ 531 KB ที่เกือบทั้งหมดถูกทิ้ง · พังก็แค่ค้นด้วย
 * แพล้นท์ไม่ได้ ตารางยังครบ จึงไม่ต้องรายงานความล้มเหลวขึ้นไปถึงหน้าจอ
 */
async function attachPlants(drivers: TraineeBoardDriver[], docs: DriverLite[]): Promise<void> {
  const refByCode = new Map(docs.map((doc) => [str(doc.drivercode), str(doc.vehicleCode)]));
  const refs = [...new Set(drivers.map((d) => refByCode.get(d.drivercode)).filter(Boolean))];
  if (!refs.length) return;

  try {
    const vehicles = await etlCol("vehicles");
    const rows = await vehicles
      .find(
        { $or: [{ code: { $in: refs } }, { plate_no: { $in: refs } }] },
        { projection: { code: 1, plate_no: 1, plant: 1 } },
      )
      .toArray();

    const plants = new Map<string, string>();
    for (const row of rows) {
      const plant = str(row.plant);
      if (!plant) continue;
      if (str(row.code)) plants.set(str(row.code), plant);
      if (str(row.plate_no) && !plants.has(str(row.plate_no))) {
        plants.set(str(row.plate_no), plant);
      }
    }

    for (const driver of drivers) {
      driver.plant = plants.get(refByCode.get(driver.drivercode) ?? "") ?? "";
    }
  } catch {
    /* ค้นด้วยแพล้นท์ไม่ได้ แต่ตารางยังครบ — ไม่คุ้มที่จะล้มทั้งหน้าเพราะเรื่องนี้ */
  }
}

/** เอกสารคำขอสรรหาเท่าที่ฟังก์ชันนี้ขอมา — ไม่ใช่ทั้งใบ */
interface RequisitionLite {
  code?: unknown;
  drivercode?: unknown;
  status?: unknown;
  vehicle?: { code?: unknown; plateNo?: unknown; brand?: unknown } | null;
  match?: { fullName?: unknown } | null;
}

/**
 * ผูกคำขอสรรหาให้แถวคนที่เหลือ ด้วย `drivercode` — **สะพานเดียวกับที่ `store.ts`
 * ใช้ไปทางกลับ** (`recruitment_requests.drivercode`) ไม่ใช่สำเนาใหม่
 *
 * มีไว้ให้หน้านี้รู้ว่าจะยิง `PATCH /api/recruitment/requisitions/{id}` ตอนผูก
 * ทะเบียนรถไปที่ใบไหน · คนที่ไม่มีคำขอผูกอยู่เลย (พจส. เก่าก่อนมีระบบนี้) จะได้
 * `requisitionId` ว่าง — หน้าจอจึงไม่ขึ้นปุ่มผูกทะเบียนรถให้คนกลุ่มนั้น
 *
 * **พังแล้วไม่โยนต่อ** เหมือน `attachPlants()` — อ่านไม่สำเร็จก็แค่ไม่มีใครผูก
 * ทะเบียนรถได้ชั่วคราว ไม่ใช่เหตุผลที่ทั้งตารางต้องพัง
 */
async function attachRequisitions(drivers: TraineeBoardDriver[]): Promise<void> {
  const codes = [...new Set(drivers.map((d) => d.drivercode).filter(Boolean))];
  if (!codes.length) return;

  try {
    /* คำขอสรรหาของโมดูลขอสรรหา — อ่านตรงจากคอลเลกชันเพราะ `requisitions/store.ts` export แค่
       operation ระดับ id เดียว ไม่มีตัวอ่านแบบ "หลายคนพร้อมกัน" */
    const requisitions = await hrCol<RequisitionLite>("requisitions");
    const rows = await requisitions
      .find(
        { drivercode: { $in: codes } },
        { projection: { code: 1, drivercode: 1, status: 1, vehicle: 1, "match.fullName": 1 } },
      )
      .toArray();

    const byCode = new Map<string, WithId<RequisitionLite>>();
    for (const row of rows) {
      const code = str(row.drivercode);
      if (!code) continue;
      const existing = byCode.get(code);
      // ปกติมีใบเดียวต่อคน — ถ้าเจอมากกว่าหนึ่ง เก็บใบที่ยังไม่ยกเลิกไว้ก่อน
      if (!existing || (existing.status === "cancelled" && row.status !== "cancelled")) {
        byCode.set(code, row);
      }
    }

    for (const driver of drivers) {
      const req = byCode.get(driver.drivercode);
      if (!req) continue;

      driver.requisitionId = req._id.toHexString();
      driver.requisitionCode = str(req.code);
      /* พจส. ใหม่ที่ยังไม่มีใน `master_driver` ไม่มีชื่อ — ใช้ชื่อผู้สมัครที่ผูกกับคำขอแทน */
      if (!driver.name) driver.name = str(req.match?.fullName);
      driver.vehicle = req.vehicle
        ? {
            code: str(req.vehicle.code),
            plateNo: str(req.vehicle.plateNo),
            brand: str(req.vehicle.brand),
          }
        : null;
    }
  } catch (err) {
    console.warn("[trainee-board] อ่านคำขอสรรหาที่ผูกกับ พจส. ไม่สำเร็จ —", err);
  }
}
