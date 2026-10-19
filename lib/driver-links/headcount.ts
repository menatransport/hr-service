import { resolveOwnerTypeKey, type OwnerTypeKey } from "@/app/recruitment/_lib/drivers/types";

/**
 * "คนขับทั้งบริษัท" ตัวเลขเดียว — **pure ใช้ได้ทั้ง server และ client**
 *
 * ```
 * total = ETL active (owner_type 1,2,4)  ∪  คนขับรถร่วม active ที่ยังไม่มีคู่  − ซ้ำที่จับคู่แล้ว
 *       = etlActive + partnerOnly
 * ```
 * - **ETL**: active หลังทับ `statusOverride` แล้ว · ประเภท พจส. / พจร. / พจส.สแปร์ (สนง ไม่นับ)
 * - **รถร่วม**: `drivers.status = active` นับเป็น "คน" (`personKey`) ไม่ใช่สัญญา
 *   เจ้าของรถที่ไม่ได้ขับเอง (`isTruckOwner && !isDriver`) ไม่นับ — ปิดได้ด้วย option
 * - **คนที่มีสองรหัส** (จับคู่แล้ว) นับครั้งเดียว: ยุบเข้า `drivercode` ที่จับคู่ไว้
 *   สองคนฝั่งรถร่วมที่ถูกจับเข้า `drivercode` เดียวกันก็นับเป็นคนเดียว
 *
 * **ข้อสมมติที่รอเจ้าของยืนยัน** อยู่ใน `HEADCOUNT_ASSUMPTIONS` — หน้าจอแสดงคู่กับตัวเลขเสมอ
 */

export const HEADCOUNT_ASSUMPTIONS = [
  "เจ้าของรถที่ไม่ได้ขับเองไม่นับเป็นคนขับ",
  "คนเดียวที่มีหลายสัญญารถร่วม นับครั้งเดียว",
  "พจส.สแปร์นับเป็นคนขับ · สนง ไม่นับ",
  "คนที่จับคู่แล้ว นับครั้งเดียว ถึงจะมีทั้งรหัส พจส. และรหัสสัญญา",
] as const;

/** ประเภทใน ETL ที่นับเป็นคนขับ */
export const DRIVER_OWNER_TYPES: readonly OwnerTypeKey[] = ["1", "2", "4"];

export interface EtlDriverRow {
  drivercode: string;
  name: string;
  ownerType: string | null;
  /** active หลังทับ `statusOverride` แล้ว */
  active: boolean;
}

/** หนึ่งคนฝั่งรถร่วม — รวมทุกสัญญาของคนนั้นแล้ว */
export interface PartnerDriverRow {
  personKey: string;
  name: string;
  active: boolean;
  isTruckOwner: boolean;
  isDriver: boolean;
  contractCodes: string[];
}

export interface LinkRow {
  contractCode: string;
  drivercode: string;
}

export interface HeadcountOptions {
  /** ตัดเจ้าของรถที่ไม่ได้ขับเองออก — ค่าเริ่ม `true` */
  excludeNonDrivingOwners?: boolean;
}

export interface Headcount {
  /** ตัวเลขคนขับทั้งบริษัท */
  total: number;
  /** ฝั่งทะเบียน พจส. (ETL) */
  etlActive: number;
  /** ฝั่งรถร่วม — คนที่ active และนับเป็นคนขับ (ก่อนหักซ้ำ) */
  partnerActive: number;
  /** คนรถร่วมที่ไม่ซ้ำกับ ETL (ไม่มีคู่ หรือคู่ไม่อยู่ใน ETL active) — ส่วนที่บวกเพิ่มจาก ETL */
  partnerOnly: number;
  /** คนรถร่วมที่ซ้ำกับ ETL active (นับแล้วทางฝั่ง ETL) — นับเป็น `drivercode` ไม่ซ้ำ */
  linkedBoth: number;
  /** เจ้าของรถที่ไม่ได้ขับเองและถูกตัดออก (เป็น 0 เมื่อปิด option) */
  excludedOwners: number;
  /** ETL แยกประเภท `1` `2` `4` */
  byType: Record<string, number>;
}

/** นับเป็นคนขับฝั่งรถร่วมไหม — ไม่มีธงเลยถือว่าขับ (ข้อมูลเก่าก่อนมีธง) */
export const isNonDrivingOwner = (d: Pick<PartnerDriverRow, "isTruckOwner" | "isDriver">): boolean =>
  d.isTruckOwner && !d.isDriver;

export function computeHeadcount(
  etl: readonly EtlDriverRow[],
  partner: readonly PartnerDriverRow[],
  links: readonly LinkRow[],
  { excludeNonDrivingOwners = true }: HeadcountOptions = {},
): Headcount {
  const byType: Record<string, number> = { "1": 0, "2": 0, "4": 0 };
  const etlActiveCodes = new Set<string>();
  for (const e of etl) {
    const t = resolveOwnerTypeKey(e.ownerType);
    if (!e.active || !t || !DRIVER_OWNER_TYPES.includes(t)) continue;
    if (etlActiveCodes.has(e.drivercode)) continue;
    etlActiveCodes.add(e.drivercode);
    byType[t] += 1;
  }

  const linkByContract = new Map(links.map((l) => [l.contractCode, l.drivercode]));

  let excludedOwners = 0;
  let partnerActive = 0;
  const people = new Set<string>(); // ทุกคนที่นับ — คีย์ `d:<drivercode>` หรือ `p:<personKey>`
  for (const code of etlActiveCodes) people.add(`d:${code}`);
  const overlapped = new Set<string>();
  const extraKeys = new Set<string>();

  for (const d of partner) {
    if (!d.active) continue;
    if (excludeNonDrivingOwners && isNonDrivingOwner(d)) {
      excludedOwners += 1;
      continue;
    }
    partnerActive += 1;

    const codes = d.contractCodes
      .map((c) => linkByContract.get(c))
      .filter((c): c is string => Boolean(c))
      .sort();
    // คู่ที่อยู่ใน ETL active ชนะ — คนนี้ถูกนับฝั่ง ETL แล้ว
    const inEtl = codes.find((c) => etlActiveCodes.has(c));
    if (inEtl) {
      overlapped.add(inEtl);
      continue;
    }
    const key = codes[0] ? `d:${codes[0]}` : `p:${d.personKey}`;
    people.add(key);
    extraKeys.add(key);
  }

  return {
    total: people.size,
    etlActive: etlActiveCodes.size,
    partnerActive,
    partnerOnly: extraKeys.size,
    linkedBoth: overlapped.size,
    excludedOwners,
    byType,
  };
}
