/** บัญชีรับโอนเงินของบริษัท — ใช้ร่วมกันทั้ง PDF ใบเสนอราคาและหน้าเว็บ
 *  หมายเหตุ: ไฟล์นี้ต้อง client-safe (ห้ามใส่ import "server-only") เพราะหน้า /quotations/[id] เป็น client component */
export const COMPANY_BANK = {
  bank: "ธนาคารกสิกรไทย",
  accountName: "บมจ.มีนาทรานสปอร์ต",
  accountNo: "011-1-10636-3",
  accountType: "กระแสรายวัน",
} as const
