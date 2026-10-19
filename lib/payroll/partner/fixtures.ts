import type { PartnerContract, PartnerEntry, PartnerLink } from "./adapter";

/**
 * แถว `payroll_entries` ตัวอย่างสำหรับเทสต์ — **ไม่ได้มาจากฐานจริง** ตัวเลขแต่งขึ้นให้ครอบกรณี
 *
 * ยอดรวม/ยกยอด/WHT/paidNet คำนวณด้วย `engineTotals()` ซึ่งลอกสูตรท้ายของ
 * `mena-partner-driver/lib/payroll-engine.ts` (ส่วน totalIncome → paidNet) มาตรง ๆ
 * แถวจึงหน้าตาเหมือนที่ engine บันทึกจริง
 */
type Parts = Omit<
  PartnerEntry,
  "totalIncome" | "netPay" | "payable" | "carryOut" | "whtBase" | "whtAmount" | "paidNet"
>;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function engineTotals(p: Parts): PartnerEntry {
  const n = (v?: number) => v ?? 0;
  const totalIncome =
    n(p.transportFee) + n(p.ot) + n(p.attendanceAllowance) + n(p.fuelUnderRefund) +
    n(p.otherIncomeWHT) + n(p.otherIncomeNoWHT);
  const totalDeductions =
    n(p.fuel) + n(p.fuelOverCharge) + n(p.gps) + n(p.repairInHouse) + n(p.repairOutside) +
    n(p.mgmtFee8pct) + n(p.labor) + n(p.tire) + n(p.tirePatch) + n(p.carWash) +
    n(p.taxInsurance) + n(p.installment) + n(p.repairInstallment) + n(p.downPaymentInstallment) +
    n(p.otherDeductWHT) + n(p.otherDeductNoWHT) + n(p.ledgerDeduction);
  const carryIn = r2(n(p.carryIn));
  const netPay = r2(totalIncome - totalDeductions);
  const payable = r2(netPay - carryIn);
  const whtBase = r2(
    n(p.transportFee) + n(p.ot) + n(p.attendanceAllowance) + n(p.otherIncomeWHT) -
      (n(p.fuel) + n(p.fuelOverCharge) - n(p.fuelUnderRefund) + n(p.gps) + n(p.repairInHouse) +
        n(p.repairOutside) + n(p.mgmtFee8pct) + n(p.labor) + n(p.tire) + n(p.tirePatch) +
        n(p.carWash) + n(p.taxInsurance)) -
      n(p.otherDeductWHT),
  );
  const whtAmount = whtBase > 0 ? r2(whtBase * 0.03) : 0;
  const afterWht = r2(payable - whtAmount);
  return {
    ...p,
    carryIn,
    netPay,
    payable,
    whtBase,
    whtAmount,
    paidNet: Math.max(0, afterWht),
    carryOut: afterWht < 0 ? r2(-afterWht) : 0,
  };
}

const MONTH = "2026-09";

export const ENTRIES: PartnerEntry[] = [
  /* คนปกติ มีคู่ — ค่างวดรถ + คืนน้ำมันต่ำกว่าเรต + หักหนี้ ledger */
  engineTotals({
    contractCode: "MTL001", month: MONTH, workingDays: 26, tripCount: 58,
    transportFee: 52340.5, attendanceAllowance: 1500, fuelUnderRefund: 820.25, otherIncomeWHT: 1000,
    fuel: 18450.75, gps: 700, repairInHouse: 2300, mgmtFee8pct: 230, taxInsurance: 1250.4,
    installment: 12000, ledgerDeduction: 1000,
  }),
  /* ไม่มีคู่ — น้ำมันเกินเรต + หนี้ยกมาจากงวดก่อน */
  engineTotals({
    contractCode: "MTL002", month: MONTH, workingDays: 22, tripCount: 41,
    transportFee: 38015.33, ot: 1200, fuel: 15880.1, fuelOverCharge: 3200, gps: 700,
    tire: 4800, installment: 9500, otherDeductNoWHT: 500, carryIn: 2500,
  }),
  /* ติดลบ — ซ่อมหนักเดือนนี้ โอน 0 แล้วยกหนี้ (รวม WHT ที่ออกแทน) ไปงวดหน้า */
  engineTotals({
    contractCode: "MTL003", month: MONTH, workingDays: 9, tripCount: 14,
    transportFee: 12450, fuel: 5200.5, gps: 700, repairOutside: 18500, labor: 3200,
    installment: 9500, carryIn: 1234.56,
  }),
  /* คนเดียวสองสัญญา (drivercode เดียวกัน) */
  engineTotals({
    contractCode: "MTL004", month: MONTH, workingDays: 25, tripCount: 50,
    transportFee: 47210, otherIncomeNoWHT: 300, fuel: 16100, gps: 700, installment: 11000,
    downPaymentInstallment: 2000, otherDeductWHT: 450,
  }),
  engineTotals({
    contractCode: "MTL005", month: MONTH, workingDays: 4, tripCount: 6,
    transportFee: 6020, fuel: 2100, gps: 700, carWash: 150, repairInstallment: 1500,
  }),
];

/**
 * แถวที่แก้ผ่าน `PUT /api/payroll/[month]/[contractCode]` ของ partner — route นั้นคำนวณยอดรวม
 * ใหม่ด้วยสูตรเก่า แต่ **ไม่แตะ `paidNet`** ช่องย่อยจึงไม่รวมเป็นยอดโอนที่บันทึกไว้
 */
export const EDITED_ENTRY: PartnerEntry = {
  ...engineTotals({
    contractCode: "MTL006", month: MONTH, workingDays: 20, tripCount: 40,
    transportFee: 40000, fuel: 15000, gps: 700,
  }),
  transportFee: 40500,
};

/** แถวก่อนเฟส 5 — ไม่มี paidNet / carry / WHT */
export const LEGACY_ENTRY: PartnerEntry = {
  contractCode: "MTL007", month: MONTH, workingDays: 21, tripCount: 39,
  transportFee: 30000, fuel: 11000, gps: 700, netPay: 18300,
};

export const LINKS: PartnerLink[] = [
  { contractCode: "MTL001", drivercode: "670101" },
  { contractCode: "MTL003", drivercode: "670150" },
  { contractCode: "MTL004", drivercode: "670200" },
  { contractCode: "MTL005", drivercode: "670200" },
  /* คู่ของสัญญาที่ไม่มีแถวในเดือนนี้ — ต้องไม่สร้างแถวผี */
  { contractCode: "MTL999", drivercode: "670999" },
];

export const CONTRACTS: PartnerContract[] = [
  { contractCode: "MTL001", licensePlate: "70-1234 กทม.", driverName: "สมชาย ใจดี" },
  { contractCode: "MTL002", licensePlate: "71-5678", driverName: "สมหญิง รักงาน" },
  { contractCode: "MTL004", licensePlate: " 70-9999 ", driverName: "ประยุทธ ขยัน" },
];
