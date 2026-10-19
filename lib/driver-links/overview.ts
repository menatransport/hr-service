import { findConflicts } from "./conflicts";
import { HEADCOUNT_ASSUMPTIONS, computeHeadcount, type HeadcountOptions } from "./headcount";
import { ETL_NATIONAL_ID_FIELD, proposeMatches } from "./match";
import { toEtlSide, toPartnerSide, type RawContract, type RawEtlDriver, type RawPartnerDriver, type RawVehicle } from "./rows";
import type { DriverLinksOverview, LinkDoc, LinkView } from "./types";

/** ข้อมูลดิบที่ `repo.loadSources()` อ่านมา */
export interface DriverLinkSources {
  partnerDrivers: RawPartnerDriver[];
  contracts: RawContract[];
  etlDrivers: RawEtlDriver[];
  vehicles: RawVehicle[];
}

/** ประกอบภาพรวมทั้งหน้า (ข้อเสนอ · คู่ · ตัวเลข · ขัดแย้ง) จากข้อมูลดิบ — **pure** */
export function buildOverview(
  src: DriverLinkSources,
  links: readonly LinkDoc[],
  { now = new Date(), ...options }: HeadcountOptions & { now?: Date } = {},
): DriverLinksOverview {
  const partner = toPartnerSide(src.partnerDrivers, src.contracts);
  const etl = toEtlSide(src.etlDrivers, src.vehicles);
  const linkRows = links.map((l) => ({ contractCode: l.contractCode, drivercode: l.drivercode }));

  const candByContract = new Map(partner.candidates.map((c) => [c.contractCode, c]));
  const etlByCode = new Map(etl.candidates.map((e) => [e.drivercode, e]));

  const views: LinkView[] = links.map((l) => {
    const p = candByContract.get(l.contractCode);
    const e = etlByCode.get(l.drivercode);
    const at = l.confirmedAt instanceof Date ? l.confirmedAt : new Date(l.confirmedAt);
    return {
      contractCode: l.contractCode,
      drivercode: l.drivercode,
      matchedBy: l.matchedBy,
      confidence: l.confidence,
      confirmedBy: l.confirmedBy,
      confirmedByName: l.confirmedByName,
      confirmedAt: Number.isNaN(at.getTime()) ? "" : at.toISOString(),
      note: l.note ?? null,
      partnerName: p?.name ?? null,
      partnerActive: p?.active ?? null,
      etlName: e?.name ?? null,
      etlActive: e?.active ?? null,
      etlOwnerType: e?.ownerType ?? null,
    };
  });
  views.sort((a, b) => a.contractCode.localeCompare(b.contractCode));

  return {
    generatedAt: now.toISOString(),
    proposals: proposeMatches(partner.candidates, etl.candidates, new Set(linkRows.map((l) => l.contractCode))),
    links: views,
    headcount: computeHeadcount(etl.rows, partner.people, linkRows, options),
    conflicts: findConflicts(etl.rows, partner.people, linkRows),
    nationalIdField: ETL_NATIONAL_ID_FIELD,
    assumptions: HEADCOUNT_ASSUMPTIONS,
    partnerContracts: partner.candidates.length,
  };
}
