/**
 * สร้าง object ของ placeholder → ค่า สำหรับเติมลง templates/creditor.docx
 * (เอกสารเปิดรหัสเจ้าหนี้ / vendor onboarding). ค่าถอดแบบจาก
 * components/vendor-doc-document.tsx เพื่อให้ตรงกับหน้า preview เป๊ะ
 */
import type { Contract } from "@/lib/partner/types"
import { buyerFullName } from "@/lib/partner/contract-doc"
import { thaiDate, formatNationalId } from "@/lib/partner/thai-format"
import { type PromoMasterData } from "@/lib/partner/contract-docx"

const DOTS = "................"
const s = (v: unknown) => (v == null || v === "" ? DOTS : String(v))

// ค่าคงที่ (ตรงกับที่ hardcode ไว้ใน vendor-doc-document.tsx)
const PAYMENT_TERMS = "โอนเข้าบัญชีธนาคารภายในวันทำการสุดท้ายของเดือนถัดไป"
const PRODUCT_TYPE = "บริการขนส่ง (รถร่วม)"

/** ค่าทุก placeholder ของ template เปิดรหัสเจ้าหนี้ (templates/creditor.docx) */
export function creditorDocxData(
  c: Contract,
  _promo: PromoMasterData | null,
): Record<string, string> {
  const bankAccount = c.accountNumber
    ? `${c.accountNumber}${c.bankName ? ` (${c.bankName})` : ""}`
    : DOTS

  return {
    // หัวกระดาษ — รหัสเจ้าหนี้ (บัญชีกำหนดหลังเปิด)
    vendorCodeWinspeed: s(c.vendorCodeWinspeed),
    vendorCodeAtms: s(c.vendorCodeAtms),
    // วันที่ (ใช้ทั้งหน้า 1 และหน้า 4)
    docDate: c.contractDate ? thaiDate(c.contractDate) : DOTS,
    // ชื่อเจ้าหนี้ / ผู้ติดต่อ / ผู้ให้ความยินยอม
    buyerName: s(buyerFullName(c)),
    buyerNameEn: s(c.buyerNameEn),
    nationalId: c.nationalId ? formatNationalId(c.nationalId) : DOTS,
    driverAddress: s(c.driverAddress),
    phone: s(c.phone),
    email: s(c.email),
    // เงื่อนไข / ประเภทสินค้า (ค่าคงที่ตามฟอร์ม)
    paymentTerms: PAYMENT_TERMS,
    productType: PRODUCT_TYPE,
    // บัญชีธนาคาร
    bankAccountType: s(c.bankAccountType),
    bankAccount,
    bankBranch: s(c.bankBranch),
  }
}
