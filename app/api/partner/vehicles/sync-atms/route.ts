import { NextResponse } from "next/server"
import clientPromise, { PARTNER_DB } from "@/lib/partner/mongo"

const DB        = PARTNER_DB
const COLL      = "vehicle_master"
const ATMS_DB   = "atms"
const ATMS_COLL = "vehiclemaster"

/** ค่าจาก ATMS ที่ถือว่า "ว่าง" — pandas export ทิ้ง "nan"/"-" ไว้ */
function clean(v: unknown): string {
  const s = String(v ?? "").trim()
  return s === "" || s.toLowerCase() === "nan" || s === "-" ? "" : s
}

/**
 * POST /api/vehicles/sync-atms — เติมข้อมูลรถจาก atms.vehiclemaster (match ด้วยทะเบียน)
 * เติมเฉพาะฟิลด์ที่ยังว่างใน vehicle_master เท่านั้น — ไม่ทับข้อมูลที่กรอกเอง
 * (middleware บังคับ admin สำหรับ method ที่ไม่ใช่ GET อยู่แล้ว)
 */
export async function POST() {
  const client = await clientPromise
  const app  = client.db(DB).collection(COLL)
  const atms = client.db(ATMS_DB).collection(ATMS_COLL)

  // index ทะเบียน → เอกสาร ATMS (ถ้าทะเบียนซ้ำใน ATMS ใช้ตัวแรก)
  const atmsRows = await atms.find({}).toArray()
  const byPlate = new Map<string, Record<string, unknown>>()
  for (const r of atmsRows) {
    const plate = clean(r["ทะเบียน"])
    if (plate && !byPlate.has(plate)) byPlate.set(plate, r)
  }

  const vehicles = await app.find({}).toArray()
  let matched = 0
  let updated = 0
  let fieldsFilled = 0
  const unmatched: string[] = []

  for (const v of vehicles) {
    const plate = String(v.licensePlate ?? "").trim()
    const src = byPlate.get(plate)
    if (!src) { unmatched.push(plate); continue }
    matched++

    const hp = clean(src["แรงม้า"])
    const mapped: Record<string, string> = {
      truckNumber:    clean(src["เลขรถ"]),
      brand:          clean(src["ยี่ห้อ"]),
      model:          clean(src["รุ่น"]),
      vehicleType:    clean(src["ประเภทยานพาหนะ"]),
      characteristic: clean(src["ประเภทยานพาหนะเพิ่มเติม"]),
      chassisNumber:  clean(src["เลขตัวถัง"]),
      engineNumber:   clean(src["เลขเครื่องยนต์"]),
      engineSize:     hp && hp !== "0" ? `${hp} แรงม้า` : "",
    }

    // เติมเฉพาะช่องที่ app ยังว่างและ ATMS มีข้อมูล
    const $set: Record<string, string> = {}
    for (const [key, val] of Object.entries(mapped)) {
      const current = String(v[key] ?? "").trim()
      if (!current && val) { $set[key] = val; fieldsFilled++ }
    }

    if (Object.keys($set).length > 0) {
      $set.updatedAt = new Date().toISOString()
      await app.updateOne({ _id: v._id }, { $set })
      updated++
    }
  }

  return NextResponse.json({
    total: vehicles.length,
    matched,
    updated,
    fieldsFilled,
    unmatched,
  })
}
