import { describe, it, expect } from "vitest"
import { makeSlug, uniqueSlug, registrationYear, toPublicTruck, isReadyForSale, isAvailable } from "@/lib/partner/public-trucks"

describe("makeSlug", () => {
  it("สร้างจาก เบอร์รถ-ยี่ห้อ-รุ่น-ปีพ.ศ.", () => {
    expect(makeSlug({ truckNumber: "ME009", brand: "HINO", model: "FM2P", registrationDate: "2018-03-01" }))
      .toBe("me009-hino-fm2p-2561")
  })

  it("ตัดอักขระพิเศษและช่องว่างเป็นขีด", () => {
    expect(makeSlug({ truckNumber: "ME 010", brand: "ISUZU", model: "FVM 34W/T", registrationDate: "2017-01-01" }))
      .toBe("me-010-isuzu-fvm-34w-t-2560")
  })

  it("ไม่มีปี → ไม่ต่อท้ายปี", () => {
    expect(makeSlug({ truckNumber: "ME011", brand: "SANY", model: "SY306" })).toBe("me011-sany-sy306")
  })

  it("ไม่มีเบอร์รถ → ใช้ hash ของทะเบียน ไม่เผยทะเบียน", () => {
    const s = makeSlug({ brand: "HINO", model: "FM2P", licensePlate: "สบ.71-1956" })
    expect(s).toMatch(/^t-[a-f0-9]{6}-hino-fm2p$/)
    expect(s).not.toContain("71")
    expect(s).not.toContain("1956")
  })

  it("ภาษาไทยล้วน → ยังได้ slug ที่ใช้ได้", () => {
    const s = makeSlug({ truckNumber: "รถ01", brand: "ฮีโน่", model: "มิกเซอร์", licensePlate: "สบ.70-1111" })
    expect(s).toMatch(/^[a-z0-9-]+$/)
    expect(s.length).toBeGreaterThan(0)
  })
})

describe("uniqueSlug", () => {
  it("ว่างอยู่ → คืนค่าเดิม", () => {
    expect(uniqueSlug("me009-hino", new Set())).toBe("me009-hino")
  })
  it("ชนกัน → ต่อ -2 แล้ว -3", () => {
    expect(uniqueSlug("me009-hino", new Set(["me009-hino"]))).toBe("me009-hino-2")
    expect(uniqueSlug("me009-hino", new Set(["me009-hino", "me009-hino-2"]))).toBe("me009-hino-3")
  })
})

describe("registrationYear", () => {
  it("คืนปี ค.ศ. จากวันที่ ISO", () => expect(registrationYear("2018-03-01")).toBe(2018))
  it("ว่าง/พัง → null", () => {
    expect(registrationYear("")).toBeNull()
    expect(registrationYear(undefined)).toBeNull()
    expect(registrationYear("ไม่ใช่วันที่")).toBeNull()
  })
})

