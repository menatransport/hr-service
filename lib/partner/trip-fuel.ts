/**
 * เฟส 1 payroll: สรุปค่าเที่ยว + กระทบยอดเชื้อเพลิง ต่อ พขร. ต่อเดือน
 * แหล่งข้อมูล: mena-bi.driverCost (ระดับใบ LDT, sync จาก ATMS) — cluster เดียวกับแอป
 *
 * สูตร (ถอดจากชีต "ค่าขนส่ง" ของไฟล์ Payroll จริง — ยืนยันตัวเลขแล้ว):
 *   ใช้จริง(ลิตร)   = เติมจริง + ยกเข้า − ยกออก
 *   เกินอนุมัติ     = max(0, ใช้จริง − อนุมัติ)   · ต่ำกว่า = max(0, อนุมัติ − ใช้จริง)
 *   หักค่าเชื้อเพลิง = ใช้จริง × ราคา (ดีเซล/NGV แยก)
 *   เงินเกินเรต     = เกิน × ราคาเกินเรต — เก็บจริงเมื่อยอด > เกณฑ์ (1,000) + ค่าปรับ, ไม่เกินเกณฑ์ = ยกให้
 *   เงินคืนต่ำกว่าเรต = ต่ำกว่า × ราคาต่ำกว่าเรต (คืนเต็มจำนวน)
 *   คงเหลือ         = ค่าเที่ยว − หักเชื้อเพลิง − เงินเกินเรต + เงินคืน
 */
import "server-only"
import type { Db } from "mongodb"
import { normPlate } from "@/lib/partner/promo-usage"

export const TF_COLL = "trip_fuel_monthly"
export const TF_CONFIG = "trip_fuel_config"
const BI_DB = "mena-bi"

export interface TripFuelConfig {
  month: string          // "YYYY-MM"
  dieselPrice: number    // บาท/ลิตร (หักตามใช้จริง)
  dieselOverPrice: number
  dieselUnderPrice: number
  ngvPrice: number
  ngvOverPrice: number
  ngvUnderPrice: number
  overThreshold: number  // เกณฑ์ยกให้ (default 1,000)
  overPenalty: number    // ค่าปรับเมื่อเกินเกณฑ์
}

export const DEFAULT_CONFIG: Omit<TripFuelConfig, "month"> = {
  dieselPrice: 0, dieselOverPrice: 0, dieselUnderPrice: 0,
  ngvPrice: 0, ngvOverPrice: 0, ngvUnderPrice: 0,
  overThreshold: 1000, overPenalty: 0,
}

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? 0)); return isNaN(n) ? 0 : n }

/* eslint-disable @typescript-eslint/no-explicit-any */

/** คำนวณ field อนุพันธ์ของแถว (หลังแก้ยกเข้า/ยกออก หรือราคา) */
export function computeRow(row: any, cfg: TripFuelConfig): any {
  const dUsed = r2(num(row.dieselFilled) + num(row.dieselCarryIn) - num(row.dieselCarryOut))
  const nUsed = r2(num(row.ngvFilled) + num(row.ngvCarryIn) - num(row.ngvCarryOut))
  const dOver = Math.max(0, r2(dUsed - num(row.dieselApproved)))
  const dUnder = Math.max(0, r2(num(row.dieselApproved) - dUsed))
  const nOver = Math.max(0, r2(nUsed - num(row.ngvApproved)))
  const nUnder = Math.max(0, r2(num(row.ngvApproved) - nUsed))
  const overRaw = r2(dOver * cfg.dieselOverPrice + nOver * cfg.ngvOverPrice)
  const overMoney = overRaw > cfg.overThreshold ? r2(overRaw + cfg.overPenalty) : 0
  const underMoney = r2(dUnder * cfg.dieselUnderPrice + nUnder * cfg.ngvUnderPrice)
  const fuelDeduct = r2(dUsed * cfg.dieselPrice + nUsed * cfg.ngvPrice)
  return {
    ...row,
    dieselUsed: dUsed, dieselOver: dOver, dieselUnder: dUnder,
    ngvUsed: nUsed, ngvOver: nOver, ngvUnder: nUnder,
    overRaw, overMoney, underMoney, fuelDeduct,
    netAfterFuel: r2(num(row.tripFee) - fuelDeduct - overMoney + underMoney),
  }
}

