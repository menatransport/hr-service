import type { Contract } from "@/lib/partner/types"

/** ชื่อผู้ซื้อที่พิมพ์ในเอกสาร = คำนำหน้า + ชื่อ (ใช้ทุกเอกสาร: HTML/PDF/DOCX) */
export function buyerFullName(c: { buyerPrefix?: string; buyerName?: string }): string {
  return [String(c.buyerPrefix ?? "").trim(), String(c.buyerName ?? "").trim()].filter(Boolean).join(" ")
}

/**
 * Fields required for a complete printed sale contract
 * (สัญญาซื้อขายรถยนต์บรรทุก PDF) — shared by the document page and the
 * contract edit page so both report the same completeness.
 */
export interface DocField {
  key: keyof Contract
  label: string
}

export const DOC_REQUIRED: DocField[] = [
  { key: "contractDate",            label: "วันที่ทำสัญญา" },
  { key: "buyerName",               label: "ชื่อผู้ซื้อ" },
  { key: "birthDate",               label: "วันเกิดผู้ซื้อ (อายุ)" },
  { key: "nationalId",              label: "เลขบัตรประชาชน" },
  { key: "driverAddress",           label: "ที่อยู่ผู้ซื้อ" },
  { key: "vehicleType",             label: "ประเภทรถ" },
  { key: "vehicleCharacteristic",   label: "ลักษณะ/มาตรฐาน" },
  { key: "vehicleBrand",            label: "ยี่ห้อ" },
  { key: "vehicleModel",            label: "รุ่น" },
  { key: "vehicleRegistrationDate", label: "วันจดทะเบียน" },
  { key: "vehicleColor",            label: "สีรถ" },
  { key: "licensePlate",            label: "เลขทะเบียน" },
  { key: "chassisNumber",           label: "หมายเลขตัวรถ" },
  { key: "engineNumber",            label: "หมายเลขเครื่องยนต์" },
  { key: "engineSize",              label: "ขนาดกำลังเครื่องยนต์" },
  // ระยะทางที่ใช้แล้ว = ไม่บังคับ (ถ้าไม่กรอกเอกสารจะแสดง "-")
  { key: "totalPrice",              label: "ราคาซื้อขาย" },
  { key: "downPayment",             label: "เงินดาวน์รวม" },
  { key: "cashDown",                label: "เงินดาวน์ชำระแล้ว" },
  { key: "remainingInstallment",    label: "เงินดาวน์คงเหลือ" },
  { key: "downInstallmentAmt",      label: "ค่างวดดาวน์" },
  { key: "downInstallmentCount",    label: "จำนวนงวดดาวน์" },
  { key: "financeAmount",           label: "ยอดเงินค่างวด" },
  { key: "monthlyInstallment",      label: "ค่างวดรายเดือน" },
  { key: "totalInstallments",       label: "จำนวนงวดรวม" },
]

/** Fields used by the printed hire contract (สัญญาว่าจ้างขับรถยนต์บรรทุกสินค้า). */
export const HIRE_DOC_REQUIRED: DocField[] = [
  { key: "contractDate",  label: "วันที่ทำสัญญา" },
  { key: "buyerName",     label: "ชื่อผู้รับจ้าง" },
  { key: "nationalId",    label: "เลขบัตรประชาชน" },
  { key: "driverAddress", label: "ที่อยู่ผู้รับจ้าง" },
  { key: "bankName",      label: "ธนาคาร" },
  { key: "accountNumber", label: "เลขที่บัญชี" },
]

/** Fields still missing for the printed hire contract. */
export function missingHireDocFields(c: Partial<Contract> | null | undefined): DocField[] {
  if (!c) return HIRE_DOC_REQUIRED
  return HIRE_DOC_REQUIRED.filter(({ key }) => {
    const v = c[key]
    return v === undefined || v === null || v === "" || v === 0
  })
}

/** Fields used by the printed guarantee contract (สัญญาค้ำประกัน). */
export const GUARANTEE_DOC_REQUIRED: DocField[] = [
  { key: "contractDate",        label: "วันที่ทำสัญญา" },
  { key: "buyerName",           label: "ชื่อผู้ซื้อ" },
  { key: "guarantorName",       label: "ชื่อผู้ค้ำประกัน" },
  { key: "guarantorNationalId", label: "เลขบัตรผู้ค้ำประกัน" },
  { key: "guarantorAddress",    label: "ที่อยู่ผู้ค้ำประกัน" },
]

/** Fields still missing for the printed guarantee contract. */
export function missingGuaranteeDocFields(c: Partial<Contract> | null | undefined): DocField[] {
  if (!c) return GUARANTEE_DOC_REQUIRED
  return GUARANTEE_DOC_REQUIRED.filter(({ key }) => {
    const v = c[key]
    return v === undefined || v === null || v === "" || v === 0
  })
}

/** Fields used by the printed vendor onboarding pack (เอกสารเปิดเจ้าหนี้รายใหม่). */
export const VENDOR_DOC_REQUIRED: DocField[] = [
  { key: "contractDate",    label: "วันที่" },
  { key: "buyerName",       label: "ชื่อเจ้าหนี้" },
  { key: "nationalId",      label: "เลขบัตรประชาชน" },
  { key: "driverAddress",   label: "ที่อยู่" },
  { key: "phone",           label: "เบอร์โทร" },
  { key: "bankName",        label: "ธนาคาร" },
  { key: "accountNumber",   label: "เลขที่บัญชี" },
  { key: "bankAccountType", label: "ประเภทบัญชี" },
  { key: "bankBranch",      label: "สาขาธนาคาร" },
]

/** Fields still missing for the printed vendor onboarding pack. */
export function missingVendorDocFields(c: Partial<Contract> | null | undefined): DocField[] {
  if (!c) return VENDOR_DOC_REQUIRED
  return VENDOR_DOC_REQUIRED.filter(({ key }) => {
    const v = c[key]
    return v === undefined || v === null || v === "" || v === 0
  })
}

/** Fields still missing for the printed contract (0/empty count as missing). */
export function missingDocFields(c: Partial<Contract> | null | undefined): DocField[] {
  if (!c) return DOC_REQUIRED
  return DOC_REQUIRED.filter(({ key }) => {
    // เงินดาวน์คงเหลือ derive ได้จาก ดาวน์รวม - ชำระแล้ว
    if (key === "remainingInstallment") {
      const derivable = c.downPayment != null && c.downPayment !== 0 && c.cashDown != null && c.cashDown !== 0
      return !c.remainingInstallment && !derivable
    }
    const v = c[key]
    return v === undefined || v === null || v === "" || v === 0
  })
}
