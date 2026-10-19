import { resolveOwnerTypeKey } from "@/app/recruitment/_lib/drivers/types";

import { normalizeName, normalizeNationalId, normalizePlate } from "./normalize";

export { normalizeName, normalizeNationalId, normalizePlate } from "./normalize";

/**
 * ตัวเสนอคู่ คนขับรถร่วม (สัญญาใน `mena_partner`) ↔ `drivercode` (ทะเบียน พจส.) — **pure ใช้ได้ทั้ง server และ client**
 *
 * ไฟล์นี้ **เสนอ** อย่างเดียว ไม่เคยตัดสิน: ทุกคู่ต้องมีคนกดยืนยันก่อนลง `partner_driver_links`
 * (ดู `repo.ts`) · ระดับความมั่นใจมีไว้เรียงคิวให้คนตรวจ ไม่ได้ใช้ข้ามการยืนยัน
 *
 * | สัญญาณ | ระดับ |
 * |---|---|
 * | เลขบัตร 13 หลักตรงกัน (เฉพาะเมื่อ ETL มีฟิลด์) | `high` |
 * | ชื่อ-สกุลตรง (หลังลดรูป) + ทะเบียนตรง | `medium` |
 * | ชื่อ-สกุลตรงอย่างเดียว | `low` |
 *
 * ชั้นที่ดีที่สุดมีเกินหนึ่งคน = `ambiguous` ทุกคนถูกลดเป็น `low` และหน้าจอบังคับให้เลือกเอง
 *
 * **`staffCode` ของ partner (ชุด `MTM###`) ไม่ใช่ `drivercode`** — partner ออกเลขเอง ห้ามเอามาเป็นสัญญาณ
 */

/**
 * ชื่อฟิลด์เลขบัตรประชาชนใน `Boom_ETL.main_driver` — **ยังไม่รู้ว่ามีหรือไม่** (19 ต.ค. 2569)
 *
 * `null` = ไม่มี ตัวจับคู่ใช้แค่ชื่อ (+ทะเบียน) · ถ้าเจ้าของยืนยันชื่อฟิลด์แล้ว ตั้งที่นี่ที่เดียว
 * (สคริปต์ `scripts/driver-links-dryrun.mjs` รายงานว่าฟิลด์ไหนหน้าตาเหมือนเลขบัตร)
 */
export const ETL_NATIONAL_ID_FIELD: string | null = null;

export type MatchedBy = "nationalId" | "name+plate" | "name" | "manual";
export type Confidence = "high" | "medium" | "low";

/** แถวฝั่ง partner หนึ่งแถว = หนึ่งสัญญา (`drivers.contractCode`) */
export interface PartnerCandidate {
  contractCode: string;
  /** คีย์ตัวตนฝั่ง partner (เลขบัตรถ้ามี ไม่งั้น `_id`) — คนเดียวหลายสัญญาได้คีย์เดียวกัน */
  personKey: string;
  /** ชื่อเต็มตามที่ partner เก็บ (มีคำนำหน้าก็ได้) */
  name: string;
  nationalId: string | null;
  licensePlate: string | null;
  /** สถานะคนขับใน partner (`drivers.status === "active"`) */
  active: boolean;
}

/** แถวฝั่ง ETL หนึ่งแถว = หนึ่ง `drivercode` */
export interface EtlCandidate {
  drivercode: string;
  name: string;
  nationalId: string | null;
  /** ทะเบียนรถที่ขับอยู่ (เด้งจาก `vehicles` แล้ว) */
  plateNo: string | null;
  ownerType: string | null;
  active: boolean;
}

export interface MatchCandidate {
  drivercode: string;
  name: string;
  ownerType: string | null;
  plateNo: string | null;
  active: boolean;
  matchedBy: Exclude<MatchedBy, "manual">;
  confidence: Confidence;
}

export interface MatchProposal {
  contractCode: string;
  personKey: string;
  partnerName: string;
  licensePlate: string | null;
  partnerActive: boolean;
  /** เรียงดีสุดก่อน · ว่าง = ไม่เจอใครเลย (ปกติ ไม่ใช่ error) */
  candidates: MatchCandidate[];
  /** มีผู้สมัครเกินหนึ่งคนในชั้นที่ดีที่สุด — ต้องให้คนเลือก */
  ambiguous: boolean;
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };
const BEST_RANK = (p: MatchProposal) => (p.candidates[0] ? RANK[p.candidates[0].confidence] : 3);

