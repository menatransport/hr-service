import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { runDealDailyJobs } from "@/lib/partner/deal-cron"

export const runtime = "nodejs"
export const maxDuration = 60

const DB = PARTNER_DB

/**
 * งานรายวันของไปป์ไลน์ขายรถร่วม — Vercel Cron เรียกทุกวัน 08:00 (ตั้งใน vercel.json)
 * ยิงเองได้ด้วยถ้าเป็นผู้ดูแล (ใช้ตอนทดสอบ/เร่งรัน) · Cron ของ Vercel แนบ header Authorization: Bearer <CRON_SECRET>
 */
async function allowed(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return "cron"
  const session = await getPartnerSession()
  return ["admin", "superadmin"].includes(session?.user?.role ?? "") ? "admin" : false
}

export async function GET(req: NextRequest) {
  const who = await allowed(req)
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  // เรียกมือเปล่า ๆ = พรีวิวเท่านั้น (กันเผลอปิดดีลยกแผง) · Vercel Cron หรือใส่ ?apply=1 ถึงจะเขียนจริง
  const apply = who === "cron" || req.nextUrl.searchParams.get("apply") === "1"
  const db = (await clientPromise).db(DB)
  const report = await runDealDailyJobs(db, new Date(), { apply })
  return NextResponse.json({
    ok: true,
    โหมด: apply ? "เขียนจริง" : "พรีวิว (ใส่ ?apply=1 เพื่อทำจริง)",
    สรุป: {
      เลยวันติดตาม: report.followUpDue.length,
      ปิดอัตโนมัติ: report.autoClosed.length,
      ครบ90วัน: report.completed.length,
      ผิดพลาด: report.errors.length,
    },
    ...report,
  })
}
