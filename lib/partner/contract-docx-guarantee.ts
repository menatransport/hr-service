/**
 * สร้าง object ของ placeholder → ค่า สำหรับเติมลง templates/guarantee.docx (docxtemplater)
 * ถอดแบบค่าจาก components/guarantee-contract-document.tsx เพื่อให้ตรงกับหน้า preview เป๊ะ
 *
 * placeholder ในเทมเพลต (7 ตัว):
 *   contractDay, contractMonth, contractYearBE   (จาก thaiDateParts(c.contractDate))
 *   guarantorName, guarantorNationalId, guarantorAddress
 *   buyerName
 */
import type { Contract } from "@/lib/partner/types"
import { buyerFullName } from "@/lib/partner/contract-doc"
import { thaiDateParts, formatNationalId } from "@/lib/partner/thai-format"
import { normPlate, type PromoMasterData } from "@/lib/partner/contract-docx"

const DOTS = "................"
const s = (v: unknown) => (v == null || v === "" ? DOTS : String(v))

/** ค่าทุก placeholder ของ template สัญญาค้ำประกัน (templates/guarantee.docx) */
export function guaranteeDocxData(
  c: Contract,
  _promo: PromoMasterData | null,
): Record<string, string> {
  // guarantee doc ไม่ใช้ promo — รับ argument ไว้ให้ตรง signature ของ DOCX_TEMPLATES
  void _promo
  const dp = thaiDateParts(c.contractDate)

  return {
    // header + ข้อ 1 date (Buddhist-era parts — เหมือน dateParts ใน component)
    contractDay: dp ? String(dp.day) : DOTS,
    contractMonth: dp ? dp.monthName : DOTS,
    contractYearBE: dp ? String(dp.yearBE) : DOTS,
    // ผู้ค้ำประกัน (guarantor)
    guarantorName: s(c.guarantorName),
    guarantorNationalId: c.guarantorNationalId
      ? formatNationalId(c.guarantorNationalId)
      : DOTS,
    guarantorAddress: s(c.guarantorAddress),
    // ผู้ซื้อ (buyer)
    buyerName: s(buyerFullName(c)),
  }
}

/**
 * รายการ DOCX_TEMPLATES entry สำหรับ `guarantee` — เพิ่มด้วยมือใน lib/contract-docx.ts
 * (แยกไฟล์เพื่อเลี่ยง circular import; ห้ามแก้ contract-docx.ts ในงานนี้):
 *
 *   guarantee: {
 *     file: "guarantee.docx",
 *     build: guaranteeDocxData,           // import { guaranteeDocxData } from "@/lib/partner/contract-docx-guarantee"
 *     filename: (c: Contract) =>
 *       `สัญญาค้ำประกัน-${c.contractCode}-${normPlate(c.licensePlate) || "รถ"}.docx`,
 *   },
 */
// re-export normPlate เพื่อความสะดวก (ใช้ในสูตรชื่อไฟล์ด้านบน)
export { normPlate }