function score(
  p: PartnerCandidate,
  e: EtlCandidate,
): { matchedBy: MatchCandidate["matchedBy"]; confidence: Confidence } | null {
  const pid = normalizeNationalId(p.nationalId);
  const eid = normalizeNationalId(e.nationalId);
  if (pid && eid && pid === eid) return { matchedBy: "nationalId", confidence: "high" };

  const pn = normalizeName(p.name);
  if (!pn || pn !== normalizeName(e.name)) return null;

  const pp = normalizePlate(p.licensePlate);
  const ep = normalizePlate(e.plateNo);
  if (pp && ep && pp === ep) return { matchedBy: "name+plate", confidence: "medium" };
  return { matchedBy: "name", confidence: "low" };
}

/**
 * เสนอคู่ให้ทุกสัญญาที่ยังไม่มีคู่ — เรียงข้อเสนอ high → medium → low → ไม่มีผู้สมัคร
 * (ชั้นเดียวกัน: คนที่ยังทำงานก่อน แล้วตามรหัสสัญญา)
 *
 * @param linkedContracts สัญญาที่ยืนยันคู่ไปแล้ว — ไม่เสนอซ้ำ
 */
export function proposeMatches(
  partner: readonly PartnerCandidate[],
  etl: readonly EtlCandidate[],
  linkedContracts: ReadonlySet<string> = new Set(),
): MatchProposal[] {
  // ดัชนีชื่อ/เลขบัตร — ทะเบียนราว 2,600 แถว ไม่ต้องเทียบทุกคู่
  const byName = new Map<string, EtlCandidate[]>();
  const byId = new Map<string, EtlCandidate[]>();
  for (const e of etl) {
    const n = normalizeName(e.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), e]);
    const id = normalizeNationalId(e.nationalId);
    if (id) byId.set(id, [...(byId.get(id) ?? []), e]);
  }

  const proposals = partner
    .filter((p) => p.contractCode && !linkedContracts.has(p.contractCode))
    .map((p): MatchProposal => {
      const pool = new Map<string, EtlCandidate>();
      const id = normalizeNationalId(p.nationalId);
      for (const e of id ? (byId.get(id) ?? []) : []) pool.set(e.drivercode, e);
      for (const e of byName.get(normalizeName(p.name)) ?? []) pool.set(e.drivercode, e);

      const candidates: MatchCandidate[] = [];
      for (const e of pool.values()) {
        const s = score(p, e);
        if (s) {
          candidates.push({
            drivercode: e.drivercode,
            name: e.name,
            ownerType: e.ownerType,
            plateNo: e.plateNo,
            active: e.active,
            ...s,
          });
        }
      }

      // ดีสุดก่อน → พจร. ก่อน (แต่ไม่ตัดประเภทอื่น คนโยกกลุ่มได้) → active ก่อน → รหัสน้อยก่อน
      const isPartnerType = (c: MatchCandidate) => resolveOwnerTypeKey(c.ownerType) === "2";
      candidates.sort(
        (a, b) =>
          RANK[a.confidence] - RANK[b.confidence] ||
          Number(isPartnerType(b)) - Number(isPartnerType(a)) ||
          Number(b.active) - Number(a.active) ||
          a.drivercode.localeCompare(b.drivercode),
      );

      const top = candidates[0]?.confidence;
      const ambiguous = top !== undefined && candidates.filter((c) => c.confidence === top).length > 1;
      if (ambiguous) for (const c of candidates) c.confidence = "low";

      return {
        contractCode: p.contractCode,
        personKey: p.personKey,
        partnerName: p.name,
        licensePlate: p.licensePlate,
        partnerActive: p.active,
        candidates,
        ambiguous,
      };
    });

  return proposals.sort(
    (a, b) =>
      BEST_RANK(a) - BEST_RANK(b) ||
      Number(a.ambiguous) - Number(b.ambiguous) ||
      Number(b.partnerActive) - Number(a.partnerActive) ||
      a.contractCode.localeCompare(b.contractCode),
  );
}
