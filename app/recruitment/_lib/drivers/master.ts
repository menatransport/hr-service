import { etlCol, hrCol } from "@/lib/db";

/**
 * ตัวอ่านทะเบียน พจส. ตัวเดียวของทั้งระบบ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * 🔀 **19 ต.ค. 2569 ตามคำสั่ง Bew — ทะเบียนเป็นของ hr-service แล้ว ไม่ได้อ่านจาก `Boom_ETL.main_driver`**
 * `main_driver` ปนทุกสาขา (2,674 คน · active 2,386) และค้างคนที่ออกไปแล้วอีก 108 คน ยอดจึงไม่ตรงกับ
 * ทะเบียนจริงของฝ่ายบุคคล · ตอนนี้ทะเบียน = เอกสารใน `hr_service.master_driver` ที่มี `registry`:
 * - **`source: "excel-2026"`** — นำเข้าจากไฟล์ “HR_ทะเบียนประวัติพจส.ลาดกระบัง Mixer.xlsx” ชีต
 *   “ทะเบียน 2026” (`import_driver_registry_xlsx.mjs`) · ปฏิบัติงาน 540 คน ณ วันนำเข้า
 * - **`source: "onboarding"`** — คนใหม่ที่หน้าติดตามพนักงานใหม่ผูกรหัส พจส. แล้ว (`enrollDriver()`)
 *
 * เอกสารเก่าที่ `sync_master_driver.mjs` เคยก๊อปมาจาก ETL (ไม่มี `registry`) **ไม่นับเป็นทะเบียน** —
 * ไม่ได้ลบทิ้ง เผื่อย้อนดู · สถานะการทำงานรายวันยังอ่านจาก `Boom_ETL.employee_work_status` เหมือนเดิม
 *
 * `active` ในเอกสาร = สถานะจริง (เขียนโดยตัวนำเข้า/`setDriverStatus()`) · `statusOverride` + `resignation`
 * คือบันทึกการพ้นสภาพ — ค่าที่ทับกันอยู่ให้ `statusOverride` ชนะเสมอ (`toRecord()`)
 */

/** ฟิลด์ประวัติ — ตัวนำเข้า Excel / การรับคนใหม่จากหน้าติดตามพนักงานใหม่เป็นคนเขียน */
export const PROFILE_FIELDS = [
  "drivercode",
  "driverName",
  "ownerType",
  "branch",
  "vehicleCode",
  "startDate",
  "licenseExpiryDate",
  /** เลขที่ใบขับขี่ · ชนิดใบขับขี่ (ท.2 …) · เลขบัตรประชาชน 13 หลัก — ข้อมูลส่วนบุคคล ไม่ส่งลงตารางรายชื่อ */
  "licenseNo",
  "licenseType",
  "nationalId",
  "phone",
  /** เบอร์อื่นที่ทะเบียนใส่มาในช่องเดียวกัน (คั่นด้วย `, `) */
  "phoneAlt",
  /** ผู้ติดต่อฉุกเฉิน · บัญชีรับเงิน (กสิกรไทย) — ข้อมูลส่วนบุคคล กติกาเดียวกับเลขบัตร */
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactPhone",
  "bankAccountNo",
  "bankBranch",
  /** ลูกค้า · แพล้นท์ · ตำแหน่ง ตามทะเบียนของฝ่ายบุคคล (ไม่ใช่ของรถใน ETL) */
  "customer",
  "plant",
  "position",
  "active",
  /** เวลาที่แถวนี้ถูกนำเข้า/รับเข้าทะเบียนล่าสุด */
  "syncedAt",
] as const;

