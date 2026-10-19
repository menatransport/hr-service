import { normalizeName } from "./normalize";
import type { EtlDriverRow, LinkRow, PartnerDriverRow } from "./headcount";

/**
 * คู่ที่ยืนยันแล้วแต่สองฝั่งพูดไม่ตรงกัน — **pure · ไม่แก้อะไรเอง** แค่ยกขึ้นมาให้คนเคาะ
 *
 * คนที่ยังไม่มีคู่ **ไม่ใช่** ขัดแย้ง (เป็นสถานะปกติ) จึงไม่อยู่ในรายการนี้
 */

/** ป้ายบนหน้าจอ — รายการขัดแย้งห้ามไปขวางการจ่ายเงิน */
export const PAYMENT_SOURCE_NOTE = "การจ่ายเงินรถร่วมยึดสถานะฝั่งรถร่วม รายการนี้ไม่ไปเปลี่ยนยอดจ่าย";

export type ConflictKind = "status" | "name" | "missingDriver" | "missingContract";

export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  status: "สถานะไม่ตรงกัน",
  name: "ชื่อไม่ตรงกัน",
  missingDriver: "ไม่มีรหัสนี้ในทะเบียน พจส. แล้ว",
  missingContract: "ไม่มีสัญญานี้ในรถร่วมแล้ว",
};

export interface Conflict {
  kind: ConflictKind;
  contractCode: string;
  drivercode: string;
  partnerName: string | null;
  etlName: string | null;
  partnerActive: boolean | null;
  etlActive: boolean | null;
  detail: string;
}

export function findConflicts(
  etl: readonly EtlDriverRow[],
  partner: readonly PartnerDriverRow[],
  links: readonly LinkRow[],
): Conflict[] {
  const etlByCode = new Map(etl.map((e) => [e.drivercode, e]));
  const personByContract = new Map<string, PartnerDriverRow>();
  for (const d of partner) for (const c of d.contractCodes) personByContract.set(c, d);

  const out: Conflict[] = [];
  for (const { contractCode, drivercode } of links) {
    const d = personByContract.get(contractCode) ?? null;
    const e = etlByCode.get(drivercode) ?? null;
    const base = {
      contractCode,
      drivercode,
      partnerName: d?.name ?? null,
      etlName: e?.name ?? null,
      partnerActive: d?.active ?? null,
      etlActive: e?.active ?? null,
    };

    if (!d) {
      out.push({ ...base, kind: "missingContract", detail: `สัญญา ${contractCode} ไม่อยู่ในรายชื่อคนขับรถร่วมแล้ว` });
    }
    if (!e) {
      out.push({ ...base, kind: "missingDriver", detail: `รหัส ${drivercode} ไม่อยู่ในทะเบียน พจส. แล้ว` });
    }
    if (!d || !e) continue;

    if (d.active !== e.active) {
      out.push({
        ...base,
        kind: "status",
        detail: d.active
          ? "รถร่วมยังทำงานอยู่ แต่ทะเบียน พจส. ขึ้นว่าพ้นสภาพแล้ว"
          : "รถร่วมพ้นสภาพแล้ว แต่ทะเบียน พจส. ยังขึ้นว่าทำงานอยู่",
      });
    }
    if (normalizeName(d.name) !== normalizeName(e.name)) {
      out.push({ ...base, kind: "name", detail: `รถร่วมเขียน "${d.name}" · ทะเบียน พจส. เขียน "${e.name}"` });
    }
  }
  return out;
}
