/**
 * รายชื่อผู้ขาย/ผู้แนะนำที่เลือกได้ในใบเสนอราคา
 * แยกจาก lib/quotation.ts เพราะไฟล์นั้นเป็น server-only — ตัวนี้ client component ใช้ได้
 * ชื่อในลิสต์คือตัวจับกลุ่มยอดคอม (lib/commission.ts) จึงต้องสะกดให้คงที่
 */
export const SALES_PEOPLE = [
  "K.Bally",
  "K.กุ้ง เทรนเนอร์",
  "K.ทราย เชื้อเพลิง",
  "K.บอล ERZ1",
  "K.เดี่ยว ERZ2",
  "K.เนส เชื้อเพลิง",
  "K.บอย Complaint",
  "K.จิ๊บ จัดส่ง",
  "K.เหล็ง MeeCap",
  "K.ไนท์ MeeCap",
  "พจร ภูวไนย กินรี",
] as const
