import { NextResponse } from "next/server"
import { loadPublicTrucks } from "@/lib/partner/public-trucks"
import { deferPrerenderWithoutDb } from "@/lib/partner/build-guard"

// ตัวกันพลาด — ปกติ lib/revalidate-public.ts สั่งล้างแคชทันทีที่ชุดรถว่างเปลี่ยน
export const revalidate = 60

/** API สาธารณะ — ข้อมูลผ่าน toPublicTruck() allowlist เท่านั้น (ดู lib/public-trucks.ts) */
export async function GET() {
  await deferPrerenderWithoutDb()   // build ที่ไม่มี MONGO_URI — ดู lib/partner/build-guard.ts
  const trucks = await loadPublicTrucks()
  return NextResponse.json({ trucks, count: trucks.length })
}
