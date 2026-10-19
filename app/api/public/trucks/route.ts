import { NextResponse } from "next/server"
import { loadPublicTrucks } from "@/lib/partner/public-trucks"

// ตัวกันพลาด — ปกติ lib/revalidate-public.ts สั่งล้างแคชทันทีที่ชุดรถว่างเปลี่ยน
export const revalidate = 60

/** API สาธารณะ — ข้อมูลผ่าน toPublicTruck() allowlist เท่านั้น (ดู lib/public-trucks.ts) */
export async function GET() {
  const trucks = await loadPublicTrucks()
  return NextResponse.json({ trucks, count: trucks.length })
}
