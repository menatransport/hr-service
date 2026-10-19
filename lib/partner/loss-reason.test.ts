import { describe, it, expect } from "vitest"
import { LOSS_REASON_SEED, reasonsForStage, type LossReason } from "@/lib/partner/loss-reason"

const all = LOSS_REASON_SEED as LossReason[]

describe("เหตุผลที่ดีลหลุด", () => {
  it("แต่ละขั้นเห็นเฉพาะเหตุผลของกลุ่มตัวเอง", () => {
    const lead = reasonsForStage(all, "LEAD").map((r) => r.label)
    expect(lead).toContain("อายุเกินเกณฑ์")
    expect(lead).not.toContain("งานหนักกว่าที่คาด")

    const training = reasonsForStage(all, "TRAINING").map((r) => r.label)
    expect(training).toContain("บริษัทไม่รับ – ฝีมือขับ")
    expect(training).not.toContain("ราคาสูงเกิน")
  })

  it("เหตุผลของระบบ (ปิดอัตโนมัติ) ไม่ให้เซลล์เลือกเอง", () => {
    for (const stage of ["LEAD", "QUOTED", "TRAINING", "DELIVERED"]) {
      expect(reasonsForStage(all, stage).some((r) => r.isSystem)).toBe(false)
    }
    expect(all.find((r) => r.code === "NO_ACTIVITY_30D")?.isSystem).toBe(true)
  })

  it("ทุกขั้นที่ยังไม่จบต้องมีเหตุผลให้เลือกอย่างน้อย 1 ข้อ", () => {
    const stages = ["LEAD", "QUALIFIED", "QUOTED", "VIEWING_SCHEDULED", "RESERVED", "TRAINING", "CONTRACT_SCHEDULED", "CONTRACT_SIGNED", "DELIVERED"]
    for (const s of stages) expect(reasonsForStage(all, s).length).toBeGreaterThan(0)
  })

  it("code ไม่ซ้ำกัน", () => {
    expect(new Set(all.map((r) => r.code)).size).toBe(all.length)
  })
})
