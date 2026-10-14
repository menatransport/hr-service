import { etlCol, hrCol } from "@/lib/db";

/**
 * ตัวอ่านทะเบียน พจส. ตัวเดียวของทั้งระบบ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * ข้อมูลมาจากสองที่ แล้วประกอบเป็นเอกสารเดียวในรูปเดิมของ `master_driver`:
 * - **`Boom_ETL.main_driver`** (อ่านอย่างเดียว) — ชื่อ สาขา รถ เบอร์ วันเริ่มงาน ใบขับขี่ `active`
 *   อ่านสดทุกครั้ง ไม่มีสำเนา ไม่ต้องรอรอบ sync
 * - **`hr_service.master_driver`** — เฉพาะฟิลด์ที่ hr-service เป็นเจ้าของ (`HR_FIELDS`) ·
 *   ETL ไม่เคยเขียนที่นี่ ของที่ฝ่ายบุคคลบันทึกจึงไม่มีทางถูกทับ
 *
 * เดิม `sync_master_driver.mjs` ก๊อป `main_driver` ลง `master_driver` ทั้งก้อน (เลิกแล้ว 13 ต.ค. 2569)
 * ฟิลด์ ETL เก่าที่ค้างอยู่ในเอกสารเหล่านั้น **ถูกแทนด้วยค่าสดจาก ETL เสมอ** — ใช้เป็นข้อมูลสำรอง
 * เฉพาะคนที่ไม่มีใน `main_driver` แล้วเท่านั้น (คนจะได้ไม่หายจากทะเบียนเงียบ ๆ)
 *
 * Mongo `$lookup` ข้าม database ไม่ได้ จึงอ่านสองชุดพร้อมกันแล้วรวมกันตรงนี้ (ทะเบียนราว 2,600 คน)
 */

/** ฟิลด์ดิบใน `main_driver` → ชื่อฟิลด์ที่โค้ดทั้งระบบอ่าน (ชื่อเดียวกับที่ sync เดิมเคยเขียน) */
const ETL_FIELDS = {
  drivercode: "drivercode",
  driverName: "driver_name",
  ownerType: "owner_type",
  branch: "branch",
  vehicleCode: "vehicle",
  startDate: "datestart",
  licenseExpiryDate: "driver_expiry_date",
  phone: "phone",
  active: "active",
  /** เวลาที่ ETL mirror แถวนี้ล่าสุด */
  syncedAt: "synced_at",
} as const;

/**
 * ฟิลด์ที่ hr-service เป็นเจ้าของใน `master_driver` — **เขียนได้เฉพาะฟิลด์ในรายการนี้**
 * (รูป · สถานะที่ฝ่ายบุคคลกด · วันหมดอายุบัตรประชาชน · แฟ้มเอกสาร · การลบตามนโยบายเก็บ 1 เดือน)
 */
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
] as const;

export type EtlField = keyof typeof ETL_FIELDS;
export type HrField = (typeof HR_FIELDS)[number];
export type DriverField = EtlField | HrField;

const ALL_FIELDS = [...(Object.keys(ETL_FIELDS) as EtlField[]), ...HR_FIELDS];
const isEtlField = (f: DriverField): f is EtlField => f in ETL_FIELDS;

/** ทะเบียนมีราว 2,600 แถว — เพดานกันพลาด ไม่ใช่การแบ่งหน้า */
const LIST_LIMIT = 5_000;

const code = (v: unknown): string => (typeof v === "string" ? v.trim() : String(v ?? "").trim());

/**
 * อ่าน พจส. ตามรายการฟิลด์ที่ขอ — คืนเอกสารรูปเดิมของ `master_driver` เรียงตาม `drivercode`
 *
 * `codes` = อ่านเฉพาะรหัสเหล่านี้ · ไม่ส่ง = ทั้งทะเบียน · **ขอเฉพาะฟิลด์ที่ใช้จริง** —
 * ไม่ขอฟิลด์ของ hr-service เลย = ไม่ต้องอ่าน `master_driver` สำหรับคนที่ยังมีใน ETL
 */
export async function readDrivers<T extends object = Record<string, unknown>>(
  fields: readonly DriverField[] | "all",
  { codes }: { codes?: readonly string[] } = {},
): Promise<T[]> {
  const wanted = fields === "all" ? ALL_FIELDS : fields;
  const filter = codes ? { drivercode: { $in: [...codes] } } : {};

  const etlProjection: Record<string, 1 | 0> = { _id: 0, drivercode: 1 };
  for (const f of wanted) if (isEtlField(f)) etlProjection[ETL_FIELDS[f]] = 1;

  /* ฝั่ง master_driver ขอทุกฟิลด์ที่ต้องการ (รวมชื่อฟิลด์ ETL) — ของ ETL ที่ค้างอยู่ใช้แค่กับคนที่ไม่มีใน ETL แล้ว */
  const hrProjection: Record<string, 1 | 0> = { _id: 0, drivercode: 1 };
  for (const f of wanted) hrProjection[f] = 1;

  const [etlDocs, hrDocs] = await Promise.all([
    etlCol("mainDriver").then((c) => c.find(filter, { projection: etlProjection }).toArray()),
    hrCol("drivers").then((c) => c.find(filter, { projection: hrProjection }).toArray()),
  ]);

  const byCode = new Map<string, Record<string, unknown>>();

  for (const doc of hrDocs) {
    const key = code(doc.drivercode);
    if (key) byCode.set(key, { ...doc, drivercode: key });
  }

  for (const raw of etlDocs) {
    const key = code(raw.drivercode);
    if (!key) continue;
    const merged: Record<string, unknown> = { ...byCode.get(key), drivercode: key };
    for (const f of wanted) {
      if (!isEtlField(f) || f === "drivercode") continue;
      const value = raw[ETL_FIELDS[f]];
      merged[f] = f === "active" ? Boolean(value) : (value ?? (f === "syncedAt" ? null : ""));
    }
    byCode.set(key, merged);
  }

  return [...byCode.values()]
    .sort((a, b) => (a.drivercode as string).localeCompare(b.drivercode as string))
    .slice(0, LIST_LIMIT) as T[];
}

/** พจส. หนึ่งคนทุกฟิลด์ — `null` เมื่อไม่มีรหัสนี้ทั้งใน ETL และใน `master_driver` */
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
  const [inEtl, inHr] = await Promise.all([
    etlCol("mainDriver").then((c) => c.countDocuments({ drivercode: key }, { limit: 1 })),
    hrCol("drivers").then((c) => c.countDocuments({ drivercode: key }, { limit: 1 })),
  ]);
  return inEtl > 0 || inHr > 0;
}
