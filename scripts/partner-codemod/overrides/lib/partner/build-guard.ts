import { connection } from "next/server"

/**
 * กัน `next build` ล้มเมื่อเครื่องที่ build ไม่มี `MONGO_URI` (เครื่อง dev / CI ของ hr-service — build ต้องผ่านโดยไม่ต่อฐาน)
 *
 * หน้าสาธารณะ (/trucks, sitemap, /api/public/trucks) เป็น ISR — Next จะ prerender ตอน build ซึ่งต้องอ่านฐาน
 * - **ไม่มี MONGO_URI** → `connection()` บอก Next ว่าหน้านี้รอคำขอจริง ไม่ prerender (build ผ่าน, เรนเดอร์ตอนมีคนเปิด)
 * - **มี MONGO_URI** (Vercel ตั้งไว้ทั้งตอน build และ runtime) → ไม่ทำอะไร พฤติกรรม ISR เหมือน repo เดิมทุกอย่าง
 */
export async function deferPrerenderWithoutDb(): Promise<void> {
  if (!process.env.MONGO_URI?.trim()) await connection()
}