describe("toPublicTruck — field allowlist", () => {
  const vehicle = {
    _id: "68c0ffee",
    licensePlate: "สบ.71-1956",
    truckNumber: "ME009",
    brand: "HINO", model: "FM2P", vehicleType: "รถผสมปูน", characteristic: "10 ล้อ",
    color: "ขาว", registrationDate: "2018-03-01", engineSize: "7790 cc / 240 hp",
    chassisNumber: "NKRHF1234567", engineNumber: "6HK1-99999",
    registrationDocUrl: "https://spaces/doc.pdf",
    photoUrl: "https://spaces/front.jpg",
    photos: { front: "https://spaces/front.jpg", back: "", left: "", right: "", cabin: "" },
    status: "active",
  }
  const price = { totalSalePrice: 1450000, downPayment: 200000, cashDown: 50000, monthlyPayment: 35000, financeInstallments: 48, saleStatus: "ready", costBasis: 900000 }

  it("ไม่มี field ต้องห้ามหลุดออกมาแม้แต่ตัวเดียว", () => {
    const out = toPublicTruck(vehicle, price, [], "me009-hino-fm2p-2561", false)
    const forbidden = ["chassisNumber", "engineNumber", "registrationDocUrl", "_id", "saleStatus", "costBasis", "status", "contractCode", "driverName"]
    for (const k of forbidden) expect(out).not.toHaveProperty(k)
    expect(JSON.stringify(out)).not.toContain("NKRHF")
    expect(JSON.stringify(out)).not.toContain("6HK1")
  })

  it("เบอร์รถกับทะเบียนออกสู่หน้าเว็บ (ผู้ใช้สั่ง 2026-10-09)", () => {
    const out = toPublicTruck(vehicle, price, [], "me009-hino-fm2p-2561", false)
    expect(out.truckNumber).toBe("ME009")
    expect(out.licensePlate).toBe("สบ.71-1956")
  })

  it("map ข้อมูลที่เปิดเผยได้ครบ", () => {
    const promos = [{ badge: "ต่อที่ 1", title: "ฟรีค่าซ่อมบำรุง", lines: [["ฟรีค่าซ่อมบำรุง วงเงิน ", { b: "120,000 บาท" }]] }]
    const out = toPublicTruck(vehicle, price, promos, "me009-hino-fm2p-2561", false)
    expect(out).toMatchObject({
      slug: "me009-hino-fm2p-2561", truckNumber: "ME009", brand: "HINO", model: "FM2P",
      registrationYear: 2018, totalSalePrice: 1450000, monthlyPayment: 35000,
      financeInstallments: 48, promos, isSold: false,
    })
  })

  it("display = ราคาปัดเลข + ลงตัว (ราคาจริงคงอยู่ใน totalSalePrice)", () => {
    const out = toPublicTruck(vehicle, price, [], "x", false)
    expect(out.totalSalePrice).toBe(1450000)
    expect(out.display).toEqual({ price: 200000 + 35000 * 48, monthlyPayment: 35000, downPayment: 200000 })
    expect(out.display.price % 1000).toBe(0)
  })

  it("ไม่มีแถวราคา → ตัวเลขเป็น 0 ไม่ใช่ undefined", () => {
    const out = toPublicTruck(vehicle, undefined, [], "x", true)
    expect(out.totalSalePrice).toBe(0)
    expect(out.monthlyPayment).toBe(0)
    expect(out.isSold).toBe(true)
  })

  it("isReady = ยังไม่ขาย + saleStatus ready (ติดดาว ★★★★★ บนเว็บ)", () => {
    expect(toPublicTruck(vehicle, price, [], "x", false).isReady).toBe(true)
    expect(toPublicTruck(vehicle, { ...price, saleStatus: "repair15" }, [], "x", false).isReady).toBe(false)
    expect(toPublicTruck(vehicle, { ...price, saleStatus: undefined }, [], "x", false).isReady).toBe(false)
    expect(toPublicTruck(vehicle, price, [], "x", true).isReady).toBe(false)
  })
})

describe("isAvailable — รถ \"ว่าง\" ตามหน้า /price-list", () => {
  it("ว่าง = มีแถวราคา + ไม่ inactive + ไม่มีสัญญา (ไม่สน saleStatus)", () => {
    expect(isAvailable({ status: "active", licensePlate: "สบ.71-1956" }, { saleStatus: "ready" }, new Set())).toBe(true)
    expect(isAvailable({ status: "active", licensePlate: "สบ.71-1956" }, { saleStatus: "review" }, new Set())).toBe(true)
    expect(isAvailable({ status: "active", licensePlate: "สบ.71-1956" }, {}, new Set())).toBe(true)
  })
  it("ไม่มี status ใน vehicle_master → ถือว่าว่าง (ตรงกับ /price-list)", () => {
    expect(isAvailable({ licensePlate: "สบ.71-1956" }, {}, new Set())).toBe(true)
  })
  it("inactive / ติดสัญญา / ไม่มีแถวราคา → ไม่ว่าง", () => {
    expect(isAvailable({ status: "inactive", licensePlate: "สบ.71-1956" }, {}, new Set())).toBe(false)
    expect(isAvailable({ status: "active", licensePlate: "สบ.71-1956" }, {}, new Set(["71-1956"]))).toBe(false)
    expect(isAvailable({ status: "active", licensePlate: "สบ.71-1956" }, undefined, new Set())).toBe(false)
  })
})

describe("isReadyForSale", () => {
  const ready = { saleStatus: "ready" }
  it("พร้อมขาย = ไม่ inactive + ไม่มีสัญญา + saleStatus ready", () => {
    expect(isReadyForSale({ status: "active", licensePlate: "สบ.71-1956" }, ready, new Set())).toBe(true)
  })
  it("รถ inactive → ไม่ขึ้นเว็บ", () => {
    expect(isReadyForSale({ status: "inactive", licensePlate: "สบ.71-1956" }, ready, new Set())).toBe(false)
  })
  it("มีสัญญา active → ไม่ขึ้นเว็บ", () => {
    expect(isReadyForSale({ status: "active", licensePlate: "สบ.71-1956" }, ready, new Set(["71-1956"]))).toBe(false)
  })
  it("saleStatus ไม่ใช่ ready → ไม่ขึ้นเว็บ", () => {
    expect(isReadyForSale({ status: "active", licensePlate: "สบ.71-1956" }, { saleStatus: "repair15" }, new Set())).toBe(false)
  })
  it("ไม่มีแถวราคาเลย → ไม่ขึ้นเว็บ", () => {
    expect(isReadyForSale({ status: "active", licensePlate: "สบ.71-1956" }, undefined, new Set())).toBe(false)
  })
})
