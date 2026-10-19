/**
 * สร้าง object ของ placeholder → ค่า สำหรับเติมลง .docx template ของสัญญาว่าจ้างขับรถ
 * (templates/hire.docx) ผ่าน docxtemplater
 *
 * ค่าทุกตัวถอดแบบมาจาก components/hire-contract-document.tsx เป๊ะ ๆ
 * เพื่อให้ผลลัพธ์ตรงกับหน้า preview / พิมพ์
 */
import type { Contract } from "@/lib/partner/types"
import { buyerFullName } from "@/lib/partner/contract-doc"
import { thaiDate, thaiDateParts, formatNationalId } from "@/lib/partner/thai-format"
import { normPlate, type PromoMasterData } from "@/lib/partner/contract-docx"

const DOTS = "................"
const s = (v: unknown) => (v == null || v === "" ? DOTS : String(v))

/** ค่าทุก placeholder ของ template สัญญาว่าจ้าง (templates/hire.docx) */
export function hireDocxData(c: Contract, _promo: PromoMasterData | null): Record<string, string> {
  void normPlate // hire ไม่ใช้ทะเบียนในเนื้อสัญญา แต่คง import ตามชุด sale เพื่อความสม่ำเสมอ
  void _promo // สัญญาว่าจ้างไม่ได้ใช้ข้อมูลโปรโมชั่น

  const dp = thaiDateParts(c.contractDate)

  return {
    // header
    contractCode: s(c.contractCode),
    contractDay: dp ? String(dp.day) : DOTS,
    contractMonth: dp ? dp.monthName : DOTS,
    contractYearBE: dp ? String(dp.yearBE) : DOTS,
    // ผู้รับจ้างที่ 1 (party)
    buyerName: s(buyerFullName(c)),
    nationalId: c.nationalId ? formatNationalId(c.nationalId) : DOTS,
    driverAddress: s(c.driverAddress),
    // วันที่สัญญาซื้อขาย (ข้อ (3) + ข้อ 4) — thaiDate ของ contractDate
    contractDateThai: c.contractDate ? thaiDate(c.contractDate) : DOTS,
    // ข้อ 7: บัญชีธนาคาร
    bankName: s(c.bankName),
    accountNumber: s(c.accountNumber),
  }
}