/** ดึงสรุปจาก BI ต่อเดือน — กรองเฉพาะรถร่วมมีนา + ตั๋วไม่ยกเลิก · group ต่อ พขร.
 *  fleet: mixer = ไม่มีหาง (โม่) · trailer = มีหาง · all = ทั้งหมด — payroll Mixer ใช้ mixer เท่านั้น */
export async function aggregateFromBI(client: any, month: string, fleet: "mixer" | "trailer" | "all" = "mixer") {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10))
  const bi = client.db(BI_DB).collection("driverCost")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = { _year: y, _month: m, "ประเภทรถร่วม": "รถร่วมมีนา", "สถานะตั๋ว": { $ne: "ยกเลิก" } }
  if (fleet === "mixer") q["$or"] = [{ "หาง": null }, { "หาง": "" }]
  if (fleet === "trailer") q["หาง"] = { $nin: [null, ""] }
  const cur = bi.find(
    q,
    { projection: {
        "พจส1": 1, "พจส2": 1, "หัว": 1, "หาง": 1, "LDT": 1,
        "ค่าเที่ยว พจส 1": 1, "ค่าเที่ยว พจส 2": 1,
        "ค่าดรอปพจส.1 (ทั่วไป)": 1, "ค่าดรอปพจส.1 (ข้ามจังหวัด)": 1,
        "ค่าดรอปพจส.2 (ทั่วไป)": 1, "ค่าดรอปพจส.2 (ข้ามจังหวัด)": 1,
        "เงินเพิ่ม พจส 1": 1, "เงินเพิ่ม พจส 2": 1,
        "Rate น้ำมัน พจส 1": 1, "Rate น้ำมัน พจส 2": 1,
        "เติมน้ำมันจริง พจส 1": 1, "เติมน้ำมันจริง พจส 2": 1,
        "Rate NGV พจส 1": 1, "Rate NGV พจส 2": 1,
        "เติม NGV จริง พจส 1": 1, "เติม NGV จริง พจส 2": 1,
      } }
  )
  const acc = new Map<string, any>()
  let rows = 0
  for await (const t of cur) {
    rows++
    for (const i of [1, 2] as const) {
      const name = String(t[`พจส${i}`] ?? "").trim()
      if (!name) continue
      let a = acc.get(name)
      if (!a) {
        a = { driverName: name, tripCount: 0, tripFee: 0, dropFee: 0, extraFee: 0,
              dieselApproved: 0, dieselFilled: 0, ngvApproved: 0, ngvFilled: 0, plates: new Map<string, number>() }
        acc.set(name, a)
      }
      a.tripCount += 1
      a.tripFee += num(t[`ค่าเที่ยว พจส ${i}`])
      a.dropFee += num(t[`ค่าดรอปพจส.${i} (ทั่วไป)`]) + num(t[`ค่าดรอปพจส.${i} (ข้ามจังหวัด)`])
      a.extraFee += num(t[`เงินเพิ่ม พจส ${i}`])
      a.dieselApproved += num(t[`Rate น้ำมัน พจส ${i}`])
      a.dieselFilled += num(t[`เติมน้ำมันจริง พจส ${i}`])
      a.ngvApproved += num(t[`Rate NGV พจส ${i}`])
      a.ngvFilled += num(t[`เติม NGV จริง พจส ${i}`])
      const plate = String(t["หัว"] ?? "").trim()
      if (plate) a.plates.set(plate, (a.plates.get(plate) ?? 0) + 1)
    }
  }
  // ทะเบียนที่วิ่งบ่อยสุดของแต่ละคน → ผูกสัญญา
  const out = [...acc.values()].map((a) => {
    const top = [...a.plates.entries()].sort((x, y) => y[1] - x[1])[0]
    return {
      driverName: a.driverName,
      tripCount: a.tripCount,
      tripFee: r2(a.tripFee), // ค่าเที่ยวล้วน (ตรงชีตสรุปค่าเที่ยว) — ดรอป/เงินเพิ่มแยกหมวด ไม่รวมในนี้
      tripFeeBase: r2(a.tripFee), dropFee: r2(a.dropFee), extraFee: r2(a.extraFee),
      dieselApproved: r2(a.dieselApproved), dieselFilled: r2(a.dieselFilled),
      ngvApproved: r2(a.ngvApproved), ngvFilled: r2(a.ngvFilled),
      licensePlate: top?.[0] ?? "",
      plateCount: a.plates.size,
    }
  })
  return { rows, drivers: out }
}

