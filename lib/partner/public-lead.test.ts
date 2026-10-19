import { describe, it, expect } from "vitest"
import { parseLead, allowRequest } from "@/lib/partner/public-lead"

const good = { name: "สมชาย ใจดี", phone: "0812345678", slug: "me009-hino-fm2p-2561", budgetDown: 200000, message: "สนใจครับ" }

describe("parseLead", () => {
  it("ข้อมูลถูกต้อง → ผ่าน", () => {
    const r = parseLead(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.phone).toBe("0812345678")
  })

  it("honeypot มีค่า → ปฏิเสธ (บอท)", () => {
    expect(parseLead({ ...good, website: "http://spam.example" }).ok).toBe(false)
  })

  it("เบอร์ไม่ใช่รูปแบบไทย → ปฏิเสธ", () => {
    expect(parseLead({ ...good, phone: "12345" }).ok).toBe(false)
    expect(parseLead({ ...good, phone: "+1 555 0100" }).ok).toBe(false)
  })

  it("เบอร์มีขีด/เว้นวรรค → normalize เหลือตัวเลข", () => {
    const r = parseLead({ ...good, phone: "081-234-5678" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.phone).toBe("0812345678")
  })

  it("ไม่มีชื่อ → ปฏิเสธ", () => {
    expect(parseLead({ ...good, name: "  " }).ok).toBe(false)
  })

  it("ข้อความยาวเกิน → ตัดที่ 500 ตัวอักษร", () => {
    const r = parseLead({ ...good, message: "ก".repeat(800) })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.message.length).toBe(500)
  })

  it("field แปลกปลอมถูกทิ้ง ไม่หลุดเข้า DB", () => {
    const r = parseLead({ ...good, status: "won", salesEmail: "x@y.com" })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).not.toHaveProperty("status")
      expect(r.data).not.toHaveProperty("salesEmail")
    }
  })
})

describe("allowRequest", () => {
  it("5 ครั้งแรกผ่าน ครั้งที่ 6 ถูกบล็อก", () => {
    const ip = `test-${Math.random()}`
    const t = 1_700_000_000_000
    for (let i = 0; i < 5; i++) expect(allowRequest(ip, t)).toBe(true)
    expect(allowRequest(ip, t)).toBe(false)
  })

  it("พ้น 1 ชม. แล้วนับใหม่", () => {
    const ip = `test-${Math.random()}`
    const t = 1_700_000_000_000
    for (let i = 0; i < 5; i++) allowRequest(ip, t)
    expect(allowRequest(ip, t + 60 * 60 * 1000 + 1)).toBe(true)
  })
})
