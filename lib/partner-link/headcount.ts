import { resolveOwnerTypeKey, type OwnerTypeKey } from "@/app/recruitment/_lib/drivers/types";

/**
 * ตัวเลข "คนขับทั้งบริษัท" ตัวเดียว + รายการขัดแย้ง — **pure ใช้ได้ทั้ง server และ client**
 *
 * ```
 * total = etlActive + partnerActive − linkedDistinct
 * ```
 * - `etlActive`: คนใน ETL ที่ active (หลังทับ `statusOverride` แล้ว) ประเภท พจส./พจร./สแปร์
 * - `partnerActive`: คนขับของ partner ที่ active **และขับเองจริง** (เจ้าของรถที่ไม่ขับไม่นับ)
 *   นับเป็นคน (`partnerDriverId`) ไม่ใช่สัญญา — คนเดียวสองสัญญานับครั้งเดียว
 * - `linkedDistinct`: คนของ partner ที่ active และมีคู่ซึ่ง `drivercode` อยู่ใน `etlActive` —
 *   คือคนที่ถูกนับทั้งสองฝั่ง ต้องหักออกหนึ่งครั้ง
 *
 * **ข้อสมมติที่รอเจ้าของยืนยัน** อยู่ใน `HEADCOUNT_ASSUMPTIONS` — หน้าจอแสดงข้อความนี้คู่กับตัวเลขเสมอ
 */

export const HEADCOUNT_ASSUMPTIONS = [
  "เจ้าของรถที่ไม่ได้ขับเองไม่นับเป็นคนขับ",
  "คนเดียวที่มีหลายสัญญารถร่วมนับครั้งเดียว",
  "พจส.สแปร์นับรวมเป็นคนขับ · สนง ไม่นับ",
] as const;

/** ประเภทใน ETL ที่นับเป็นคนขับ */
export const DRIVER_OWNER_TYPES: readonly OwnerTypeKey[] = ["1", "2", "4"];

export interface EtlDriverRow {
  drivercode: string;
  ownerType: string | null;
  /** active หลังทับ `statusOverride` แล้ว */
  active: boolean;
}

export interface PartnerDriverRow {
  partnerDriverId: string;
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

export interface Headcount {
  etlActive: number;
  /** แยกตามประเภท ETL (`1` `2` `4`) */
  etlByType: Record<string, number>;
  partnerActive: number;
  linkedDistinct: number;
  total: number;
  /** partner active ที่ยังไม่มีคู่ — นับรวมใน total แล้ว แต่ยังไม่รู้ว่าเป็นใครใน ETL */
  partnerUnlinked: number;
  /** ส่วนต่าง พจร. ใน ETL กับคนขับรถร่วมใน partner (บวก = ETL มากกว่า) */
  partnerTypeGap: number;
}

export type ConflictKind = "status" | "ownerType" | "missingDriver" | "unlinkedActive";

export interface Conflict {
  kind: ConflictKind;
  partnerDriverId: string;
  partnerName: string;
  contractCode: string | null;
  drivercode: string | null;
  detail: string;
}

/** นับเป็นคนขับฝั่ง partner ไหม — ไม่มีธงเลยถือว่าขับ (ข้อมูลเก่าก่อนมีธง) */
export const countsAsPartnerDriver = (d: PartnerDriverRow): boolean =>
  d.active && !(d.isTruckOwner && !d.isDriver);

export function computeHeadcount(
  etl: readonly EtlDriverRow[],
  partner: readonly PartnerDriverRow[],
  links: readonly LinkRow[],
): Headcount {
  const etlByType: Record<string, number> = { "1": 0, "2": 0, "4": 0 };
  const etlActiveCodes = new Set<string>();
  for (const e of etl) {
    const t = resolveOwnerTypeKey(e.ownerType);
    if (!e.active || !t || !DRIVER_OWNER_TYPES.includes(t)) continue;
    if (etlActiveCodes.has(e.drivercode)) continue;
    etlActiveCodes.add(e.drivercode);
    etlByType[t] += 1;
  }

  const linkByContract = new Map(links.map((l) => [l.contractCode, l.drivercode]));
  const counted = partner.filter(countsAsPartnerDriver);

  let linkedDistinct = 0;
  let partnerUnlinked = 0;
  for (const d of counted) {
    const codes = d.contractCodes.map((c) => linkByContract.get(c)).filter(Boolean) as string[];
    if (codes.some((c) => etlActiveCodes.has(c))) linkedDistinct += 1;
    if (codes.length === 0) partnerUnlinked += 1;
  }

  const etlActive = etlActiveCodes.size;
  return {
    etlActive,
    etlByType,
    partnerActive: counted.length,
    linkedDistinct,
    total: etlActive + counted.length - linkedDistinct,
    partnerUnlinked,
    partnerTypeGap: etlByType["2"] - counted.length,
  };
}

/**
 * รายการที่สองฝั่งพูดไม่ตรงกัน — **ไม่แก้ให้เอง** แค่ยกขึ้นมาให้คนตัดสิน
 * (การจ่ายเงินยึดสถานะ partner เสมอ รายการพวกนี้ห้ามไปขวางการจ่าย)
 */
export function findConflicts(
  etl: readonly EtlDriverRow[],
  partner: readonly PartnerDriverRow[],
  links: readonly LinkRow[],
): Conflict[] {
  const etlByCode = new Map(etl.map((e) => [e.drivercode, e]));
  const linkByContract = new Map(links.map((l) => [l.contractCode, l.drivercode]));
  const out: Conflict[] = [];

  for (const d of partner) {
    const linked = d.contractCodes
      .map((c) => ({ contractCode: c, drivercode: linkByContract.get(c) }))
      .filter((x): x is { contractCode: string; drivercode: string } => Boolean(x.drivercode));

    if (linked.length === 0) {
      if (countsAsPartnerDriver(d)) {
        out.push({
          kind: "unlinkedActive",
          partnerDriverId: d.partnerDriverId,
          partnerName: d.name,
          contractCode: d.contractCodes[0] ?? null,
          drivercode: null,
          detail: "คนขับรถร่วมที่ยังทำงานอยู่ ยังไม่ได้จับคู่กับทะเบียน พจส.",
        });
      }
      continue;
    }

    for (const { contractCode, drivercode } of linked) {
      const base = { partnerDriverId: d.partnerDriverId, partnerName: d.name, contractCode, drivercode };
      const e = etlByCode.get(drivercode);
      if (!e) {
        out.push({ ...base, kind: "missingDriver", detail: `รหัส ${drivercode} ไม่มีในทะเบียนแล้ว` });
        continue;
      }
      if (e.active !== d.active) {
        out.push({
          ...base,
          kind: "status",
          detail: d.active
            ? "รถร่วมยังทำงานอยู่ แต่ทะเบียน พจส. บอกว่าพ้นสภาพแล้ว"
            : "รถร่วมพ้นสภาพแล้ว แต่ทะเบียน พจส. ยังเป็นปฏิบัติงาน",
        });
      }
      if (resolveOwnerTypeKey(e.ownerType) !== "2") {
        out.push({
          ...base,
          kind: "ownerType",
          detail: `ทะเบียน พจส. ระบุประเภทเป็น "${(e.ownerType ?? "").trim() || "ว่าง"}" ไม่ใช่ พจร.`,
        });
      }
    }
  }
  return out;
}
