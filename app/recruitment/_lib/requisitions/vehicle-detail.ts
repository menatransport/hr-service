import { etlCol } from "@/lib/db";
import { driversSyncedAt, readDriversOnVehicle } from "@/app/recruitment/_lib/drivers/master";
import { getRepairBoardSyncedAt, getRepairDetail, type RepairDetail } from "./repair-status";

/**
 * รายละเอียดรถหนึ่งคันสำหรับ dialog ในขั้นยานยนต์ — **อ่านอย่างเดียว ไม่บันทึกลงคำขอ**
 * ทะเบียนรถ (`Boom_ETL.vehicles`) + พจส. ประจำรถ (`main_driver`) + งานซ่อมค้าง (บอร์ดซ่อม)
 *
 * ไม่ส่งเจ้าของ/ไฟแนนซ์/ค่าซ่อม (PR/PO/เบิกอะไหล่) — เป็นเรื่องการเงิน ไม่ใช่ของหน้า HR
 * · `synced` = ข้อมูลแต่ละชุดเป็นของเวลาไหน — ETL ดึงจาก ATMS เป็นรอบ ค่าอาจไม่ตรงกับ ATMS/WMS ณ ตอนนี้
 */
export interface VehicleDetail {
  code: string;
  plateNo: string;
  type: string;
  brand: string;
  model: string;
  year: string;
  project: string;
  branch: string;
  plant: string;
  drivers: { drivercode: string; name: string }[];
  repair: RepairDetail | null;
  synced: { vehicle: string | null; drivers: string | null; repair: string | null };
}

const iso = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString() : typeof v === "string" && v ? v : null;

export async function getVehicleDetail(key: string): Promise<VehicleDetail | null> {
  const v = key.trim();
  if (!v) return null;

  const doc = await (
    await etlCol<{
      code?: string;
      plate_no?: string;
      vehicle_type?: string;
      brand?: string;
      model?: string;
      year?: string;
      project?: string;
      branch?: string;
      plant?: string;
      synced_at?: unknown;
    }>("vehicles")
  ).findOne(
    { $or: [{ code: v }, { plate_no: v }] },
    {
      projection: {
        code: 1,
        plate_no: 1,
        vehicle_type: 1,
        brand: 1,
        model: 1,
        year: 1,
        project: 1,
        branch: 1,
        plant: 1,
        synced_at: 1,
      },
    },
  );
  if (!doc) return null;

  const t = (s: unknown) => (typeof s === "string" ? s.trim() : String(s ?? "").trim());
  const code = t(doc.code) || v;
  const plateNo = t(doc.plate_no);
  const plant = t(doc.plant);

  /* เวลาเป็นของเสริม — อ่านไม่ได้ก็ยังแสดงรายละเอียดรถได้ (ขึ้น “อ่านไม่ได้”) */
  const [drivers, repair, driversAt, repairAt] = await Promise.all([
    readDriversOnVehicle([plateNo, code]),
    plateNo ? getRepairDetail(plateNo) : null,
    driversSyncedAt().catch(() => null),
    getRepairBoardSyncedAt(),
  ]);

  return {
    code,
    plateNo,
    type: t(doc.vehicle_type),
    brand: t(doc.brand),
    model: t(doc.model),
    year: t(doc.year),
    project: t(doc.project),
    branch: t(doc.branch),
    plant: plant === "Unknown" ? "" : plant,
    drivers,
    repair,
    synced: { vehicle: iso(doc.synced_at), drivers: driversAt, repair: repairAt },
  };
}
