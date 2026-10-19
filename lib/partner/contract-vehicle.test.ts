import { describe, it, expect } from "vitest"
import { mergeVehicleIntoContract } from "@/lib/partner/contract-vehicle"

const vehicle = {
  licensePlate: "สบ.71-7681", truckNumber: "TH1724", brand: "ISUZU", model: "FXZ77NXFXS",
  vehicleType: "รถผสมปูน", characteristic: "10 ล้อ", registrationDate: "2017-03-22",
  color: "ขาว แดง", chassisNumber: "MP1FXZ77NFT000462", engineNumber: "6UZ1-PZ8372", engineSize: "360 แรงม้า",
}

describe("mergeVehicleIntoContract", () => {
  it("เติมเฉพาะช่องที่ว่างในสัญญา (เคสจริง MTM155)", () => {
    const out = mergeVehicleIntoContract(
      { licensePlate: "สบ.71-7681", vehicleBrand: "ISUZU", vehicleRegistrationDate: "", vehicleColor: "" },
      vehicle,
    )
    expect(out.vehicleRegistrationDate).toBe("2017-03-22")
    expect(out.vehicleColor).toBe("ขาว แดง")
  })

  it("ค่าที่กรอกในสัญญาแล้วชนะข้อมูลรถเสมอ", () => {
    const out = mergeVehicleIntoContract(
      { vehicleColor: "ขาว", vehicleRegistrationDate: "2015-01-01" },
      vehicle,
    )
    expect(out.vehicleColor).toBe("ขาว")
    expect(out.vehicleRegistrationDate).toBe("2015-01-01")
  })

  it("ช่องว่างที่ข้อมูลรถก็ว่าง → ยังว่างเหมือนเดิม ไม่ใส่ค่ามั่ว", () => {
    const out = mergeVehicleIntoContract({ vehicleColor: "" }, { ...vehicle, color: "" })
    expect(out.vehicleColor).toBe("")
  })

  it("ไม่มีรถที่ตรงกัน → คืนสัญญาเดิม", () => {
    const c = { vehicleColor: "", vehicleRegistrationDate: "" }
    expect(mergeVehicleIntoContract(c, null)).toEqual(c)
  })
})
