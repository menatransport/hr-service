import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import { monthClosed, closedError } from "@/lib/partner/month-lock"
import { parseAttendanceSheet, ATT_COLL } from "@/lib/partner/attendance"
import { plateContractMap } from "@/lib/partner/trip-fuel"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"

const MONTH_RE = /^\d{4}-\d{2}$/

/** นำเข้า Excel วันทำงาน พจร. — action=preview (ตรวจก่อน) | confirm (บันทึกทับของเดือน) */
export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("finance")
  if (perm instanceof Response) return perm

  const fd = await req.formData()
  const file = fd.get("file") as File | null
  const month = String(fd.get("month") ?? "")
  const action = String(fd.get("action") ?? "preview")
  if (!file) return NextResponse.json({ error: "แนบไฟล์ Excel" }, { status: 400 })
  if (!MONTH_RE.test(month)) return NextResponse.json({ error: "ระบุเดือน (YYYY-MM)" }, { status: 400 })

  let parsed
  try {
    parsed = parseAttendanceSheet(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านไฟล์ไม่สำเร็จ" }, { status: 400 })
  }

  const pdb = await partnerDb()
  const db = pdb
  const pMap = await plateContractMap(db)
  const { normPlate } = await import("@/lib/partner/promo-usage")

  const rows = parsed.rows.map((r) => ({
    ...r,
    contractCode: pMap.get(normPlate(r.licensePlate)) ?? "",
  }))
  const noContract = rows.filter((r) => !r.contractCode).length
  const withWarn = rows.filter((r) => r.warnings.length > 0).length

  if (action === "preview") {
    return NextResponse.json({
      sheetName: parsed.sheetName, month,
      total: rows.length, noContract, withWarn,
      rows: rows.map(({ days, ...rest }) => ({ ...rest, daysPreview: days.join("") })),
    })
  }

  // confirm — ทับข้อมูลเดือนนี้ทั้งชุด (ไฟล์คือ source of truth ของเดือน)
  if (await monthClosed(db, month)) return NextResponse.json(closedError(month), { status: 423 })
  const session = await getPartnerSession()
  const now = new Date().toISOString()
  await partnerColOf(db, "attendanceMonthly").deleteMany({ month })
  if (rows.length > 0) {
    await partnerColOf(db, "attendanceMonthly").insertMany(rows.map((r) => ({
      ...r, month, importedAt: now, importedBy: session?.user?.email ?? "unknown",
    })))
  }
  return NextResponse.json({ ok: true, imported: rows.length, noContract, withWarn })
}
