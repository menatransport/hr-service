import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { getPlateContractMap, normPlate } from "@/lib/partner/promo-usage"
import { partnerColOf } from "@/lib/db/partner-col"
import { partnerDb } from "@/lib/db/partner"

type PromoCat = "repair" | "pm" | "none"

interface ReportRow {
  date: string
  debtAcceptanceNo: string
  mr: string
  wd: string
  licensePlate: string
  truckNumber: string
  contractCode: string
  driverName: string
  itemName: string
  itemCode: string
  itemGroup: string
  purpose: string
  qty: number
  amount: number
  promoType: PromoCat
  pmType: string
}

/**
 * GET /api/reports/promotions?month=YYYY-MM[&format=xlsx]
 * รายงานสรุปยอดโปรโมชั่นรายเดือน — อ่านจาก stock_movements ที่ถูกจัดประเภทไว้แล้ว
 * (โปรซ่อม/โปร PM จาก field promoType/pmType ที่หน้า vehicle-cost บันทึก) เชื่อมเลข
 * ใบรับสภาพหนี้ผ่าน mr = debt_acceptances.repairOrderNo และหาสัญญาจาก getPlateContractMap
 */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month")
  if (!month || !/^\d{4}-\d{2}$/.test(month))
    return NextResponse.json({ error: "month (YYYY-MM) required" }, { status: 400 })

  const pdb = await partnerDb()
  const db = pdb

  // 1) stock_movements ของเดือนนั้น — ใช้ index บน date (YYYY-MM-DD เทียบแบบ string ได้)
  // เผื่อวันที่ถูกเก็บได้ทั้ง ค.ศ. และ พ.ศ. → กรองทั้งสอง era (มีจริงแค่ era เดียวในข้อมูล)
  const [yy, mm] = month.split("-")
  const y = Number(yy)
  const altY = y > 2500 ? y - 543 : y + 543
  const ranges = [y, altY].map((yr) => ({ date: { $gte: `${yr}-${mm}-01`, $lte: `${yr}-${mm}-31` } }))
  const moves = await partnerColOf(db, "stockMovements")
    .find({ $or: ranges })
    .project({
      date: 1, wd: 1, mr: 1, purpose: 1, itemName: 1, itemCode: 1, itemGroup: 1,
      licensePlate: 1, truckNumber: 1, driverName: 1, issueQty: 1, amount: 1,
      promoType: 1, pmType: 1,
    })
    .toArray()

  // 2) map mr -> เลขใบรับสภาพหนี้
  const mrs = [...new Set(moves.map((m) => String(m.mr ?? "")).filter(Boolean))]
  const das = mrs.length
    ? await partnerColOf(db, "debtAcceptances")
        .find({ repairOrderNo: { $in: mrs } })
        .project({ repairOrderNo: 1, debtAcceptanceNo: 1 })
        .toArray()
    : []
  const daByMr = new Map(das.map((d) => [String(d.repairOrderNo), String(d.debtAcceptanceNo ?? "")]))

  // 3) map ทะเบียน -> สัญญา/คนขับ
  const idMap = await getPlateContractMap(db)

  // 4) แปลงเป็นแถวรายงาน
  const rows: ReportRow[] = moves.map((m) => {
    const promo = String(m.promoType ?? "")
    const cat: PromoCat = promo === "repair" ? "repair" : promo === "pm" ? "pm" : "none"
    const id = idMap.get(normPlate(String(m.licensePlate ?? "")))
    return {
      date:             String(m.date ?? ""),
      debtAcceptanceNo: daByMr.get(String(m.mr ?? "")) ?? "",
      mr:               String(m.mr ?? ""),
      wd:               String(m.wd ?? ""),
      licensePlate:     String(m.licensePlate ?? ""),
      truckNumber:      String(m.truckNumber ?? "") || (id?.truckNumber ?? ""),
      contractCode:     id?.contractCode ?? "",
      driverName:       String(m.driverName ?? "") || (id?.driverName ?? ""),
      itemName:         String(m.itemName ?? ""),
      itemCode:         String(m.itemCode ?? ""),
      itemGroup:        String(m.itemGroup ?? ""),
      purpose:          String(m.purpose ?? ""),
      qty:              Number(m.issueQty ?? 0),
      amount:           Number(m.amount ?? 0),
      promoType:        cat,
      pmType:           cat === "pm" ? String(m.pmType ?? "") : "",
    }
  })
  // เรียงใหม่→เก่า แล้วตาม mr เพื่อให้แถวของ MR เดียวกันติดกัน
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.mr < b.mr ? -1 : a.mr > b.mr ? 1 : 0))

  const sumBy = (c: PromoCat) => rows.filter((r) => r.promoType === c).reduce((s, r) => s + r.amount, 0)
  const cntBy = (c: PromoCat) => rows.filter((r) => r.promoType === c).length
  const summary = {
    total:       rows.reduce((s, r) => s + r.amount, 0),
    totalCount:  rows.length,
    repair:      sumBy("repair"), repairCount: cntBy("repair"),
    pm:          sumBy("pm"),     pmCount:     cntBy("pm"),
    owe:         sumBy("none"),   oweCount:    cntBy("none"),
    debtCount:   new Set(rows.map((r) => r.debtAcceptanceNo).filter(Boolean)).size,
  }

  // ── Excel export ──
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const label: Record<PromoCat, string> = { repair: "โปรซ่อม", pm: "โปร PM", none: "ไม่เข้าโปร (รับผิด)" }
    const sheet = rows.map((r) => ({
      "วันที่": r.date,
      "เลขใบรับสภาพหนี้": r.debtAcceptanceNo,
      "MR": r.mr,
      "WD": r.wd,
      "ทะเบียน": r.licensePlate,
      "สัญญา": r.contractCode,
      "คนขับ": r.driverName,
      "ชื่อสินค้า": r.itemName,
      "รหัสสินค้า": r.itemCode,
      "กลุ่มสินค้า": r.itemGroup,
      "จ่าย": r.qty,
      "ยอดเงิน": r.amount,
      "ประเภท": label[r.promoType] + (r.pmType ? ` (${r.pmType})` : ""),
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), month)
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="promo-report-${month}.xlsx"`,
      },
    })
  }

  return NextResponse.json({ month, summary, rows })
}
