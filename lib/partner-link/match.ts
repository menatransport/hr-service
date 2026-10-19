import { resolveOwnerTypeKey } from "@/app/recruitment/_lib/drivers/types";

/**
 * ตัวเสนอคู่ คนขับรถร่วม (partner) ↔ `drivercode` (ETL) — **pure ใช้ได้ทั้ง server และ client**
 *
 * ไฟล์นี้ **เสนอ** อย่างเดียว ไม่เคยตัดสิน: ทุกคู่ต้องมีคนกดยืนยันก่อนลง
 * `partner_driver_links` (ดู `store.ts`) · ระดับความมั่นใจมีไว้เรียงคิวให้คนตรวจ
 * ไม่ได้ใช้ข้ามการยืนยัน
 *
 * **`staffCode` ของ partner (ชุด `MTM###`) ไม่ใช่ `drivercode`** — partner ออกเลขเอง
 * ห้ามเอามาเป็นสัญญาณจับคู่เด็ดขาด
 */

/**
 * ชื่อฟิลด์เลขบัตรประชาชนใน `Boom_ETL.main_driver` — **ยังไม่รู้ว่ามีหรือไม่** (19 ต.ค. 2569)
 *
 * `null` = ไม่มี ตัวจับคู่ใช้แค่ชื่อ (+ทะเบียน) · ถ้าเจ้าของยืนยันชื่อฟิลด์แล้วตั้งที่นี่ที่เดียว
 * คู่ที่เลขบัตรตรงจะขึ้นเป็น `high` ทันที (สคริปต์ dry-run รายงานให้ว่าฟิลด์ไหนมีค่า)
 */
export const ETL_NATIONAL_ID_FIELD: string | null = null;

export type MatchedBy = "nationalId" | "name+plate" | "name" | "manual";
export type Confidence = "high" | "medium" | "low";

/** แถวฝั่ง partner หนึ่งแถว = หนึ่งสัญญา (คนเดียวมีหลายสัญญาได้) */
export interface PartnerCandidate {
  contractCode: string;
  partnerDriverId: string | null;
  /** ชื่อเต็มตามที่ partner เก็บ (มีคำนำหน้าก็ได้) */
  name: string;
  nationalId: string | null;
  licensePlate: string | null;
  /** สถานะคนขับใน partner (`drivers.status`) */
  active: boolean;
}

/** แถวฝั่ง ETL หนึ่งแถว = หนึ่ง `drivercode` */
export interface EtlCandidate {
  drivercode: string;
  name: string;
  nationalId: string | null;
  /** ทะเบียนรถที่ขับอยู่ (จาก `vehicles` ถ้าหาได้) */
  plateNo: string | null;
  ownerType: string | null;
  active: boolean;
}

export interface MatchCandidate {
  drivercode: string;
  name: string;
  ownerType: string | null;
  active: boolean;
  matchedBy: Exclude<MatchedBy, "manual">;
  confidence: Confidence;
}

export interface MatchProposal {
  contractCode: string;
  partnerDriverId: string | null;
  partnerName: string;
  /** เรียงดีสุดก่อน · ว่าง = ไม่เจอใครเลย */
  candidates: MatchCandidate[];
  /** มีผู้สมัครเกินหนึ่งคนในชั้นที่ดีที่สุด — ต้องให้คนเลือก */
  ambiguous: boolean;
}

const PREFIXES = [
  "นางสาว",
  "น.ส.",
  "นาง",
  "นาย",
  "ด.ช.",
  "ด.ญ.",
  "ว่าที่ร้อยตรี",
  "ว่าที่ ร.ต.",
  "mrs.",
  "mrs",
  "mr.",
  "mr",
  "ms.",
  "ms",
  "miss",
];

/** ชื่อ-สกุลเป็นรูปเดียว: ตัดคำนำหน้า ตัดจุด ยุบช่องว่าง ตัวพิมพ์เล็ก */
export function normalizeName(raw: string | null | undefined): string {
  let s = (raw ?? "").normalize("NFC").trim().toLowerCase();
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of PREFIXES) {
      // คำนำหน้าภาษาอังกฤษต้องจบคำ ("mr john") ไม่งั้น "mrinal" จะโดนตัดเป็น "inal"
      const latin = /^[a-z]/.test(p) && !p.endsWith(".");
      if (s.startsWith(p) && (!latin || s.length === p.length || s[p.length] === " ")) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
  }
  return s.replace(/\./g, " ").replace(/\s+/g, " ").trim();
}

/** เลขบัตร 13 หลักเท่านั้น — ไม่ครบ/มีตัวอักษร = `null` (ไม่ใช้เป็นสัญญาณ) */
export function normalizeNationalId(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{13}$/.test(digits) ? digits : null;
}

/**
 * ทะเบียนเป็นรูปเดียว: ตัดช่องว่าง ขีด จุด และชื่อจังหวัดท้าย
 * (`"70-1234 กรุงเทพมหานคร"` → `"701234"`, `"สบ 70-1234"` → `"สบ701234"`)
 */
export function normalizePlate(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  // ชื่อจังหวัดคือคำท้ายที่ยาวกว่า 3 ตัวอักษรและไม่มีตัวเลข
  const parts = s.split(/\s+/);
  if (parts.length > 1 && !/\d/.test(parts[parts.length - 1]) && parts[parts.length - 1].length > 3) {
    parts.pop();
  }
  const out = parts.join("").replace(/[-.\s]/g, "");
  return out || null;
}

const RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

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
 * เสนอคู่ให้ทุกสัญญาที่ยังไม่มีคู่
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

  return partner
    .filter((p) => !linkedContracts.has(p.contractCode))
    .map((p) => {
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
            active: e.active,
            ...s,
          });
        }
      }

      // ดีสุดก่อน → พจร. ก่อน → active ก่อน → รหัสน้อยก่อน (ให้ผลคงที่)
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
        partnerDriverId: p.partnerDriverId,
        partnerName: p.name,
        candidates,
        ambiguous,
      };
    });
}
