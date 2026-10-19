import { NextRequest, NextResponse } from "next/server"
import { computeInstallmentStates, type DriverListStatus } from "@/lib/partner/driver-state"
import { partnerDb, partnerColOf } from "@/lib/db/partner"
import { requirePartnerPerm } from "@/lib/partner/auth/server"
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q      = searchParams.get("q")?.trim() ?? ""
  const status = (searchParams.get("status")?.trim() ?? "") as DriverListStatus
  const wantCounts = searchParams.get("counts") === "1"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {}
  if (q) {
    filter["$or"] = [
      { firstName:  { $regex: q, $options: "i" } },
      { lastName:   { $regex: q, $options: "i" } },
      { nationalId: { $regex: q, $options: "i" } },
      { staffCode:  { $regex: q, $options: "i" } },
      { phone:      { $regex: q, $options: "i" } },
      { address:    { $regex: q, $options: "i" } },
    ]
  }
  if (status === "active" || status === "paying" || status === "paidoff") filter.status = "active"
  else if (status === "exit")     { filter.status = "inactive"; filter.exitType = { $exists: true, $ne: null } }
  else if (status === "inactive") { filter.status = "inactive"; filter.exitType = { $in: [null, ""] } }
  else if (wantCounts)            { /* นับทุกสถานะ — ไม่กรอง */ }

  const pdb = await partnerDb()
  const db     = pdb
  const raw    = await partnerColOf(db, "drivers")
    .find(filter)
    .sort({ firstName: 1, lastName: 1 })
    .toArray()

  // installmentState (derived) เฉพาะคนขับ active — จาก contracts + driver_ledger ค่างวดรถ
  const states = await computeInstallmentStates(
    db,
    raw.filter((d) => d.status === "active").map((d) => String(d.contractCode ?? "")),
  )
  const items = raw.map((d) => {
    if (d.status !== "active") return d
    const code = String(d.contractCode ?? "").trim()
    return { ...d, installmentState: code ? (states.get(code) ?? "paying") : "paying" }
  })

  if (wantCounts) {
    // นับจากชุดเต็ม (ไม่ใช่ชุดที่กรอง) เพื่อให้ตัวเลขบนแท็บคงที่
    const counts = { all: items.length, paying: 0, paidoff: 0, exit: 0, inactive: 0 }
    for (const d of items) {
      if (d.status === "active") { if (d.installmentState === "paidoff") counts.paidoff++; else counts.paying++ }
      else if (d.exitType) counts.exit++
      else counts.inactive++
    }
    return NextResponse.json(counts)
  }

  const filtered =
    status === "paying"  ? items.filter((d) => d.installmentState === "paying")  :
    status === "paidoff" ? items.filter((d) => d.installmentState === "paidoff") : items
  return NextResponse.json(filtered)
}

export async function POST(req: NextRequest) {
  // RBAC ชั้น route (scripts/partner-codemod/route-guard.mjs)
  const perm = await requirePartnerPerm("masterdata")
  if (perm instanceof Response) return perm

  const body = await req.json() as {
    prefix?:       string
    firstName:     string
    lastName:      string
    birthDate?:    string
    nationalId?:   string
    address?:      string
    contractCode?: string
    staffCode?:     string
    phone?:         string
    bankName?:      string
    accountNumber?: string
    idCardUrl?:      string
    licenseUrl?:     string
    houseRegUrl?:    string
    bankBookUrl?:    string
    tax50BisUrl?:    string
    photoUrl?:       string
    licenseNumber?:  string
    licenseType?:    string
    licenseExpiry?:  string
    isTruckOwner?: boolean
    isDriver?:     boolean
    startDate?:    string
    endDate?:      string
    status?:       string
  }

  if (!body.firstName?.trim() || !body.lastName?.trim()) {
    return NextResponse.json({ error: "firstName and lastName required" }, { status: 400 })
  }

  const now = new Date()
  const pdb = await partnerDb()
  const result = await partnerColOf(pdb, "drivers").insertOne({
    prefix:       body.prefix?.trim() || "นาย",
    firstName:    body.firstName.trim(),
    lastName:     body.lastName.trim(),
    birthDate:    body.birthDate?.trim()  ?? null,
    nationalId:   body.nationalId?.trim() ?? null,
    address:      body.address?.trim()    ?? null,
    staffCode:     body.staffCode?.trim()     ?? null,
    contractCode:  body.contractCode?.trim()  ?? null,   // ซ้ำกันได้ — ไม่เช็ค unique
    phone:         body.phone?.trim()         ?? null,
    bankName:      body.bankName?.trim()      ?? null,
    accountNumber: body.accountNumber?.trim() ?? null,
    idCardUrl:      body.idCardUrl?.trim()      ?? null,
    licenseUrl:     body.licenseUrl?.trim()     ?? null,
    houseRegUrl:    body.houseRegUrl?.trim()    ?? null,
    bankBookUrl:    body.bankBookUrl?.trim()    ?? null,
    tax50BisUrl:    body.tax50BisUrl?.trim()    ?? null,
    photoUrl:       body.photoUrl?.trim()       ?? null,
    licenseNumber:  body.licenseNumber?.trim()  ?? null,
    licenseType:    body.licenseType?.trim()    ?? null,
    licenseExpiry:  body.licenseExpiry?.trim()  ?? null,
    isTruckOwner: body.isTruckOwner      ?? false,
    isDriver:     body.isDriver          ?? true,
    startDate:    body.startDate?.trim()  ?? null,
    endDate:      body.endDate?.trim()    ?? null,
    workHistory: [],  // ประวัติการทำงาน — เพิ่มภายหลังในหน้าแก้ไข
    status:       body.status            ?? "active",
    createdAt:    now,
    updatedAt:    now,
  })

  return NextResponse.json({ ok: true, id: result.insertedId.toHexString() })
}
