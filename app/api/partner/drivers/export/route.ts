import { NextResponse } from "next/server"
import * as XLSX from "xlsx"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB   = PARTNER_DB
const COLL = "drivers"

// Column order for the exported sheet
const HEADERS: { key: string; label: string }[] = [
  { key: "staffCode",    label: "รหัสพนักงาน" },
  { key: "firstName",   label: "ชื่อ" },
  { key: "lastName",    label: "นามสกุล" },
  { key: "birthDate",   label: "วันเกิด (YYYY-MM-DD)" },
  { key: "nationalId",  label: "เลขบัตรประชาชน" },
  { key: "phone",       label: "เบอร์โทรศัพท์" },
  { key: "fleet",       label: "Fleet" },
  { key: "plant",       label: "Plant" },
  { key: "address",     label: "ที่อยู่" },
  { key: "startDate",   label: "เริ่มงาน (YYYY-MM-DD)" },
  { key: "endDate",     label: "สิ้นสุด (YYYY-MM-DD)" },
  { key: "isDriver",    label: "พนักงานขับรถ (TRUE/FALSE)" },
  { key: "isTruckOwner", label: "เจ้าของรถ (TRUE/FALSE)" },
  { key: "status",      label: "สถานะ (active/inactive)" },
]

export async function GET() {
  const client = await clientPromise
  const drivers = await client.db(DB).collection(COLL)
    .find({})
    .sort({ firstName: 1, lastName: 1 })
    .toArray()

  const rows = drivers.map((d) =>
    Object.fromEntries(
      HEADERS.map(({ key }) => [
        HEADERS.find((h) => h.key === key)!.label,
        key === "isDriver" || key === "isTruckOwner"
          ? d[key] ? "TRUE" : "FALSE"
          : (d[key] ?? ""),
      ])
    )
  )

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: HEADERS.map((h) => h.label),
  })

  // Column widths
  ws["!cols"] = HEADERS.map((h) =>
    h.key === "address" ? { wch: 40 } : { wch: Math.max(h.label.length + 4, 18) }
  )

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "พนักงาน")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="drivers_${today}.xlsx"`,
    },
  })
}
