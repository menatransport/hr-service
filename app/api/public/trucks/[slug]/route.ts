import { NextResponse } from "next/server"
import { loadPublicTruckBySlug } from "@/lib/partner/public-trucks"

// ตัวกันพลาด — ปกติ lib/revalidate-public.ts สั่งล้างแคชทันทีที่ชุดรถว่างเปลี่ยน
export const revalidate = 60

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const truck = await loadPublicTruckBySlug(slug)
  if (!truck) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(truck)
}
