import type { MoneyEffect } from "../classify";
import type { DimensionKey, Fact, Unit } from "../normalize";
import { SYSTEM_ITEMS } from "../registry";

/**
 * `payroll_entries` ของระบบรถร่วม → แถวมาตรฐาน (`Fact`) — **pure ใช้ได้ทั้ง server และ client**
 *
 * **ไม่คำนวณเงินใหม่** — เครื่องคิดเงินยังเป็น `lib/payroll-engine.ts` ของ mena-partner-driver
 * ไฟล์นี้แค่อ่านผลที่มันบันทึกไว้ (1 แถว/สัญญา/เดือน) แล้วคลี่เป็นแถวละช่องเงิน ให้เข้าท่อ
 * เดียวกับรายการจากไฟล์ (`sumByPayee()` ใน `normalize.ts` ใช้ได้ตรง ๆ)
 *
 * ## ข้อตกลงที่ไฟล์นี้รับประกัน (มีเทสต์)
 *
 * **ต่อสัญญา: Σ`เพิ่ม` − Σ`หัก` = `paidNet` ของแถวนั้นทุกสตางค์** — ยอดโอนสุทธิหลัง WHT 3%
 * ที่ partner โอนจริง ดังนั้นยอดรวมทั้งรายการ = `paidNet` รวมของ partner เสมอ
 *
 * วิธีทำให้เท่าแน่นอนทั้งที่แถวในฐานบางแถวไม่สอดคล้องกันเอง (แถวที่แก้ผ่าน `PUT` ของ
 * partner คำนวณยอดรวมด้วยสูตรเก่า `computePayroll()` ที่ไม่รู้จักช่องเฟส 5):
 * 1. ลงทุกช่องตาม `PARTNER_MEASURES` (เงินคิดเป็นสตางค์ ไม่บวก float)
 * 2. `carryOut` > 0 ลงเป็น `เพิ่ม` — ดูเหตุผลที่ `CARRY_OUT_LABEL`
 * 3. เหลือส่วนต่างเท่าไหร่ ลงเป็นบรรทัด `ADJUST_LABEL` (เพิ่มหรือหักตามเครื่องหมาย)
 *    **ไม่ซ่อน** — บรรทัดนี้คือธงว่าแถวนั้นของ partner ไม่สอดคล้องกันเอง หน้าสรุปนับให้เห็น
 *
 * ## คนที่ยังไม่จับคู่ ไม่ถูกบล็อก
 *
 * `payeeId` = `contractCode` **เสมอ** (เงินเข้าบัญชีตามสัญญา ไม่ใช่ตามรหัสพนักงาน — การจ่าย
 * ยึดสถานะของ partner) · `personId` = `drivercode` จาก `partner_driver_links` ถ้ามีคู่
 * ไม่มีคู่ = `""` + `dims.note = UNLINKED_NOTE` แถวยังขึ้นครบทุกช่อง
 */

export const PARTNER_ITEM_ID = "partner-mixer";

/** ต้องตรงกับทะเบียน — ถ้ามีใครเปลี่ยนเลขที่ registry แล้วลืมที่นี่ ให้พังตั้งแต่โหลดโมดูล */
if (!SYSTEM_ITEMS.some((item) => item.id === PARTNER_ITEM_ID)) {
  throw new Error(`ไม่พบรายการ ${PARTNER_ITEM_ID} ใน SYSTEM_ITEMS (lib/payroll/registry.ts)`);
}

/** ฟิลด์ของ `payroll_entries` ที่ adapter ใช้ — ชื่อตรงกับ `PayrollResult` ของ partner */
export interface PartnerEntry {
  contractCode: string;
  month: string;
  workingDays?: number;
  tripCount?: number;
  transportFee?: number;
  ot?: number;
  attendanceAllowance?: number;
  fuelUnderRefund?: number;
  otherIncomeWHT?: number;
  otherIncomeNoWHT?: number;
  fuel?: number;
  fuelOverCharge?: number;
  gps?: number;
  repairInHouse?: number;
  repairOutside?: number;
  mgmtFee8pct?: number;
  labor?: number;
  tire?: number;
  tirePatch?: number;
  carWash?: number;
  taxInsurance?: number;
  installment?: number;
  repairInstallment?: number;
  downPaymentInstallment?: number;
  otherDeductWHT?: number;
  otherDeductNoWHT?: number;
  ledgerDeduction?: number;
  carryIn?: number;
  carryOut?: number;
  netPay?: number;
  payable?: number;
  whtBase?: number;
  whtAmount?: number;
  paidNet?: number;
}

