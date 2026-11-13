import { etlCol } from "@/lib/db";
import { readDrivers } from "@/app/recruitment/_lib/drivers/master";
import { siteLabel, siteOfBranch } from "@/app/recruitment/_lib/drivers/types";
import { normalizeStatus, type AnswerMap } from "@/app/recruitment/_lib/types";
import {
  fullNameOf,
  readApplicationsWithSnapshot,
} from "@/app/recruitment/_lib/applications";
import { LINKABLE_STATUSES } from "./types";
import { getRepairStatuses, type RepairStatus } from "./repair-status";

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
  /** ชื่อสาขา (`siteLabel`) — ฟอร์มเติมช่องสาขาให้เมื่อเลือกคนนี้เป็นคนที่จะแทน */
  branch?: string;
  /** ลูกค้า · แพล้นท์ · ตำแหน่งตามทะเบียน — สระบุรี/บางปะกงเติมให้เมื่อเลือกคนนี้เป็นคนที่จะแทน */
  customer?: string;
  plant?: string;
  position?: string;
}

/**
 * แพล้นท์ของสาขาที่ไม่ใช่งานโม่ (สระบุรี + บางปะกง รวมกันเหมือนแท็บสาขาของทะเบียน) จากทะเบียนประวัติ พจส.
 * — หนึ่งแถวต่อ ลูกค้า·แพล้นท์·ตำแหน่ง · `count` = จำนวนคนในทะเบียน (รวมพ้นสภาพ) ใช้เรียง
 */
export interface RegistryPlant {
  customer: string;
  plant: string;
  position: string;
  count: number;
}

/**
 * รถ + ค่าที่อ่านออกจาก `fleet` ของ ETL (`Cpac ML` → ลูกค้า Cpac ตำแหน่ง ML)
 * — ฟอร์มใช้เติมลูกค้า/ตำแหน่ง/แพล้นท์ให้ คนกรอกจะได้ไม่ต้องพิมพ์ซ้ำ
 */
export interface VehicleOption extends PickOption {
  plate?: string;
  brand?: string;
  /** ประเภทรถ เช่น “Mixer 10 ล้อ” — ขึ้นในขั้นยานยนต์ของเส้นทาง พจส.ใหม่ */
  type?: string;
  plant?: string;
  /** `branch` ของ ETL ตรงกับ `BRANCHES` — ฟอร์มใช้จับกลุ่มลูกค้า/แพล้นท์ตามสาขา */
  branch?: string;
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
  /** ทะเบียน → สถานะซ่อมปัจจุบัน **เฉพาะคันที่ไม่ปกติ** (ดู `repair-status.ts`) */
  repairs: Record<string, RepairStatus>;
  /**
   * อ่านชุดไหนไม่สำเร็จบ้าง — หน้าจอขึ้นแถบเตือนแล้ว**ยังใช้งานต่อได้**
   * คำขอที่บันทึกไว้แล้วไม่ได้ขึ้นกับตัวเลือกพวกนี้เลย
   */
  failed: string[];
  /** ลูกค้าของสาขาที่ไม่ใช่งานโม่ (สระบุรี/บางปะกง) → ชื่อลูกค้าในทะเบียน — ดู `loadBranchCustomers()` */
  branchCustomers: Record<string, string[]>;
  /** แพล้นท์/ตำแหน่งของสระบุรี+บางปะกง — ดู `loadRegistryPlants()` */
  registryPlants: RegistryPlant[];
}

const EMPTY: RequisitionOptions = {
  drivers: [],
  vehicles: [],
  plants: [],
  candidates: [],
  repairs: {},
  failed: [],
  branchCustomers: {},
  registryPlants: [],
};

/**
 * เรียงแบบไทย — ตัวเลขในชื่อเรียงตามค่า ไม่ใช่ตามตัวอักษร
 *
 * สร้าง `Collator` ครั้งเดียวแล้วใช้ซ้ำ — `localeCompare(…, "th", …)` เตรียมกติกาภาษาใหม่
 * ทุกครั้งที่เทียบ (รถ 1,409 คันวัดได้ 20 ms → 1.4 ms · ลำดับที่ได้เหมือนกันทุกตัว)
 */
