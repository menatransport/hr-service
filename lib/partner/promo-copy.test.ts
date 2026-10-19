import { describe, it, expect } from "vitest"
import { promoCopy, promoLineText } from "@/lib/partner/promo-copy"

const text = (m: Parameters<typeof promoCopy>[0]) =>
  promoCopy(m).map((p) => ({ badge: p.badge, title: p.title, lines: p.lines.map(promoLineText), note: p.note }))

describe("promoCopy — ถ้อยคำตามฝ่ายขาย", () => {
  it("ครบ 3 ต่อ ตรงข้อความที่ฝ่ายขายส่งมา (สบ.70-6298)", () => {
    expect(text({
      pro1Condition: "9 ฟรี 1", pro1FreeCount: 7, pro1TotalValue: 120140,
      pro2RepairBudget: 120000, pro3AnnualPm: 10070,
    })).toEqual([
      {
        badge: "ต่อที่ 1", title: "ฟรีค่างวด", note: undefined,
        lines: [
          "ผ่อนค่างวดครบทุก ๆ 9 งวด",
          "รับฟรี",
          "งวดที่ 10,20,30,40,50,60,70",
          "รวมรับฟรี 7 งวด",
          "มูลค่ารวม 120,140 บาท",
        ],
      },
      { badge: "ต่อที่ 2", title: "ฟรีค่าซ่อมบำรุง", note: undefined, lines: ["ฟรีค่าซ่อมบำรุง วงเงิน 120,000 บาท"] },
      {
        badge: "ต่อที่ 3", title: "ฟรีเปลี่ยนถ่ายน้ำมันเครื่อง (PM)",
        lines: [
          "ฟรีเปลี่ยนถ่ายน้ำมันเครื่อง ไส้กรอง",
          "และของเหลวสำคัญตามระยะ",
          "ทุก ๆ 6 เดือน *",
          "PM (บำรุงรักษาเชิงป้องกัน)",
          "มูลค่ารวม 10,070 บาท/ปี",
        ],
        note: "*เงื่อนไขอาจมีการเปลี่ยนแปลง เป็นไปตามที่บริษัทกำหนด",
      },
    ])
  })

  it("ตัวเลขเน้นเป็นตัวหนา + รับฟรี ตัวใหญ่", () => {
    const [pro1] = promoCopy({ pro1Condition: "9 ฟรี 1", pro1FreeCount: 7, pro1TotalValue: 120140 })
    expect(pro1.lines[1]).toEqual([{ big: "รับฟรี" }])
    expect(pro1.lines[2]).toContainEqual({ b: "10,20,30,40,50,60,70" })
    expect(pro1.lines[4]).toContainEqual({ b: "120,140 บาท" })
  })

  it("งวดที่ฟรีตามเงื่อนไข N ฟรี M อื่น", () => {
    const [pro1] = text({ pro1Condition: "11 ฟรี 1", pro1FreeCount: 3, pro1TotalValue: 45000 })
    expect(pro1.lines.slice(0, 3)).toEqual(["ผ่อนค่างวดครบทุก ๆ 11 งวด", "รับฟรี", "งวดที่ 12,24,36"])
  })

  it("เลขลำดับต่อที่ ไล่ตามโปรฯ ที่มีจริง", () => {
    expect(text({ pro2RepairBudget: 120000, pro3AnnualPm: 10070 }).map((p) => p.badge)).toEqual(["ต่อที่ 1", "ต่อที่ 2"])
  })

  it("ตัวเลขเป็น string จาก Mongo ก็ได้", () => {
    expect(text({ pro3AnnualPm: "10070" })[0].lines.at(-1)).toBe("มูลค่ารวม 10,070 บาท/ปี")
  })

  it("titleParts ต่อกันได้ title พอดี", () => {
    for (const p of promoCopy({ pro1FreeCount: 7, pro1TotalValue: 1, pro2RepairBudget: 1, pro3AnnualPm: 1 }))
      if (p.titleParts) expect(p.titleParts.join("")).toBe(p.title)
  })

  it("ไม่มีโปรฯ → ลิสต์ว่าง", () => {
    expect(promoCopy(undefined)).toEqual([])
    expect(promoCopy({ pro1FreeCount: 0, pro1TotalValue: 0, pro2RepairBudget: 0, pro3AnnualPm: 0 })).toEqual([])
  })
})
