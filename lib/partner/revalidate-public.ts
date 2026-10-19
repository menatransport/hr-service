import { revalidatePath } from "next/cache"

/**
 * ล้างแคชหน้าสาธารณะ /trucks ทันทีที่ "รถว่าง" เปลี่ยนชุด
 *
 * หน้า /trucks กับ /trucks/[slug] เป็น ISR (revalidate เป็นวินาที) ถ้าไม่สั่งล้างเอง
 * หน้าที่ไม่มีคนเข้าจะค้างที่ HTML ตอน build ไม่จำกัดเวลา — คนแรกที่เปิดได้ของเก่าเสมอ
 * (เคสจริง 2026-10-09: ME078 ทำสัญญาแล้ว แต่หน้ารวมยังโชว์ 170 คันค้างจาก build ก่อน)
 *
 * เรียกหลังบันทึกสำเร็จในทุก route ที่แตะ contracts / vehicle_master.status / master_price_list.saleStatus
 * เพราะสามอย่างนี้คือเกณฑ์ isAvailable() ใน lib/public-trucks.ts
 */
export function revalidatePublicTrucks() {
  try {
    revalidatePath("/trucks")
    revalidatePath("/trucks/[slug]", "page")
    revalidatePath("/api/public/trucks")
    revalidatePath("/api/public/trucks/[slug]", "page")
  } catch {
    // ล้างแคชพลาดไม่ควรทำให้การบันทึกข้อมูลล้มเหลว — อย่างแย่สุดก็รอ revalidate ตามเวลา
  }
}