/** คู่ที่คนยืนยันแล้วใน `hr_service.partner_driver_links` */
export interface PartnerLink {
  contractCode: string;
  drivercode: string;
}

/** มิติเสริมจาก `mena_partner.contracts` — `payroll_entries` ไม่มีทะเบียนรถ/ชื่อ */
export interface PartnerContract {
  contractCode: string;
  licensePlate?: string;
  driverName?: string;
}

export type NumericField = Exclude<keyof PartnerEntry, "contractCode" | "month">;

export interface PartnerMeasure {
  field: NumericField;
  label: string;
  effect: MoneyEffect;
  unit: Unit;
  /** เหตุผลทางบัญชี — อ่านจาก `payroll-engine.ts` (ตำแหน่งในสูตร `totalIncome`/`totalDeductions`/`paidNet`) */
  why: string;
}

/**
 * ผังช่องเงิน partner → แถวมาตรฐาน · **ทุกช่องมีเหตุผล** และลำดับ = ลำดับในสลิปของ partner
 *
 * กติกา: ช่องที่อยู่ใน `totalIncome` ของ engine = `เพิ่ม` · อยู่ใน `totalDeductions` = `หัก` ·
 * ช่องที่อยู่ระหว่าง `netPay` → `paidNet` (`carryIn`, `whtAmount`) = `หัก` เพราะลดยอดโอนจริง ·
 * ยอดรวม/ฐานภาษี/จำนวนวัน = `อ้างอิง` (ลงทั้งรวมทั้งย่อยคือนับซ้ำ — กติกาเดียวกับ `classify.ts`)
 */
