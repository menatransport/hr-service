import { NextRequest, NextResponse } from "next/server"
import { getPartnerSession } from "@/lib/partner/auth/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"
import { getCompanyConfig, getCompanyVersion, listCompanyVersions, saveCompanyConfig, type CompanyConfig } from "@/lib/partner/company-config"

const DB = PARTNER_DB

/** ข้อมูลบริษัท/ผู้ลงนามบนสัญญา — อ่านได้ทุกคนที่ล็อกอิน (เอกสารต้องใช้) แก้ได้เฉพาะ admin */
export async function GET(req: NextRequest) {
  const db = (await clientPromise).db(DB)
  const sp = req.nextUrl.searchParams
  if (sp.get("versions")) return NextResponse.json(await listCompanyVersions(db))
  const v = Number(sp.get("version") ?? 0) || 0
  return NextResponse.json(v ? await getCompanyVersion(db, v) : await getCompanyConfig(db))
}

export async function PUT(req: NextRequest) {
  const session = await getPartnerSession()
  const role = session?.user?.role ?? ""
  if (!["admin", "superadmin"].includes(role)) {
    return NextResponse.json({ error: "ต้องเป็นผู้ดูแลระบบจึงจะแก้ข้อมูลบริษัทได้" }, { status: 403 })
  }
  const body = (await req.json().catch(() => null)) as Partial<CompanyConfig> | null
  if (!body) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 })

  const db = (await clientPromise).db(DB)
  const saved = await saveCompanyConfig(db, body, session?.user?.email ?? "unknown")
  return NextResponse.json(saved)
}
