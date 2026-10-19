import { describe, it, expect } from "vitest"
import {
  DRIVER_PHOTO_FIELDS, parseRotateRequest, isRotatableImageUrl, isOwnStorageUrl,
} from "@/lib/partner/driver-photo"

const OWN = "https://mn-bucket.sgp1.digitaloceanspaces.com/mena-partner/drivers/1_a.jpg"

describe("parseRotateRequest", () => {
  it("รับเฉพาะช่องรูปใน allowlist", () => {
    expect(parseRotateRequest({ field: "idCardUrl", deg: 90 })).toEqual({ field: "idCardUrl", deg: 90 })
    for (const f of DRIVER_PHOTO_FIELDS) expect(parseRotateRequest({ field: f, deg: 180 })).toEqual({ field: f, deg: 180 })
  })

  it("ปฏิเสธ field อื่น (กันเขียนทับข้อมูลคนขับช่องอื่น)", () => {
    for (const f of ["accountNumber", "nationalId", "tax50BisUrl", "", null, { $ne: 1 }])
      expect(parseRotateRequest({ field: f, deg: 90 })).toHaveProperty("error")
  })

  it("รับเฉพาะ 90/180/270", () => {
    expect(parseRotateRequest({ field: "idCardUrl", deg: 270 })).toEqual({ field: "idCardUrl", deg: 270 })
    for (const d of [0, 45, 360, -90, "90deg", null, undefined, NaN])
      expect(parseRotateRequest({ field: "idCardUrl", deg: d })).toHaveProperty("error")
  })

  it('เลขที่ส่งมาเป็นสตริง "90" ใช้ได้ (ฟอร์มส่งค่ามาเป็น string ได้)', () => {
    expect(parseRotateRequest({ field: "idCardUrl", deg: "90" })).toEqual({ field: "idCardUrl", deg: 90 })
  })

  it("body ว่าง/ไม่ใช่ object → error ไม่ throw", () => {
    for (const b of [undefined, null, {}, "x", 5]) expect(parseRotateRequest(b)).toHaveProperty("error")
  })
})

describe("isRotatableImageUrl", () => {
  it("รูปหมุนได้ PDF หมุนไม่ได้", () => {
    expect(isRotatableImageUrl(OWN)).toBe(true)
    expect(isRotatableImageUrl("https://x/y/a.PNG?v=2")).toBe(true)
    expect(isRotatableImageUrl("https://x/y/a.pdf")).toBe(false)
    expect(isRotatableImageUrl("https://x/y/a.PDF?dl=1")).toBe(false)
    expect(isRotatableImageUrl("")).toBe(false)
  })
})

describe("isOwnStorageUrl", () => {
  it("รับเฉพาะ bucket ของเรา (กัน SSRF)", () => {
    expect(isOwnStorageUrl(OWN, "mn-bucket", "sgp1")).toBe(true)
    expect(isOwnStorageUrl("https://mn-bucket.sgp1.cdn.digitaloceanspaces.com/a.jpg", "mn-bucket", "sgp1")).toBe(true)
    expect(isOwnStorageUrl("http://mn-bucket.sgp1.digitaloceanspaces.com/a.jpg", "mn-bucket", "sgp1")).toBe(false) // ต้อง https
    expect(isOwnStorageUrl("https://evil.com/a.jpg", "mn-bucket", "sgp1")).toBe(false)
    expect(isOwnStorageUrl("https://mn-bucket.sgp1.digitaloceanspaces.com.evil.com/a.jpg", "mn-bucket", "sgp1")).toBe(false)
    expect(isOwnStorageUrl("https://other.sgp1.digitaloceanspaces.com/a.jpg", "mn-bucket", "sgp1")).toBe(false)
    expect(isOwnStorageUrl("http://169.254.169.254/latest/meta-data/", "mn-bucket", "sgp1")).toBe(false)
    expect(isOwnStorageUrl("ไม่ใช่ url", "mn-bucket", "sgp1")).toBe(false)
    expect(isOwnStorageUrl(OWN, undefined, "sgp1")).toBe(false)   // ไม่ได้ตั้ง bucket = ไม่ให้ผ่าน
  })
})