export const PARTNER_MEASURES: readonly PartnerMeasure[] = [
  /* ---- อ้างอิง: ไม่เข้ายอด ---- */
  { field: "workingDays", label: "วันทำงาน", effect: "อ้างอิง", unit: "วัน", why: "ตัวนับ ไม่ใช่เงิน — จาก attendance_monthly หรือจำนวนวันที่มีเที่ยว" },
  { field: "tripCount", label: "จำนวนเที่ยว", effect: "อ้างอิง", unit: "ครั้ง", why: "ตัวนับ ไม่ใช่เงิน" },

  /* ---- เพิ่ม: องค์ประกอบของ totalIncome ---- */
  { field: "transportFee", label: "ค่าขนส่ง (ค่าเที่ยว)", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · ค่าเที่ยวรวมของเดือน (trip_fuel_monthly หรือ trips)" },
  { field: "ot", label: "ค่าล่วงเวลา", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · monthly_adjustments.ot" },
  { field: "attendanceAllowance", label: "เบี้ยวันทำงาน", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · เบี้ย 5 ตัว จ่ายเมื่อสูตร = ได้" },
  { field: "fuelUnderRefund", label: "คืนน้ำมันต่ำกว่าเรต", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · engine บันทึกว่า ‘รับ’ และบวกเข้า totalIncome" },
  { field: "otherIncomeWHT", label: "รับอื่น (หัก ณ ที่จ่าย)", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · ปรับปรุง + payroll_extras kind=income wht" },
  { field: "otherIncomeNoWHT", label: "รับอื่น (ไม่หักภาษี)", effect: "เพิ่ม", unit: "บาท", why: "totalIncome · ปรับปรุง + payroll_extras kind=income ไม่ wht" },

  /* ---- หัก: องค์ประกอบของ totalDeductions ---- */
  { field: "fuel", label: "ค่าน้ำมัน", effect: "หัก", unit: "บาท", why: "totalDeductions · น้ำมันที่เติมแล้วหักคืน (fuelDeduct)" },
  { field: "fuelOverCharge", label: "น้ำมันเกินเรต", effect: "หัก", unit: "บาท", why: "totalDeductions · เกินเกณฑ์ + ค่าปรับ" },
  { field: "gps", label: "ค่า GPS", effect: "หัก", unit: "บาท", why: "totalDeductions · ค่าบริการรายเดือน" },
  { field: "repairInHouse", label: "ค่าอะไหล่ซ่อมใน", effect: "หัก", unit: "บาท", why: "totalDeductions · repair_monthly.partsAmount" },
  { field: "repairOutside", label: "ค่าซ่อมนอก", effect: "หัก", unit: "บาท", why: "totalDeductions · repair_monthly.outsideRepairAmount" },
  { field: "mgmtFee8pct", label: "ค่าดำเนินการซ่อม", effect: "หัก", unit: "บาท", why: "totalDeductions · ชื่อฟิลด์ว่า 8% แต่ engine เก็บ ‘ค่าดำเนินการซ่อม’ (managementFee) ไม่ใช่ 8% ของค่าขนส่ง" },
  { field: "labor", label: "ค่าแรงซ่อม", effect: "หัก", unit: "บาท", why: "totalDeductions · repair_monthly.laborAmount" },
  { field: "tire", label: "ค่ายาง", effect: "หัก", unit: "บาท", why: "totalDeductions" },
  { field: "tirePatch", label: "ค่าปะยาง", effect: "หัก", unit: "บาท", why: "totalDeductions" },
  { field: "carWash", label: "ค่าล้างรถ", effect: "หัก", unit: "บาท", why: "totalDeductions · repair_monthly.cleaningAmount" },
  { field: "taxInsurance", label: "ภาษี/ประกันรถ", effect: "หัก", unit: "บาท", why: "totalDeductions · ตามรอบทะเบียนรถ (vehicle_insurance_tax)" },
  { field: "installment", label: "ค่างวดรถ", effect: "หัก", unit: "บาท", why: "totalDeductions · เป็น 0 เมื่อค่างวดเดินผ่าน ledger แล้ว (engine กันหักซ้ำ) จึงไม่ซ้ำกับ ledgerDeduction" },
  { field: "repairInstallment", label: "ค่างวดซ่อม", effect: "หัก", unit: "บาท", why: "totalDeductions" },
  { field: "downPaymentInstallment", label: "ค่างวดเงินดาวน์", effect: "หัก", unit: "บาท", why: "totalDeductions" },
  { field: "otherDeductWHT", label: "หักอื่น (หัก ณ ที่จ่าย)", effect: "หัก", unit: "บาท", why: "totalDeductions · ปรับปรุง + payroll_extras kind=deduct wht" },
  { field: "otherDeductNoWHT", label: "หักอื่น (ไม่หักภาษี)", effect: "หัก", unit: "บาท", why: "totalDeductions · ปรับปรุง + payroll_extras kind=deduct ไม่ wht" },
  { field: "ledgerDeduction", label: "หักหนี้/เงินสะสม (ledger)", effect: "หัก", unit: "บาท", why: "totalDeductions · driver_ledger ของเดือน (รวมค่างวดรถที่ยกเข้า ledger)" },

  /* ---- หัก: ระหว่าง netPay → paidNet ---- */
  { field: "carryIn", label: "หนี้ยกมาจากงวดก่อน", effect: "หัก", unit: "บาท", why: "payable = netPay − carryIn · carryOut ของงวดก่อน" },
  { field: "whtAmount", label: "ภาษีหัก ณ ที่จ่าย 3%", effect: "หัก", unit: "บาท", why: "paidNet = max(0, payable − WHT) · บริษัทนำส่งสรรพากรแทน ไม่ได้โอนให้คนขับ" },

  /* ---- อ้างอิง: ยอดรวมและฐาน (ลงซ้ำไม่ได้) ---- */
  { field: "whtBase", label: "ฐานภาษีหัก ณ ที่จ่าย", effect: "อ้างอิง", unit: "บาท", why: "ฐานคำนวณ WHT ไม่ใช่เงิน" },
  { field: "paidNet", label: "ยอดโอนสุทธิ (ระบบรถร่วม)", effect: "อ้างอิง", unit: "บาท", why: "ผลลัพธ์ = Σเพิ่ม − Σหัก ของแถวนี้ — ลงซ้ำคือนับสองครั้ง เก็บไว้ตรวจย้อน" },
];

/**
 * งวดนี้ติดลบหลัง WHT → partner โอน 0 และ **ยกส่วนที่หักไม่ได้ไปหักงวดหน้า** (`carryOut`
 * กลายเป็น `carryIn` ของเดือนถัดไป) ในงวดนี้จึงต้อง "คืน" ยอดนั้นเป็น `เพิ่ม` ไม่งั้น Σ จะ
 * ติดลบทั้งที่โอนจริง 0 · งวดหน้าจะขึ้นเป็น `หัก` ผ่าน `carryIn` ตามปกติ ไม่นับซ้ำ
 */
export const CARRY_OUT_LABEL = "หนี้ยกไปงวดหน้า (หักไม่ได้ในงวดนี้)";

/** แถวของ partner ไม่สอดคล้องกันเอง (มักเป็นแถวที่แก้ผ่าน PUT ด้วยสูตรเก่า) — ปรับให้ตรงยอดโอนจริง */
export const ADJUST_LABEL = "ส่วนต่างให้ตรงยอดโอนของระบบรถร่วม";

export const UNLINKED_NOTE = "ยังไม่จับคู่ drivercode";

export const PERSON_TYPE = "พจร.";

const satang = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0;

/**
 * ยอดโอนสุทธิของแถวหนึ่ง — **สูตรเดียวกับ `approval-summary` ของ partner** (ยอดที่ผู้บริหารอนุมัติ)
 * แถวเฟส 5 ขึ้นไปมี `paidNet` · แถวเก่าไม่มี → `max(0, payable ?? netPay) − WHT`
 */
export function paidNetOf(entry: PartnerEntry): number {
  if (typeof entry.paidNet === "number") return entry.paidNet;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return Math.max(0, num(entry.payable ?? entry.netPay)) - num(entry.whtAmount);
}

/** แถวมาตรฐานเป็นของรายการรถร่วม และเป็นบรรทัดปรับส่วนต่าง */
export const isAdjustment = (fact: Fact): boolean =>
  fact.kind === "ค่าที่วัด" && fact.measure === ADJUST_LABEL;

export const isUnlinked = (fact: Fact): boolean => fact.personId === "";

export function adaptPartnerEntries(args: {
  /** รอบ hr (`periodCode`) ที่แถวพวกนี้จะเข้า */
  period: string;
  entries: readonly PartnerEntry[];
  links: readonly PartnerLink[];
  contracts?: readonly PartnerContract[];
}): Fact[] {
  const drivercodeOf = new Map(args.links.map((l) => [l.contractCode, l.drivercode.trim()]));
  const contractOf = new Map((args.contracts ?? []).map((c) => [c.contractCode, c]));
  const facts: Fact[] = [];

  /* เรียงตามรหัสสัญญา — ผลเหมือนเดิมทุกครั้งไม่ว่าฐานคืนลำดับไหน */
  const entries = [...args.entries].sort((a, b) => a.contractCode.localeCompare(b.contractCode));

  for (const entry of entries) {
    const personId = drivercodeOf.get(entry.contractCode) ?? "";
    const contract = contractOf.get(entry.contractCode);

    const dims: Partial<Record<DimensionKey, string>> = {
      personType: PERSON_TYPE,
      /* ชี้กลับต้นทาง: payroll_entries { month, contractCode } */
      docNo: `${entry.month}/${entry.contractCode}`,
    };
    if (contract?.licensePlate?.trim()) dims.plate = contract.licensePlate.trim();
    if (contract?.driverName?.trim()) dims.personName = contract.driverName.trim();
    if (!personId) dims.note = UNLINKED_NOTE;

    const base = {
      period: args.period,
      itemId: PARTNER_ITEM_ID,
      owner: "ระบบรถร่วม" as const,
      /* ไม่มีแถวในไฟล์ — ต้นทางคือเอกสารใน payroll_entries (ดู dims.docNo) */
      sourceRow: 0,
      personId,
      payeeId: entry.contractCode,
      dims,
    };
    const push = (measure: string, effect: MoneyEffect, unit: Unit, cents: number) => {
      facts.push({ ...base, kind: "ค่าที่วัด", measure, effect, unit, value: cents / 100 });
    };

    let net = 0;
    for (const m of PARTNER_MEASURES) {
      const raw = entry[m.field];
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw === 0) continue;
      if (m.unit !== "บาท") {
        facts.push({ ...base, kind: "ค่าที่วัด", measure: m.label, effect: m.effect, unit: m.unit, value: raw });
        continue;
      }
      const cents = satang(raw);
      if (m.effect === "เพิ่ม") net += cents;
      else if (m.effect === "หัก") net -= cents;
      push(m.label, m.effect, m.unit, cents);
    }

    const carryOut = satang(entry.carryOut);
    if (carryOut > 0) {
      net += carryOut;
      push(CARRY_OUT_LABEL, "เพิ่ม", "บาท", carryOut);
    }

    const residual = satang(paidNetOf(entry)) - net;
    if (residual !== 0) {
      push(ADJUST_LABEL, residual > 0 ? "เพิ่ม" : "หัก", "บาท", Math.abs(residual));
    }
  }

  return facts;
}

/** Σเพิ่ม − Σหัก ของแถวมาตรฐาน **เป็นสตางค์** — ตัวตรวจข้อตกลง "เท่ากับ paidNet ทุกบาท" */
export function netSatang(facts: readonly Fact[]): number {
  let net = 0;
  for (const fact of facts) {
    if (fact.kind !== "ค่าที่วัด" || fact.unit !== "บาท") continue;
    if (fact.effect === "เพิ่ม") net += Math.round(fact.value * 100);
    else if (fact.effect === "หัก") net -= Math.round(fact.value * 100);
  }
  return net;
}