const THAI_ORDER = new Intl.Collator("th", { numeric: true });
const thai = (a: PickOption, b: PickOption) => THAI_ORDER.compare(a.label, b.label);

export async function loadDrivers(): Promise<DriverOption[]> {
  const docs = await readDrivers<{
    drivercode?: string;
    driverName?: string;
    branch?: string;
    vehicleCode?: string;
    customer?: string;
    plant?: string;
    position?: string;
    active?: boolean;
  }>(["drivercode", "driverName", "branch", "vehicleCode", "customer", "plant", "position", "active"]);

  return docs
    .filter((d) => d.active === true && (d.drivercode ?? "").trim())
    .map((d) => {
      const code = (d.drivercode ?? "").trim();
      const name = (d.driverName ?? "").trim() || code;
      const site = siteLabel((d.branch ?? "").trim());
      /* ป้ายมีทั้งชื่อ รหัส และสาขา เพราะช่องค้นหาของ `Select` ค้นจากป้าย —
         พิมพ์รหัสหรือชื่อสาขาก็เจอ ไม่ต้องจำว่าต้องพิมพ์อะไร */
      const vehicle = String(d.vehicleCode ?? "").trim();
      const own = siteOfBranch((d.branch ?? "").trim());
      /* ลาดกระบังเติมลูกค้า/แพล้นท์/ตำแหน่งจาก fleet ของรถอยู่แล้ว — ส่งเฉพาะสาขาอื่น */
      const extra =
        own === "saraburi" || own === "bangpakong"
          ? {
              ...((d.customer ?? "").trim() ? { customer: (d.customer ?? "").trim() } : {}),
              ...((d.plant ?? "").trim() ? { plant: (d.plant ?? "").trim() } : {}),
              ...((d.position ?? "").trim() ? { position: (d.position ?? "").trim() } : {}),
            }
          : {};
      return {
        value: code,
        label: site ? `${name} — ${code} · ${site}` : `${name} — ${code}`,
        ...(vehicle ? { vehicle } : {}),
        ...(site ? { branch: site } : {}),
        ...extra,
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

export async function loadVehicles(): Promise<{ vehicles: VehicleOption[]; plants: PickOption[] }> {
  const vehicleCol = await etlCol<{
    code?: string;
    plate_no?: string;
    brand?: string;
    plant?: string;
    fleet?: string;
    vehicle_type?: string;
    branch?: string;
  }>("vehicles");
  const docs = await vehicleCol
    .find(
      { active: true },
      { projection: { code: 1, plate_no: 1, brand: 1, plant: 1, fleet: 1, vehicle_type: 1, branch: 1 } },
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
        ...((v.vehicle_type ?? "").trim() ? { type: (v.vehicle_type ?? "").trim() } : {}),
        ...(plant && plant !== "Unknown" ? { plant } : {}),
        ...((v.branch ?? "").trim() ? { branch: (v.branch ?? "").trim() } : {}),
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

/** สาขาในฟอร์มขออัตรา ↔ แท็บสาขาของทะเบียน พจส. (`DRIVER_SITES`) */
const BRANCH_SITE = { สระบุรี: "saraburi", บางปะกง: "bangpakong" } as const;

/**
 * ลูกค้าสระบุรี/บางปะกง = ชื่อลูกค้าในทะเบียนประวัติ พจส. ของสาขานั้น (TDM · SCCC …) เรียงตามจำนวนคน
 * · Bew 13 พ.ย. 2569 — แทนชื่อบริษัทเต็มจาก master NCAC / `BANGPAKONG_CUSTOMERS` เดิม
 * · นับรวมคนพ้นสภาพ (หลักเดียวกับ `loadRegistryPlants()`)
 */
export async function loadBranchCustomers(): Promise<Record<string, string[]>> {
  const docs = await readDrivers<{ branch?: string; customer?: string }>(["branch", "customer"]);
  const count = new Map<string, Map<string, number>>();
  for (const d of docs) {
    const site = siteOfBranch(String(d.branch ?? ""));
    const customer = (d.customer ?? "").trim();
    if (!customer || !site) continue;
    const row = count.get(site) ?? new Map<string, number>();
    row.set(customer, (row.get(customer) ?? 0) + 1);
    count.set(site, row);
  }
  return Object.fromEntries(
    Object.entries(BRANCH_SITE).map(([branch, site]) => [
      branch,
      [...(count.get(site) ?? new Map<string, number>()).entries()]
        .sort((a, b) => b[1] - a[1] || THAI_ORDER.compare(a[0], b[0]))
        .map(([name]) => name),
    ]),
  );
}

/**
 * แพล้นท์ + ตำแหน่งของสระบุรี/บางปะกงจากทะเบียนประวัติ พจส. (Bew 11 พ.ย. 2569) — ETL ไม่มีแพล้นท์ของสองสาขานี้
 * · นับรวมคนพ้นสภาพ แพล้นท์ที่ตอนนี้ไม่มีคนเหลือยังเลือกได้
 */
export async function loadRegistryPlants(): Promise<RegistryPlant[]> {
  const docs = await readDrivers<{ branch?: string; customer?: string; plant?: string; position?: string }>([
    "branch",
    "customer",
    "plant",
    "position",
  ]);
  const rows = new Map<string, RegistryPlant>();
  for (const d of docs) {
    const site = siteOfBranch(String(d.branch ?? ""));
    const plant = (d.plant ?? "").trim();
    if ((site !== "saraburi" && site !== "bangpakong") || !plant) continue;
    const customer = (d.customer ?? "").trim();
    const position = (d.position ?? "").trim();
    const key = `${customer}|${plant}|${position}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { customer, plant, position, count: 1 });
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || THAI_ORDER.compare(a.plant, b.plant));
}

/**
 * อ่านทุกชุดพร้อมกัน — ไม่มีชุดไหนขึ้นกับชุดอื่น การรอทีละอันคือการต่อเวลา
 * โหลดหน้าฟรี ๆ · ชุดที่พังไม่ลากชุดที่เหลือลงไปด้วย (`allSettled`)
 */
export async function getRequisitionOptions(): Promise<RequisitionOptions> {
  const [drivers, vehicles, candidates, repairs, branchCustomers, registryPlants] = await Promise.allSettled([
    loadDrivers(),
    loadVehicles(),
    loadCandidates(),
    getRepairStatuses(),
    loadBranchCustomers(),
    loadRegistryPlants(),
  ]);

  const failed: string[] = [];
  if (drivers.status === "rejected") failed.push("ทะเบียนประวัติ พจส.");
  if (vehicles.status === "rejected") failed.push("ทะเบียนรถ");
  if (candidates.status === "rejected") failed.push("รายชื่อผู้สมัคร");
  if (branchCustomers.status === "rejected") failed.push("ลูกค้าสระบุรี/บางปะกง (ทะเบียนประวัติ พจส.)");

  return {
    ...EMPTY,
    drivers: drivers.status === "fulfilled" ? drivers.value : [],
    vehicles: vehicles.status === "fulfilled" ? vehicles.value.vehicles : [],
    plants: vehicles.status === "fulfilled" ? vehicles.value.plants : [],
    candidates: candidates.status === "fulfilled" ? candidates.value : [],
    /* อ่านสถานะซ่อมไม่ได้ = ทุกคันขึ้นเป็นปกติ ไม่ใช่เรื่องที่ต้องขึ้นแถบเตือน */
    repairs: repairs.status === "fulfilled" ? repairs.value : {},
    /* อ่านไม่ได้ = ไม่มีรายการ ฟอร์มให้พิมพ์ชื่อลูกค้าเอง */
    branchCustomers: branchCustomers.status === "fulfilled" ? branchCustomers.value : {},
    /* อ่านไม่ได้ = รายการว่าง ฟอร์มยังพิมพ์เองได้ (ทะเบียนล่มขึ้นแถบเตือนจาก `drivers` อยู่แล้ว) */
    registryPlants: registryPlants.status === "fulfilled" ? registryPlants.value : [],
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
