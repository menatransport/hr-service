import { describe, it, expect } from "vitest"
import {
  STAGES, PHASES, nextStage, isOpen, screeningChecklist, missingToAdvance,
  checkAdvance, checkTransition, ageFrom, yearsHeld, daysSinceDelivery, type DealFields,
} from "@/lib/partner/deal-stage"

const NOW = new Date("2026-09-24T00:00:00Z")

/** ดีลที่ผ่านคัดกรองครบ 7 ข้อ */
const screenedOk = {
  screening: {
    birthDate: "1985-01-01",            // อายุ 41
    licenseIssueDate: "2020-01-01",     // ถือมา 6 ปี
    licenseType: "ท.2",
    noCriminalRecord: true, notBlacklisted: true, downPaymentReady: true,
    canDriveMixer: true, hasGuarantor: true,
  },
}

describe("โครงสถานะ", () => {
  it("มี 10 ขั้น เรียงตามด่าน 5 ด่าน", () => {
    expect(STAGES).toHaveLength(10)
    expect(PHASES.flatMap((p) => p.stages)).toEqual([...STAGES])
  })
  it("ขั้นสุดท้ายไม่มีขั้นถัดไป และถือว่าจบแล้ว", () => {
    expect(nextStage("COMPLETED_90D")).toBeNull()
    expect(isOpen("COMPLETED_90D")).toBe(false)
    expect(isOpen("CLOSED_LOST")).toBe(false)
    expect(isOpen("ON_HOLD")).toBe(true)
    expect(isOpen("TRAINING")).toBe(true)
  })
})

describe("เช็กลิสต์คัดกรอง 7 ข้อ", () => {
  it("อายุกับใบขับขี่คำนวณเอง ไม่ใช่ติ๊ก", () => {
    const list = screeningChecklist(screenedOk, NOW)
    expect(list).toHaveLength(7)
    expect(list.filter((c) => c.auto).map((c) => c.key)).toEqual(["age", "license"])
    expect(list.every((c) => c.pass)).toBe(true)
  })

  it("อายุเกิน 52 → ไม่ผ่าน", () => {
    const d = { screening: { ...screenedOk.screening, birthDate: "1970-01-01" } }
    expect(screeningChecklist(d, NOW).find((c) => c.key === "age")?.pass).toBe(false)
  })

  it("ใบขับขี่ ท.1 หรือถือไม่ถึง 1 ปี → ไม่ผ่าน", () => {
    const t1 = { screening: { ...screenedOk.screening, licenseType: "ท.1" } }
    const fresh = { screening: { ...screenedOk.screening, licenseIssueDate: "2026-06-01" } }
    expect(screeningChecklist(t1, NOW).find((c) => c.key === "license")?.pass).toBe(false)
    expect(screeningChecklist(fresh, NOW).find((c) => c.key === "license")?.pass).toBe(false)
  })

  it("ageFrom / yearsHeld คำนวณถูกและกันค่าว่าง", () => {
    expect(ageFrom("1985-10-01", NOW)).toBe(40)   // ยังไม่ถึงวันเกิด
    expect(ageFrom(undefined)).toBeNull()
    expect(yearsHeld("2025-09-24", NOW)).toBeCloseTo(1, 1)
    expect(yearsHeld("ไม่ใช่วันที่")).toBeNull()
  })
})

describe("เงื่อนไขก่อนขยับขั้น", () => {
  it("LEAD ต้องผ่านคัดกรองครบก่อน", () => {
    expect(missingToAdvance({ stage: "LEAD" }, "LEAD", NOW)[0]).toContain("เช็กลิสต์คัดกรองยังไม่ผ่าน")
    expect(missingToAdvance({ stage: "LEAD", ...screenedOk }, "LEAD", NOW)).toEqual([])
  })

  it("QUALIFIED ต้องมีใบเสนอราคา + วันที่ส่ง", () => {
    expect(missingToAdvance({}, "QUALIFIED", NOW)).toEqual(["แนบใบเสนอราคา", "วันที่ส่งใบเสนอราคา"])
    const ok: DealFields = { attachments: [{ type: "QUOTATION", url: "https://x/q.pdf" }], quotationSentAt: "2026-09-01" }
    expect(missingToAdvance(ok, "QUALIFIED", NOW)).toEqual([])
  })

  it("VIEWING_SCHEDULED ต้องมีสลิปและจำนวนเงินจอง (ใช้ depositAmount เดิมได้)", () => {
    expect(missingToAdvance({}, "VIEWING_SCHEDULED", NOW)).toHaveLength(2)
    const ok: DealFields = { attachments: [{ type: "RESERVATION_SLIP", url: "u" }], depositAmount: 20000 }
    expect(missingToAdvance(ok, "VIEWING_SCHEDULED", NOW)).toEqual([])
  })

  it("TRAINING ต้องผลผ่าน + วันนัดเซ็น", () => {
    expect(missingToAdvance({ trainingResult: "FAILED", contractDate: "2026-10-01" }, "TRAINING", NOW))
      .toEqual([expect.stringContaining("ผลฝึกงานต้องเป็น ผ่าน")])
    expect(missingToAdvance({ trainingResult: "PASSED", contractDate: "2026-10-01" }, "TRAINING", NOW)).toEqual([])
  })

  it("DELIVERED ต้องครบ 90 วันจริง ๆ", () => {
    const d90 = { deliveredAt: "2026-06-01" }   // 115 วัน
    const d10 = { deliveredAt: "2026-09-14" }   // 10 วัน
    expect(daysSinceDelivery(d90, NOW)).toBe(115)
    expect(missingToAdvance(d90, "DELIVERED", NOW)).toEqual([])
    expect(missingToAdvance(d10, "DELIVERED", NOW)[0]).toContain("ต้องครบ 90 วัน")
  })
})

describe("การขยับขั้น", () => {
  it("ข้อมูลครบ → บอกขั้นถัดไป", () => {
    const r = checkAdvance({ stage: "LEAD", ...screenedOk }, NOW)
    expect(r).toMatchObject({ ok: true, to: "QUALIFIED", missing: [] })
  })

  it("ข้อมูลไม่ครบ → ขยับไม่ได้ พร้อมบอกว่าขาดอะไร", () => {
    const r = checkAdvance({ stage: "QUOTED" }, NOW)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(["วันนัดดูรถ"])
  })

  it("ข้ามขั้นไม่ได้", () => {
    const r = checkTransition({ stage: "LEAD", ...screenedOk }, "QUOTED", { now: NOW })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("ข้ามขั้นไม่ได้")
  })

  it("ถอยขั้นได้เฉพาะผู้ดูแล", () => {
    expect(checkTransition({ stage: "QUOTED" }, "LEAD", { now: NOW }).error).toContain("เฉพาะผู้ดูแล")
    expect(checkTransition({ stage: "QUOTED" }, "LEAD", { isAdmin: true, now: NOW }).ok).toBe(true)
  })

  it("ดีลที่พัก/ปิดแล้ว ขยับตรง ๆ ไม่ได้", () => {
    expect(checkTransition({ stage: "ON_HOLD" }, "QUOTED", { now: NOW }).error).toContain("พักติดตาม")
    expect(checkAdvance({ stage: "CLOSED_LOST" }, NOW).ok).toBe(false)
  })

  it("สถานะปลายทางมั่ว → ปฏิเสธ", () => {
    expect(checkTransition({ stage: "LEAD" }, "SOMETHING", { now: NOW }).error).toContain("ไม่ถูกต้อง")
  })
})
