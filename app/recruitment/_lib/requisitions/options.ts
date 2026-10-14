import { etlCol } from "@/lib/db";
import { readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { siteLabel } from "@/app/recruitment/_lib/drivers/types";
import { normalizeStatus, type AnswerMap } from "@/app/recruitment/_lib/types";
import {
  fullNameOf,
  readApplicationsWithSnapshot,
} from "@/app/recruitment/_lib/applications";
import { LINKABLE_STATUSES } from "./types";

/**
 * ตัวเลือกของดรอปดาวน์ในหน้าขอสรรหา — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 *
 * โหลดทั้งชุดตอนเปิดหน้าแล้วส่งลงมาเป็น props (ท่าเดียวกับ `contactOptions`
 * ของหน้าผู้สมัคร) **ไม่ทำ endpoint ค้นหาแยก** เพราะ `Select` ของระบบงอก
 * ช่องค้นหาให้เองเมื่อตัวเลือกเยอะ และการกรองในหน่วยความจำของเบราว์เซอร์
 * เร็วกว่าการยิงถามเซิร์ฟเวอร์ทุกตัวอักษรที่พิมพ์
 *
 * ขนาดที่วัดได้จริง (21 ก.ย. 2026): พจส. ที่ยังทำงานอยู่ 588 คน · รถที่ยังใช้งาน
 * 1,409 คัน · แพล้นท์ 146 แห่ง — รวมแล้วราว 130 KB ต่อการเปิดหน้าหนึ่งครั้ง
 * **ถ้าทะเบียนโตจนเกินนี้มาก ให้ย้ายไปทำ endpoint ค้นหาจริง** อย่าดันต่อไปเรื่อย ๆ
 *
 * ⚠️ `vehicles` อยู่ใน `Boom_ETL` ซึ่งเป็นกระจกเงาของ ETL — **อ่านอย่างเดียว**
 */

export interface PickOption {
  value: string;
  label: string;
}

/** พจส. + รถประจำตัว — เลือกคนที่จะแทนแล้วฟอร์มเติมรถให้เอง (ท่าเดียวกับฟอร์มเดิมใน mena-next-lb) */
export interface DriverOption extends PickOption {
  /** ค่าที่ใช้เลือกในช่องรถ (`code` หรือทะเบียน) · ว่าง = ไม่มีรถประจำ */
  vehicle?: string;
}

/**
 * รถ + ค่าที่อ่านออกจาก `fleet` ของ ETL (`Cpac ML` → ลูกค้า Cpac ตำแหน่ง ML)
 * — ฟอร์มใช้เติมลูกค้า/ตำแหน่ง/แพล้นท์ให้ คนกรอกจะได้ไม่ต้องพิมพ์ซ้ำ
 */
export interface VehicleOption extends PickOption {
  plate?: string;
  brand?: string;
  plant?: string;
  customer?: string;
  position?: string;
}

export interface RequisitionOptions {
  /** พจส. ที่ยังทำงานอยู่ — ใช้ทั้งช่องครูฝึกและช่อง พจส. ที่จะแทน */
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  plants: PickOption[];
  /** ใบสมัครที่ผูกกับอัตราได้ — ทุกสถานะยกเว้นยกเลิก (ดู `LINKABLE_STATUSES`) */
  candidates: PickOption[];
  /**
   * อ่านชุดไหนไม่สำเร็จบ้าง — หน้าจอขึ้นแถบเตือนแล้ว**ยังใช้งานต่อได้**
   * คำขอที่บันทึกไว้แล้วไม่ได้ขึ้นกับตัวเลือกพวกนี้เลย
   */
  failed: string[];
}

const EMPTY: RequisitionOptions = {
  drivers: [],
  vehicles: [],
  plants: [],
  candidates: [],
  failed: [],
};

/**
 * เรียงแบบไทย — ตัวเลขในชื่อเรียงตามค่า ไม่ใช่ตามตัวอักษร
 *
 * สร้าง `Collator` ครั้งเดียวแล้วใช้ซ้ำ — `localeCompare(…, "th", …)` เตรียมกติกาภาษาใหม่
 * ทุกครั้งที่เทียบ (รถ 1,409 คันวัดได้ 20 ms → 1.4 ms · ลำดับที่ได้เหมือนกันทุกตัว)
 */
const THAI_ORDER = new Intl.Collator("th", { numeric: true });
const thai = (a: PickOption, b: PickOption) => THAI_ORDER.compare(a.label, b.label);

async function loadDrivers(): Promise<DriverOption[]> {
  const docs = await readDrivers<{
    drivercode?: string;
    driverName?: string;
    branch?: string;
    vehicleCode?: string;
    active?: boolean;
  }>(["drivercode", "driverName", "branch", "vehicleCode", "active"]);

  return docs
    .filter((d) => d.active === true && (d.drivercode ?? "").trim())
    .map((d) => {
      const code = (d.drivercode ?? "").trim();
      const name = (d.driverName ?? "").trim() || code;
      const site = siteLabel((d.branch ?? "").trim());
      /* ป้ายมีทั้งชื่อ รหัส และสาขา เพราะช่องค้นหาของ `Select` ค้นจากป้าย —
         พิมพ์รหัสหรือชื่อสาขาก็เจอ ไม่ต้องจำว่าต้องพิมพ์อะไร */
      const vehicle = String(d.vehicleCode ?? "").trim();
      return {
        value: code,
        label: site ? `${name} — ${code} · ${site}` : `${name} — ${code}`,
        ...(vehicle ? { vehicle } : {}),
      };
    })
    .sort(thai);
}

/**
 * `fleet` ของ ETL → ลูกค้าในรายการ `CUSTOMERS` + ตำแหน่ง ML/MS (ถ้ามีท้ายชื่อ)
 * ชื่อ fleet ที่ไม่อยู่ในตารางนี้ (รถขาย · รถว่าง …) ไม่เติมอะไร ปล่อยให้คนเลือกเอง
 */
const FLEET_CUSTOMER: Record<string, string> = {
  acon: "Acon",
  asia: "Asia",
  cpac: "Cpac",
  fast: "Fast",
  kpac: "Kpac",
  orc: "ORC",
  scco: "SCCO",
  umo: "UMO",
  rp: "RP Concreate",
  "ที.เอ็น.ซีเมนต์บล็อค": "TN",
  จิรโชติ: "หจก.จิรโชติ",
};

function fromFleet(fleet: string): { customer?: string; position?: string } {
  const m = fleet.trim().match(/^(.*?)\s+(ML|MS)$/i);
  const base = (m ? m[1] : fleet).trim().toLowerCase();
  const customer = FLEET_CUSTOMER[base];
  const position = m ? m[2].toUpperCase() : undefined;
  return { ...(customer ? { customer } : {}), ...(position ? { position } : {}) };
}

async function loadVehicles(): Promise<{ vehicles: VehicleOption[]; plants: PickOption[] }> {
  const vehicleCol = await etlCol<{
    code?: string;
    plate_no?: string;
    brand?: string;
    plant?: string;
    fleet?: string;
  }>("vehicles");
  const docs = await vehicleCol
    .find(
      { active: true },
      { projection: { code: 1, plate_no: 1, brand: 1, plant: 1, fleet: 1 } },
    )
    .toArray();

  const vehicles = docs
    .filter((v) => (v.code ?? "").trim() || (v.plate_no ?? "").trim())
    .map((v) => {
      const code = (v.code ?? "").trim();
      const plate = (v.plate_no ?? "").trim();
      const rest = [plate, (v.brand ?? "").trim(), (v.plant ?? "").trim()]
        .filter(Boolean)
        .join(" · ");
      /* เลือกด้วย `code` เมื่อมี ไม่งั้นใช้ทะเบียน — `vehicle()` ใน `store.ts`
         ค้นด้วยทั้งสองฟิลด์อยู่แล้ว เพราะบางสาขาเรียกรถด้วยทะเบียนล้วน */
      const plant = (v.plant ?? "").trim();
      return {
        value: code || plate,
        label: code ? `${code} — ${rest}` : rest,
        plate,
        brand: (v.brand ?? "").trim(),
        ...(plant && plant !== "Unknown" ? { plant } : {}),
        ...fromFleet(v.fleet ?? ""),
      };
    })
    .sort(thai);

  const plants = [...new Set(docs.map((v) => (v.plant ?? "").trim()).filter(Boolean))]
    .map((p) => ({ value: p, label: p }))
    .sort(thai);

  return { vehicles, plants };
}

async function loadCandidates(): Promise<PickOption[]> {
  /* คำตอบทั้งใบมาด้วยเพราะนามสกุลอยู่ในนั้น (`fullNameOf()`) — ดึงเฉพาะใบที่ผูกได้
     ตั้งแต่ในคิวรีไม่ได้ เพราะสถานะเก่าต้องแปลงก่อน (ดูคอมเมนต์ข้างล่าง) ·
     สำเนาฟอร์มมาทีละรุ่นผ่าน `readApplicationsWithSnapshot()` ไม่ใช่ ~31 KB ซ้ำทุกใบ */
  const docs = await readApplicationsWithSnapshot<{
    ref?: string;
    fullName?: string;
    status?: unknown;
    answers?: AnswerMap;
  }>([{ $sort: { createdAt: -1 } }], { ref: 1, fullName: 1, status: 1, answers: 1 });

  return docs
    /* กรองด้วย `normalizeStatus()` ไม่ใช่ `$in` ในคิวรี — ใบเก่ายังถือสถานะชุดเดิม
       (`offer` / `hired`) ที่ต้องแปลงตอนอ่าน ดู `LEGACY_STATUS` ใน `_lib/types.ts` */
    .filter((d) => LINKABLE_STATUSES.includes(normalizeStatus(d.status)))
    .map((d) => {
      const ref = (d.ref ?? "").trim();
      const name = fullNameOf(d) || ref;
      return { value: d._id.toHexString(), label: ref ? `${name} — ${ref}` : name };
    });
}

/**
 * อ่านทุกชุดพร้อมกัน — ไม่มีชุดไหนขึ้นกับชุดอื่น การรอทีละอันคือการต่อเวลา
 * โหลดหน้าฟรี ๆ · ชุดที่พังไม่ลากชุดที่เหลือลงไปด้วย (`allSettled`)
 */
export async function getRequisitionOptions(): Promise<RequisitionOptions> {
  const [drivers, vehicles, candidates] = await Promise.allSettled([
    loadDrivers(),
    loadVehicles(),
    loadCandidates(),
  ]);

  const failed: string[] = [];
  if (drivers.status === "rejected") failed.push("ทะเบียนประวัติ พจส.");
  if (vehicles.status === "rejected") failed.push("ทะเบียนรถ");
  if (candidates.status === "rejected") failed.push("รายชื่อผู้สมัคร");

  return {
    ...EMPTY,
    drivers: drivers.status === "fulfilled" ? drivers.value : [],
    vehicles: vehicles.status === "fulfilled" ? vehicles.value.vehicles : [],
    plants: vehicles.status === "fulfilled" ? vehicles.value.plants : [],
    candidates: candidates.status === "fulfilled" ? candidates.value : [],
    failed,
  };
}

/**
 * แค่รายชื่อรถ — ใช้ที่หน้าติดตามฝึกงานตอนผูกทะเบียนรถให้ พจส. ที่กำลังฝึกอยู่
 * แยกจาก `getRequisitionOptions()` เพราะหน้านั้นไม่ต้องการ พจส./ผู้สมัครเลย
 * ดึงมาทั้งก้อนคือของที่ไม่ได้ใช้ข้ามเน็ตเปล่า ๆ
 */
export async function getVehicleOptions(): Promise<PickOption[]> {
  try {
    return (await loadVehicles()).vehicles;
  } catch {
    return [];
  }
}