/** ฟิลด์ที่ฝ่ายบุคคลบันทึกเองบนหน้าทะเบียน (รูป · สถานะ · บัตรประชาชน · แฟ้มเอกสาร · การลบตามนโยบาย 1 เดือน) */
export const HR_FIELDS = [
  "photoUrl",
  "photoUpdatedAt",
  "photoUpdatedBy",
  "statusOverride",
  "resignation",
  "idCardExpiryDate",
  "idCardExpiryUpdatedAt",
  "idCardExpiryUpdatedBy",
  "documents",
  "mediaPurgedAt",
  /** แก้ประวัติบนหน้าทะเบียนล่าสุด — ดู `updateDriverProfile()` */
  "profileEditedAt",
  "profileEditedBy",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type HrField = (typeof HR_FIELDS)[number];
export type DriverField = ProfileField | HrField | "registry";

const ALL_FIELDS: DriverField[] = [...PROFILE_FIELDS, ...HR_FIELDS, "registry"];

/** แถวที่นับเป็นทะเบียน — ทุก query ของไฟล์นี้ขึ้นต้นด้วยตัวนี้ */
export const IN_REGISTRY = { registry: { $exists: true } } as const;

/** เพดานกันพลาด ไม่ใช่การแบ่งหน้า (ทะเบียนราวพันแถว) */
const LIST_LIMIT = 5_000;

const code = (v: unknown): string => (typeof v === "string" ? v.trim() : String(v ?? "").trim());

/**
 * อ่าน พจส. ในทะเบียนตามรายการฟิลด์ที่ขอ — เรียงตาม `drivercode`
 *
 * `codes` = อ่านเฉพาะรหัสเหล่านี้ · ไม่ส่ง = ทั้งทะเบียน · **ขอเฉพาะฟิลด์ที่ใช้จริง** (`documents` ใหญ่)
 */
export async function readDrivers<T extends object = Record<string, unknown>>(
  fields: readonly DriverField[] | "all",
  { codes }: { codes?: readonly string[] } = {},
): Promise<T[]> {
  const wanted = fields === "all" ? ALL_FIELDS : fields;
  const projection: Record<string, 1 | 0> = { _id: 0, drivercode: 1 };
  for (const f of wanted) projection[f] = 1;

  const filter = codes ? { ...IN_REGISTRY, drivercode: { $in: [...codes] } } : IN_REGISTRY;
  const docs = await hrCol("drivers").then((c) =>
    c.find(filter, { projection }).sort({ drivercode: 1 }).limit(LIST_LIMIT).toArray(),
  );

  return docs
    .map((doc) => ({ ...doc, drivercode: code(doc.drivercode) }))
    .filter((doc) => doc.drivercode) as T[];
}

/** พจส. หนึ่งคนทุกฟิลด์ — `null` เมื่อไม่มีรหัสนี้ในทะเบียน */
export async function readDriver<T extends object = Record<string, unknown>>(
  drivercode: string,
  fields: readonly DriverField[] | "all" = "all",
): Promise<T | null> {
  const key = drivercode.trim();
  if (!key) return null;
  const [doc] = await readDrivers<T>(fields, { codes: [key] });
  return doc ?? null;
}

/** มีรหัสนี้ในทะเบียนจริงไหม — ใช้ก่อนเขียนทุกครั้ง กันพิมพ์รหัสมั่วแล้วได้แถวผีใน `master_driver` */
export async function driverExists(drivercode: string): Promise<boolean> {
  const key = drivercode.trim();
  if (!key) return false;
  const drivers = await hrCol("drivers");
  return (await drivers.countDocuments({ ...IN_REGISTRY, drivercode: key }, { limit: 1 })) > 0;
}

/** ข้อมูลตั้งต้นของรหัสที่ ATMS ออกให้แล้ว แต่ยังไม่อยู่ในทะเบียน — ดู `findIssuedDriver()` */
export interface IssuedDriver {
  drivercode: string;
  driverName: string;
  phone: string;
  ownerType: string;
  branch: string;
  vehicleCode: string;
  startDate: string;
  licenseExpiryDate: string;
  /** `true` = อยู่ในทะเบียนแล้ว */
  inRegistry: boolean;
}

/**
 * รหัส พจส. ที่ใช้ได้ — อยู่ในทะเบียนแล้ว **หรือ** ATMS ออกรหัสให้แล้ว (`Boom_ETL.main_driver`)
 *
 * หน้าติดตามพนักงานใหม่ผูกรหัสของคนใหม่ก่อนที่เขาจะอยู่ในทะเบียน — `main_driver` จึงยังเป็นที่ตรวจว่า
 * รหัสมีจริง (กันพิมพ์ผิด) และเป็นค่าตั้งต้นของเบอร์/ใบขับขี่ตอนรับเข้าทะเบียน **ไม่ใช่ตัวทะเบียน**
 */
export async function findIssuedDriver(drivercode: string): Promise<IssuedDriver | null> {
  const key = drivercode.trim();
  if (!key) return null;

  const [own, etl] = await Promise.all([
    readDriver<Record<string, unknown>>(key, ["drivercode", "driverName", "phone", "ownerType", "branch", "vehicleCode", "startDate", "licenseExpiryDate"]),
    etlCol("mainDriver").then((c) => c.findOne({ drivercode: key }, { projection: { _id: 0 } })),
  ]);
  const doc = own ?? etl;
  if (!doc) return null;

  const pick = (ownKey: string, etlKey: string) => code(own ? own[ownKey] : etl?.[etlKey]);
  return {
    drivercode: key,
    driverName: pick("driverName", "driver_name"),
    phone: pick("phone", "phone"),
    ownerType: pick("ownerType", "owner_type"),
    branch: pick("branch", "branch"),
    vehicleCode: pick("vehicleCode", "vehicle"),
    startDate: pick("startDate", "datestart"),
    licenseExpiryDate: pick("licenseExpiryDate", "driver_expiry_date"),
    inRegistry: Boolean(own),
  };
}

/**
 * รหัสที่ ATMS ออกให้คนชื่อนี้ (ชื่อตรงตัว ยุบช่องว่าง · รหัสใหม่สุดก่อน) — หน้าติดตามพนักงานใหม่ใช้เดารหัส
 * ของคนใหม่ที่ยังไม่ได้ผูก · หาใน `main_driver` เพราะคนใหม่ยังไม่อยู่ในทะเบียนจนกว่าจะผูกรหัส
 */
export async function findIssuedCodeByName(name: string): Promise<{ drivercode: string; name: string } | null> {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const pattern = `^\\s*${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\s*$`;
  const hit = await etlCol("mainDriver").then((c) =>
    c.findOne(
      { driver_name: { $regex: pattern } },
      { projection: { _id: 0, drivercode: 1, driver_name: 1 }, sort: { drivercode: -1 } },
    ),
  );
  const drivercode = code(hit?.drivercode);
  return drivercode ? { drivercode, name: String(hit?.driver_name ?? "").trim() } : null;
}

/** พจส. ที่ยังปฏิบัติงานและผูกกับรถคันนี้ — ส่งทั้งเลขรถและทะเบียนมา (ทะเบียนเก็บเป็นเลขรถเป็นหลัก) */
export async function readDriversOnVehicle(keys: readonly string[]): Promise<{ drivercode: string; name: string }[]> {
  const wanted = keys.map((k) => k.trim()).filter(Boolean);
  if (!wanted.length) return [];
  const docs = await hrCol("drivers").then((c) =>
    c
      .find(
        { ...IN_REGISTRY, vehicleCode: { $in: wanted }, active: true, statusOverride: { $ne: "resigned" } },
        { projection: { _id: 0, drivercode: 1, driverName: 1 } },
      )
      .toArray(),
  );
  return docs
    .map((d) => ({ drivercode: code(d.drivercode), name: String(d.driverName ?? "").trim() }))
    .filter((d) => d.drivercode);
}

/** เวลาที่ทะเบียนถูกนำเข้า/รับคนเข้าล่าสุด (`syncedAt` มากสุด) */
export async function driversSyncedAt(): Promise<string | null> {
  const [doc] = await hrCol("drivers").then((c) =>
    c.find(IN_REGISTRY, { projection: { _id: 0, syncedAt: 1 } }).sort({ syncedAt: -1 }).limit(1).toArray(),
  );
  const v = doc?.syncedAt;
  return v instanceof Date ? v.toISOString() : typeof v === "string" && v ? v : null;
}
