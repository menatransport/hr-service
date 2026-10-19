/**
 * ตัวเลขราคา "สำหรับแสดงฝั่งขาย" — โปสเตอร์, หน้า /catalog, หน้าเว็บ /trucks
 * เงื่อนไขที่ฝ่ายขายเคาะ (2026-09-23): ราคาเป็นหลักพัน + **ไม่มีส่วนต่าง** + ค่างวดเป็นเลขตรง + **ดาวน์คงเดิม**
 * - ค่างวด → ปัดขึ้นขั้นละ 250 (17,163 → 17,250) — ขั้น 250 ทำให้ ค่างวด × งวด ลงพันพอดีเมื่องวดหาร 4 ลงตัว (72/96 ของกองนี้)
 *   (ขั้น 100 ทำให้ราคาไม่เป็นหลักพัน · ปัดราคาขึ้นพันเฉย ๆ ทำให้เหลือส่วนต่าง · ให้ดาวน์รับส่วนต่างทำให้ดาวน์เป็น 100,600 — ผู้ใช้ไม่เอาทั้งสามแบบ)
 * - ราคา = ดาวน์จริง + ค่างวดที่ปัดแล้ว × งวด **เป๊ะ ๆ** (100,000 + 17,250 × 72 = 1,342,000 · ในระบบ 1,335,728)
 *   งวดไม่หาร 4 ลงตัว หรือดาวน์ไม่เต็มพัน → ราคาอาจไม่เป็นหลักพัน แต่ "ไม่มีส่วนต่าง" มาก่อน
 * - ไม่มีแผนผ่อน → ราคาปัดขึ้นเต็มพัน ดาวน์คงเดิม
 * ใช้แสดงผลเท่านั้น — ตัวเลขจริงยังอยู่ในระบบ/Catalog PDF/ใบเสนอราคา/สัญญา (lead จากเว็บเก็บราคาจริง)
 */

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0)
export const ceilTo = (v: number, unit: number) => (v > 0 ? Math.ceil(v / unit) * unit : 0)

export interface SalePriceInput {
  totalSalePrice?: unknown
  downPayment?: unknown
  monthlyPayment?: unknown
  financeInstallments?: unknown
}

export function displaySalePrice(p: SalePriceInput): { price: number; monthlyPayment: number; downPayment: number } {
  const monthly = ceilTo(n(p.monthlyPayment), 250)
  const count = n(p.financeInstallments)
  if (monthly > 0 && count > 0) {
    const down = n(p.downPayment)
    return { price: down + monthly * count, monthlyPayment: monthly, downPayment: down }
  }
  return { price: ceilTo(n(p.totalSalePrice), 1_000), monthlyPayment: monthly, downPayment: n(p.downPayment) }
}
