import { normalizeNationalId, normalizePlate } from "./normalize";
import type { EtlDriverRow, PartnerDriverRow } from "./headcount";
import type { EtlCandidate, PartnerCandidate } from "./match";

/**
 * แปลงเอกสารดิบสองฝั่ง → แถวที่ matcher / headcount / conflicts ใช้ — **pure**
 *
 * แยกจาก `repo.ts` เพื่อให้กติกาการแปลง (ทะเบียนมาจากไหน ใครคือคนเดียวกัน) ทดสอบได้โดยไม่ต่อฐาน
 */

/** `mena_partner.drivers` — เฉพาะฟิลด์ที่ขอมา (`repo.ts` ฉาย projection ตามนี้) */
export interface RawPartnerDriver {
  _id?: unknown;
  contractCode?: unknown;
  prefix?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  nationalId?: unknown;
  status?: unknown;
  isTruckOwner?: unknown;
  isDriver?: unknown;
  licensePlate?: unknown;
}

/** `mena_partner.contracts` — ทะเบียนรถอยู่ที่นี่ */
export interface RawContract {
  contractCode?: unknown;
  licensePlate?: unknown;
  status?: unknown;
}

/** หนึ่งแถวจาก `readDrivers()` ของ `master.ts` (+ เลขบัตรถ้าตั้ง `ETL_NATIONAL_ID_FIELD`) */
export interface RawEtlDriver {
  drivercode?: unknown;
  driverName?: unknown;
  ownerType?: unknown;
  vehicleCode?: unknown;
  active?: unknown;
  statusOverride?: unknown;
  nationalId?: unknown;
}

/** `Boom_ETL.vehicles` — แค่เลขรถกับทะเบียน */
export interface RawVehicle {
  code?: unknown;
  plate_no?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** รหัสคนขับที่ไม่ใช่เจ้าของรถ `MTM145-01` → สัญญาแม่ `MTM145` (ทะเบียนอยู่ที่สัญญาแม่) */
export const baseContractCode = (code: string): string => code.replace(/-\d+$/, "");

export function partnerFullName(d: RawPartnerDriver): string {
  const first = str(d.firstName);
  const last = str(d.lastName);
  return `${str(d.prefix)}${first}${last ? ` ${last}` : ""}`.trim();
}

/**
 * ฝั่งรถร่วม → แถวต่อสัญญา (matcher) + แถวต่อคน (headcount)
 *
 * - ทะเบียน: `contracts` ของรหัสนั้น → ของสัญญาแม่ → ที่จดไว้ในเอกสารคนขับเอง
 * - คนเดียวกัน = เลขบัตร 13 หลักเดียวกัน · ไม่มีเลขบัตร = เอกสารเดียว (`_id`) ไม่เดาจากชื่อ
 */
export function toPartnerSide(
  drivers: readonly RawPartnerDriver[],
  contracts: readonly RawContract[],
): { candidates: PartnerCandidate[]; people: PartnerDriverRow[] } {
  const plateByContract = new Map<string, string>();
  for (const c of contracts) {
    const code = str(c.contractCode);
    const plate = str(c.licensePlate);
    // สัญญารหัสซ้ำ: ตัวที่ active ชนะ (ท่าเดียวกับ driver-state.ts ของรถร่วม)
    if (code && plate && (!plateByContract.has(code) || str(c.status) === "active")) {
      plateByContract.set(code, plate);
    }
  }

  const candidates: PartnerCandidate[] = [];
  const people = new Map<string, PartnerDriverRow>();

  drivers.forEach((d, i) => {
    const contractCode = str(d.contractCode);
    const nationalId = normalizeNationalId(d.nationalId);
    const id = str(d._id) || (contractCode ? `contract:${contractCode}` : `row:${i}`);
    const personKey = nationalId ? `nid:${nationalId}` : `id:${id}`;
    const name = partnerFullName(d);
    const active = str(d.status) === "active";
    const plate =
      plateByContract.get(contractCode) ??
      plateByContract.get(baseContractCode(contractCode)) ??
      (str(d.licensePlate) || null);

    if (contractCode) {
      candidates.push({ contractCode, personKey, name, nationalId, licensePlate: plate, active });
    }

    const isTruckOwner = d.isTruckOwner === true;
    // ไม่มีธง = ข้อมูลเก่าก่อนมีธง ถือว่าขับ
    const isDriver = d.isDriver !== false;
    const prev = people.get(personKey);
    if (!prev) {
      people.set(personKey, {
        personKey,
        name,
        active,
        isTruckOwner,
        isDriver,
        contractCodes: contractCode ? [contractCode] : [],
      });
    } else {
      prev.active ||= active;
      prev.isTruckOwner ||= isTruckOwner;
      prev.isDriver ||= isDriver;
      if (contractCode && !prev.contractCodes.includes(contractCode)) prev.contractCodes.push(contractCode);
    }
  });

  return { candidates, people: [...people.values()] };
}

/** active ของทะเบียน พจส. = ค่าที่ฝ่ายบุคคลกดทับ (`statusOverride`) ก่อน แล้วค่อย ETL */
export function etlActive(d: RawEtlDriver): boolean {
  const override = str(d.statusOverride);
  if (override === "active") return true;
  if (override === "resigned") return false;
  return d.active === true;
}

/**
 * ฝั่ง ETL → แถวของ matcher + headcount
 *
 * `vehicleCode` ใน `main_driver` เป็นเลขรถบ้าง ทะเบียนบ้างแล้วแต่สาขา — หาใน `vehicles` ทั้งสองคีย์
 * (ท่าเดียวกับ `registry.ts`) หาไม่เจอแต่หน้าตาเป็นทะเบียน ใช้ค่าดิบนั้นเลย
 */
export function toEtlSide(
  drivers: readonly RawEtlDriver[],
  vehicles: readonly RawVehicle[],
): { candidates: EtlCandidate[]; rows: EtlDriverRow[] } {
  const plateByRef = new Map<string, string>();
  for (const v of vehicles) {
    const plate = str(v.plate_no);
    if (!plate) continue;
    const code = str(v.code);
    if (code) plateByRef.set(code, plate);
    if (!plateByRef.has(plate)) plateByRef.set(plate, plate);
  }

  const candidates: EtlCandidate[] = [];
  const rows: EtlDriverRow[] = [];
  for (const d of drivers) {
    const drivercode = str(d.drivercode);
    if (!drivercode) continue;
    const name = str(d.driverName);
    const ownerType = str(d.ownerType) || null;
    const active = etlActive(d);
    const ref = str(d.vehicleCode);
    const plateNo = plateByRef.get(ref) ?? (/^\d{6}$/.test(normalizePlate(ref) ?? "") ? ref : null);

    candidates.push({
      drivercode,
      name,
      nationalId: normalizeNationalId(d.nationalId),
      plateNo,
      ownerType,
      active,
    });
    rows.push({ drivercode, name, ownerType, active });
  }
  return { candidates, rows };
}
