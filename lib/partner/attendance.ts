/**
 * เฟส 2 payroll: วันทำงาน พจร. — นำเข้าจาก Excel ชีต "สถานะวันทำงาน พจร." (ไฟล์ที่ทีมทำอยู่แล้ว)
 * เก็บรหัสรายวัน 1..31 + วันทำงานรวม + เบี้ย 5 ตัว (ค่าวินัย/โซนหนาแน่น/ค่าฝีมือ/เบี้ยขยัน/ค่าเช่าบ้าน) + สูตร ได้/ไม่ได้
 */
import "server-only"
import * as XLSX from "xlsx"

export const ATT_COLL = "attendance_monthly"

export interface AttendanceRow {
  driverName: string
  staffCode: string
  truckNumber: string
  licensePlate: string
  driverStatus: string   // พจร / พจส
  employer: string       // ผู้ว่าจ้าง
  plant: string
  days: string[]         // รหัสรายวัน index 0..30 ("A", "0.75", "ล", ...)
  workDays: number       // วันทำงานรวม (จากไฟล์ ถ้าไม่มีคำนวณ: A*=1, ตัวเลข=ตามเลข, อื่น=0)
  allowances: { discipline: number; denseZone: number; skill: number; diligence: number; houseRent: number }
  eligible: boolean      // คอลัมน์ "สูตร" = ได้
  warnings: string[]
}

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")); return isNaN(n) ? 0 : n }
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, "").trim()

/* eslint-disable @typescript-eslint/no-explicit-any */

/** หา index คอลัมน์จากแถวหัวตาราง (ชื่อคอลัมน์อาจมีขึ้นบรรทัด/วรรค) */
function colIndex(header: unknown[], ...names: string[]): number {
  return header.findIndex((h) => {
    const n = norm(h)
    return n !== "" && names.some((x) => n.includes(norm(x)))
  })
}

export function parseAttendanceSheet(buffer: Buffer): { rows: AttendanceRow[]; sheetName: string } {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false })
  const sheetName = wb.SheetNames.find((n) => n.includes("สถานะวันทำงาน")) ?? wb.SheetNames[0]
  const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: null }) as unknown[][]

  // หาแถวหัวตาราง: ต้องมีทั้ง ทะเบียนรถ และ ชื่อ-นามสกุล
  const hIdx = all.findIndex((r) => colIndex(r, "ทะเบียนรถ") !== -1 && colIndex(r, "ชื่อ-นามสกุล", "ชื่อนามสกุล") !== -1)
  if (hIdx === -1) throw new Error("ไม่พบแถวหัวตาราง (ต้องมีคอลัมน์ ทะเบียนรถ + ชื่อ-นามสกุล)")
  const H = all[hIdx]

  const ix = {
    truckNumber: colIndex(H, "เบอร์รถ"),
    plate: colIndex(H, "ทะเบียนรถ"),
    status: colIndex(H, "สถานะ"),
    staffCode: colIndex(H, "รหัสพนักงาน", "รหัส"),
    name: colIndex(H, "ชื่อ-นามสกุล", "ชื่อนามสกุล"),
    employer: colIndex(H, "ผู้ว่าจ้าง"),
    plant: colIndex(H, "แพล้นท์"),
    total: colIndex(H, "รวมวันทำงาน"),
    discipline: colIndex(H, "ค่าวินัย"),
    denseZone: colIndex(H, "โซนหนาแน่น"),
    skill: colIndex(H, "ค่าฝีมือ"),
    diligence: colIndex(H, "เบี้ยขยัน"),
    houseRent: colIndex(H, "ค่าเช่าบ้าน"),
    formula: colIndex(H, "สูตร"),
  }
  // คอลัมน์วัน 1..31 (หัวเป็นเลข)
  const dayIdx: number[] = []
  for (let d = 1; d <= 31; d++) {
    const i = H.findIndex((h) => norm(h) === String(d))
    dayIdx.push(i)
  }
  if (dayIdx.filter((i) => i !== -1).length < 28) throw new Error("ไม่พบคอลัมน์วันที่ 1–31 ครบ (เจอ " + dayIdx.filter((i) => i !== -1).length + " วัน)")

  const rows: AttendanceRow[] = []
  for (let r = hIdx + 1; r < all.length; r++) {
    const row = all[r]
    const name = String(row?.[ix.name] ?? "").trim()
    if (!name) continue
    const days = dayIdx.map((i) => (i === -1 ? "" : String(row[i] ?? "").trim()))
    // วันทำงาน: ใช้ค่าจากไฟล์ก่อน — ไม่มีค่อยคำนวณ (A*/ตัวเลข)
    const fileTotal = ix.total !== -1 ? num(row[ix.total]) : 0
    const calcTotal = days.reduce((s, c) => {
      if (!c) return s
      if (/^A/i.test(c)) return s + 1
      const f = parseFloat(c)
      return isNaN(f) ? s : s + f
    }, 0)
    const warnings: string[] = []
    if (fileTotal > 0 && Math.abs(fileTotal - calcTotal) > 0.01) warnings.push(`วันทำงานไฟล์ ${fileTotal} ≠ คำนวณ ${calcTotal}`)
    rows.push({
      driverName: name,
      staffCode: String(row[ix.staffCode] ?? "").trim(),
      truckNumber: String(row[ix.truckNumber] ?? "").trim(),
      licensePlate: String(row[ix.plate] ?? "").trim(),
      driverStatus: String(row[ix.status] ?? "").trim(),
      employer: String(row[ix.employer] ?? "").trim(),
      plant: String(row[ix.plant] ?? "").trim(),
      days,
      workDays: fileTotal > 0 ? fileTotal : Math.round(calcTotal * 100) / 100,
      allowances: {
        discipline: num(row[ix.discipline]),
        denseZone: num(row[ix.denseZone]),
        skill: num(row[ix.skill]),
        diligence: num(row[ix.diligence]),
        houseRent: num(row[ix.houseRent]),
      },
      eligible: norm(row[ix.formula]).includes("ได้") && !norm(row[ix.formula]).includes("ไม่ได้"),
      warnings,
    })
  }
  return { rows, sheetName }
}
