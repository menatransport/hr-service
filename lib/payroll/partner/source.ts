import type { Document } from "mongodb";

import { PARTNER } from "../../db/registry.mjs";
import type { PeriodRef } from "../period";
import type { PartnerContract, PartnerEntry, PartnerLink } from "./adapter";
import { partnerMonthOf } from "./period";

/**
 * ชั้นอ่านของรายการรถร่วม — **ฝั่งเซิร์ฟเวอร์เท่านั้น · อ่านอย่างเดียว**
 *
 * - `mena_partner.payroll_entries` ของเดือนเดียว (ผ่าน `partnerCol()` — ห้ามใช้ `MONGO_DB`)
 * - `mena_partner.contracts` เฉพาะสัญญาที่มีแถวในเดือนนั้น (ทะเบียนรถ/ชื่อ — `payroll_entries` ไม่มี)
 * - `mena_partner.month_status` สถานะงวด (สถานะของรายการนี้มาจากการปิดงวดของ partner)
 * - `hr_service.partner_driver_links` คู่ที่คนยืนยันแล้ว (ผ่าน `hrCol()`)
 *
 * ทุกคิวรีมี projection เฉพาะฟิลด์ที่ใช้ และมีเพดานจำนวนแถว (fleet จริง ~170 สัญญา)
 * **การเข้าถึงฐานฉีดเข้ามาได้** (`deps`) เทสต์จึงตรวจรูปคิวรีได้โดยไม่ต่อ Mongo จริง
 */

/** เพดานแถวต่อเดือน — เกินนี้คือข้อมูลผิดปกติ ไม่ใช่ fleet โต ให้รู้ตัวแทนการลากทั้งคอลเลกชัน */
export const MAX_ROWS = 2_000;

/** ฟิลด์ของ `payroll_entries` ที่ adapter ใช้ — ไม่ดึง ledgerItems/extrasItems (ก้อนใหญ่ ไม่ได้ใช้) */
export const ENTRY_PROJECTION = {
  _id: 0,
  contractCode: 1,
  month: 1,
  workingDays: 1,
  tripCount: 1,
  transportFee: 1,
  ot: 1,
  attendanceAllowance: 1,
  fuelUnderRefund: 1,
  otherIncomeWHT: 1,
  otherIncomeNoWHT: 1,
  fuel: 1,
  fuelOverCharge: 1,
  gps: 1,
  repairInHouse: 1,
  repairOutside: 1,
  mgmtFee8pct: 1,
  labor: 1,
  tire: 1,
  tirePatch: 1,
  carWash: 1,
  taxInsurance: 1,
  installment: 1,
  repairInstallment: 1,
  downPaymentInstallment: 1,
  otherDeductWHT: 1,
  otherDeductNoWHT: 1,
  ledgerDeduction: 1,
  carryIn: 1,
  carryOut: 1,
  netPay: 1,
  payable: 1,
  whtBase: 1,
  whtAmount: 1,
  paidNet: 1,
} as const;

/** ส่วนของ `Collection` ที่ชั้นนี้ใช้ — แคบพอให้เทสต์ปลอมได้ */
export interface ReadCol {
  find(
    filter: Document,
    options: { projection: Document; limit?: number },
  ): { toArray(): Promise<Document[]> };
  findOne(filter: Document, options: { projection: Document }): Promise<Document | null>;
}

export interface PartnerSourceDeps {
  partner(name: string): Promise<ReadCol>;
  links(): Promise<ReadCol>;
}

/* โหลดตัวต่อฐานตอนเรียกจริงเท่านั้น — import ไฟล์นี้ (เช่นในเทสต์) จึงไม่แตะ client */
const defaultDeps: PartnerSourceDeps = {
  partner: async (name) => (await import("@/lib/partner/mongo")).partnerCol(name),
  links: async () => (await import("@/lib/db")).hrCol("partnerDriverLinks"),
};

/** สถานะงวดของ partner — `review` ในฐานคือ "ตรวจแล้ว" (เหมือนหน้าอนุมัติของ partner) */
export type PartnerPhase = "draft" | "checked" | "approved" | "locked";

export const normalizePhase = (raw: unknown): PartnerPhase => {
  if (raw === "approved" || raw === "locked" || raw === "checked") return raw;
  if (raw === "review") return "checked";
  return "draft";
};

export interface PartnerMonth {
  /** เดือนของ partner ที่อ่าน (ผ่าน `partnerMonthOf`) */
  month: string;
  phase: PartnerPhase;
  entries: PartnerEntry[];
  links: PartnerLink[];
  contracts: PartnerContract[];
  /** แตะเพดาน `MAX_ROWS` — ข้อมูลอาจไม่ครบ ต้องขึ้นเตือน */
  truncated: boolean;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function loadPartnerMonth(
  period: PeriodRef,
  deps: PartnerSourceDeps = defaultDeps,
): Promise<PartnerMonth> {
  const month = partnerMonthOf(period);

  const [entriesCol, statusCol] = await Promise.all([
    deps.partner(PARTNER.payrollEntries),
    deps.partner(PARTNER.monthStatus),
  ]);
  const [rawEntries, status] = await Promise.all([
    entriesCol.find({ month }, { projection: ENTRY_PROJECTION, limit: MAX_ROWS }).toArray(),
    statusCol.findOne({ month }, { projection: { _id: 0, phase: 1 } }),
  ]);

  const entries = rawEntries
    .filter((e) => str(e.contractCode))
    .map((e) => ({ ...e, contractCode: str(e.contractCode), month: str(e.month) || month }) as PartnerEntry);
  const codes = [...new Set(entries.map((e) => e.contractCode))];

  let links: PartnerLink[] = [];
  let contracts: PartnerContract[] = [];
  if (codes.length > 0) {
    const [linksCol, contractsCol] = await Promise.all([deps.links(), deps.partner(PARTNER.contracts)]);
    const [rawLinks, rawContracts] = await Promise.all([
      linksCol
        .find({ contractCode: { $in: codes } }, { projection: { _id: 0, contractCode: 1, drivercode: 1 }, limit: MAX_ROWS })
        .toArray(),
      contractsCol
        .find(
          { contractCode: { $in: codes } },
          { projection: { _id: 0, contractCode: 1, licensePlate: 1, driverName: 1 }, limit: MAX_ROWS },
        )
        .toArray(),
    ]);
    links = rawLinks
      .filter((l) => str(l.contractCode) && str(l.drivercode).trim())
      .map((l) => ({ contractCode: str(l.contractCode), drivercode: str(l.drivercode) }));
    contracts = rawContracts
      .filter((c) => str(c.contractCode))
      .map((c) => ({
        contractCode: str(c.contractCode),
        licensePlate: str(c.licensePlate) || undefined,
        driverName: str(c.driverName) || undefined,
      }));
  }

  return {
    month,
    phase: normalizePhase(status?.phase),
    entries,
    links,
    contracts,
    truncated: rawEntries.length >= MAX_ROWS,
  };
}
