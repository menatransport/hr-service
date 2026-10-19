import type { Db } from "mongodb"

/**
 * เติมข้อมูลรถที่ "ว่างในสัญญา" จาก vehicle_master ตอนอ่านออกมาใช้ (ไม่แก้ข้อมูลที่บันทึกไว้)
 *
 * ทำไมต้องมี: สัญญาที่สร้างโดยไม่ได้กดดึงข้อมูลรถ จะไม่มีวันจดทะเบียน/สี/เลขเครื่อง ฯลฯ
 * แล้วเอกสารพิมพ์ออกมาเป็นเส้นประว่าง (เจอจริง MTM155 — ข้อมูลอยู่ครบที่รถ แต่ไม่ได้ก๊อปเข้าสัญญา)
 * เติมตอนอ่าน = ไม่ต้องไล่แก้ทีละใบ และพอคีย์ข้อมูลรถเพิ่มภายหลัง เอกสารเก่าก็ขึ้นเองทันที
 * ค่าที่กรอกไว้ในสัญญาแล้วชนะเสมอ — ที่นี่เติมเฉพาะช่องว่าง
 */

/** ทะเบียนไม่เอา prefix "สบ." — สูตรเดียวกับที่ใช้ทั้งระบบ */
const normPlate = (p?: unknown) => String(p ?? "").replace(/^[^0-9]*/, "").trim()

/** field ในสัญญา ← field ในทะเบียนรถ */
const MAP: [contractField: string, vehicleField: string][] = [
  ["truckNumber",             "truckNumber"],
  ["vehicleType",             "vehicleType"],
  ["vehicleCharacteristic",   "characteristic"],
  ["vehicleBrand",            "brand"],
  ["vehicleModel",            "model"],
  ["vehicleRegistrationDate", "registrationDate"],
  ["vehicleColor",            "color"],
  ["chassisNumber",           "chassisNumber"],
  ["engineNumber",            "engineNumber"],
  ["engineSize",              "engineSize"],
]

export function mergeVehicleIntoContract<T extends Record<string, unknown>>(
  contract: T,
  vehicle: Record<string, unknown> | null | undefined,
): T {
  if (!vehicle) return contract
  const out = { ...contract }
  for (const [cf, vf] of MAP) {
    const current = String(out[cf] ?? "").trim()
    const master = String(vehicle[vf] ?? "").trim()
    if (!current && master) (out as Record<string, unknown>)[cf] = master
  }
  return out
}

/** คำนำหน้าผู้ซื้อ: ยึดที่กรอกในสัญญา ไม่งั้นดูจากทะเบียน พขร. รหัสสัญญาเดียวกัน สุดท้าย "นาย" */
async function fillBuyerPrefix<T extends Record<string, unknown>>(db: Db, contract: T): Promise<T> {
  if (String(contract.buyerPrefix ?? "").trim()) return contract
  const code = String(contract.contractCode ?? "").trim()
  const driver = code
    ? await db.collection("drivers").findOne({ contractCode: code }, { projection: { prefix: 1 } })
    : null
  return { ...contract, buyerPrefix: String(driver?.prefix ?? "").trim() || "นาย" }
}

/** อ่านรถของสัญญา (vehicleId ก่อน ไม่งั้นเทียบทะเบียน) แล้วเติมช่องที่ว่าง */
export async function withVehicleDetails<T extends Record<string, unknown>>(db: Db, contract: T): Promise<T> {
  const plate = normPlate(contract.licensePlate)
  if (!plate) return fillBuyerPrefix(db, contract)
  const vehicles = await db.collection("vehicle_master")
    .find({}, { projection: { licensePlate: 1, truckNumber: 1, vehicleType: 1, characteristic: 1, brand: 1, model: 1, registrationDate: 1, color: 1, chassisNumber: 1, engineNumber: 1, engineSize: 1 } })
    .toArray()
  const match = vehicles.find((v) => normPlate(v.licensePlate) === plate)
  return fillBuyerPrefix(db, mergeVehicleIntoContract(contract, match))
}