/** map ทะเบียน → contractCode จาก contracts (normalize) */
export async function plateContractMap(db: Db): Promise<Map<string, string>> {
  const cs = await db.collection("contracts").find({}).project({ contractCode: 1, licensePlate: 1, status: 1 }).toArray()
  const map = new Map<string, string>()
  for (const c of cs) {
    const k = normPlate(c.licensePlate as string)
    if (!k) continue
    // สัญญา active ชนะ
    if (!map.has(k) || c.status === "active") map.set(k, c.contractCode as string)
  }
  return map
}


// ═══ อัปโหลดไฟล์ "ค่าเที่ยว Mixer พจร. MM.YY" (ชีตสรุปค่าเที่ยว) — แหล่งหลักแทน BI ═══
export interface TripSummaryRow {
  driverName: string
  tripCount: number
  tripFee: number
  branch: string
  overMoney: number   // สรุปยอดเงินเกินกว่า Rate (หัก)
  underMoney: number  // สรุปยอดเงินเติมต่ำกว่า Rate (คืน)
  fuelDeduct: number  // หักค่าเชื้อเพลิง (บาท)
}

/** อ่านชีต "สรุปค่าเที่ยว" — หา header แถวที่คอลัมน์แรกคือ "พจส." แล้วแมพคอลัมน์จากชื่อหัวตาราง */
export function parseTripSummarySheet(buffer: Buffer): { sheetName: string; rows: TripSummaryRow[] } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx")
  const wb = XLSX.read(buffer, { type: "buffer" })
  let sheetName = wb.SheetNames.find((n) => n.includes("สรุปค่าเที่ยว")) ?? ""
  if (!sheetName) {
    for (const n of wb.SheetNames) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null })
      if (rows.some((r) => String(r?.[0] ?? "").trim() === "พจส.")) { sheetName = n; break }
    }
  }
  if (!sheetName) throw new Error("ไม่พบชีตสรุปค่าเที่ยว (หัวตาราง 'พจส.')")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grid: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null })
  const hIdx = grid.findIndex((r) => String(r?.[0] ?? "").trim() === "พจส.")
  if (hIdx === -1) throw new Error(`ชีต ${sheetName} ไม่มีหัวตาราง "พจส."`)
  const hdr = grid[hIdx].map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
  const col = (frag: string) => hdr.findIndex((h) => h.includes(frag))
  const C = {
    trips: col("จำนวนเที่ยว"), fee: col("ค่าเที่ยว"), branch: col("สาขา"),
    over: col("สรุปยอดเงินเกินกว่า"), under: col("สรุปยอดเงินเติมต่ำกว่า"), deduct: col("หักค่าเชื้อเพลิง"),
  }
  if (C.fee === -1 || C.deduct === -1) throw new Error("หัวตารางไม่ครบ (ต้องมี ค่าเที่ยว + หักค่าเชื้อเพลิง)")
  const num = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : 0)

  const rows: TripSummaryRow[] = []
  for (const r of grid.slice(hIdx + 1)) {
    const name = String(r?.[0] ?? "").trim()
    if (!name || name.startsWith("รวม")) continue
    rows.push({
      driverName: name,
      tripCount: num(r[C.trips]), tripFee: num(r[C.fee]),
      branch: C.branch >= 0 ? String(r[C.branch] ?? "").trim() : "",
      overMoney: C.over >= 0 ? num(r[C.over]) : 0,
      underMoney: C.under >= 0 ? num(r[C.under]) : 0,
      fuelDeduct: num(r[C.deduct]),
    })
  }
  if (rows.length === 0) throw new Error("ไม่พบข้อมูล พจส. ในชีต")
  return { sheetName, rows }
}