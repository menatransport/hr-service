import { describe, it, expect } from "vitest"
import {
  applyFilter, openByStage, lostByStage, lossReasonByMonth, avgDaysPerStage,
  trainingToDelivered, signedToCompleted, funnel, followUpOverdue,
  type MetricDeal, type HistoryRow,
} from "@/lib/partner/deal-metrics"

const NOW = new Date("2026-09-24T00:00:00Z")
const day = (iso: string) => `${iso}T00:00:00.000Z`

const deals: MetricDeal[] = [
  { _id: "1", quotationNo: "A", stage: "QUOTED", salesName: "แอน", sourceChannel: "เฟซบุ๊ก", createdAt: day("2026-08-01") },
  { _id: "2", quotationNo: "B", stage: "ON_HOLD", stageBeforeHold: "QUOTED", nextFollowUpDate: "2026-09-10", holdReason: "รอเงินดาวน์จากญาติ", salesName: "แอน", createdAt: day("2026-08-05") },
  { _id: "3", quotationNo: "C", stage: "ON_HOLD", stageBeforeHold: "TRAINING", nextFollowUpDate: "2026-12-01", salesName: "บี", createdAt: day("2026-08-06") },
  { _id: "4", quotationNo: "D", stage: "CLOSED_LOST", lostAtStage: "TRAINING", lossReasonLabel: "งานหนักกว่าที่คาด", lostAt: day("2026-09-02"), trainingResult: "FAILED", salesName: "บี", createdAt: day("2026-07-01") },
  { _id: "5", quotationNo: "E", stage: "CLOSED_LOST", lostAtStage: "QUOTED", lossReasonLabel: "ราคาสูงเกิน", lostAt: day("2026-09-05"), salesName: "แอน", createdAt: day("2026-07-02") },
  { _id: "6", quotationNo: "F", stage: "DELIVERED", trainingResult: "PASSED", deliveredAt: day("2026-09-01"), salesName: "แอน", createdAt: day("2026-05-01") },
  { _id: "7", quotationNo: "G", stage: "COMPLETED_90D", trainingResult: "PASSED", salesName: "บี", createdAt: day("2026-03-01") },
]

const history: HistoryRow[] = [
  { dealId: "6", fromStage: "TRAINING", toStage: "CONTRACT_SCHEDULED", changedAt: day("2026-06-01") },
  { dealId: "6", fromStage: "CONTRACT_SCHEDULED", toStage: "CONTRACT_SIGNED", changedAt: day("2026-06-11") },
  { dealId: "6", fromStage: "CONTRACT_SIGNED", toStage: "DELIVERED", changedAt: day("2026-09-01") },
  { dealId: "7", fromStage: "CONTRACT_SCHEDULED", toStage: "CONTRACT_SIGNED", changedAt: day("2026-03-10") },
  { dealId: "7", fromStage: "CONTRACT_SIGNED", toStage: "DELIVERED", changedAt: day("2026-03-20") },
  { dealId: "7", fromStage: "DELIVERED", toStage: "COMPLETED_90D", changedAt: day("2026-06-20") },
]

describe("ตัวกรองแดชบอร์ด", () => {
  it("กรองตามช่วงวันที่สร้างดีล เซลล์ และช่องทาง", () => {
    expect(applyFilter(deals, { from: "2026-08-01" }).length).toBe(3)
    expect(applyFilter(deals, { salesName: "บี" }).map((d) => d.quotationNo)).toEqual(["C", "D", "G"])
    expect(applyFilter(deals, { sourceChannel: "เฟซบุ๊ก" }).map((d) => d.quotationNo)).toEqual(["A"])
  })
})

describe("ดีลค้างแต่ละขั้น", () => {
  it("นับดีลที่ทำอยู่ และแยกดีลพักติดตามให้เห็นตามขั้นเดิม", () => {
    const rows = openByStage(deals)
    const quoted = rows.find((r) => r.stage === "QUOTED")!
    const training = rows.find((r) => r.stage === "TRAINING")!
    expect(quoted).toMatchObject({ active: 1, onHold: 1 })
    expect(training).toMatchObject({ active: 0, onHold: 1 })
  })
  it("ไม่นับขั้นจบ (ครบ 90 วัน) เป็นดีลค้าง", () => {
    expect(openByStage(deals).map((r) => String(r.stage))).not.toContain("COMPLETED_90D")
  })
})

describe("ดีลที่หลุด", () => {
  it("บอกว่าหลุดขั้นไหนมากสุด", () => {
    expect(lostByStage(deals)).toEqual([
      { stage: "QUOTED", label: "เสนอราคาแล้ว", count: 1 },
      { stage: "TRAINING", label: "ฝึกงาน", count: 1 },
    ])
  })
  it("จัดกลุ่มเหตุผลรายเดือน เดือนล่าสุดก่อน", () => {
    const m = lossReasonByMonth(deals)
    expect(m[0].month).toBe("2026-09")
    expect(m[0].reasons.map((r) => r.label).sort()).toEqual(["งานหนักกว่าที่คาด", "ราคาสูงเกิน"])
  })
})

describe("เวลาเฉลี่ยต่อขั้น", () => {
  it("คิดจากเวลาที่เข้าขั้นจนออกจากขั้น", () => {
    const rows = avgDaysPerStage(history, NOW)
    expect(rows.find((r) => r.stage === "CONTRACT_SCHEDULED")?.days).toBe(10)   // ดีล 6: 1→11 มิ.ย.
    // ดีล 6 ค้างขั้นเซ็นสัญญา 11 มิ.ย.→1 ก.ย. = 82 วัน · ดีล 7 = 10 วัน → เฉลี่ย 46
    expect(rows.find((r) => r.stage === "CONTRACT_SIGNED")?.days).toBe(46)
  })
  it("ขั้นที่ยังไม่ออก นับถึงวันนี้", () => {
    const rows = avgDaysPerStage([{ dealId: "x", fromStage: null, toStage: "QUOTED", changedAt: day("2026-09-14") }], NOW)
    expect(rows.find((r) => r.stage === "QUOTED")?.days).toBe(10)
  })
})

describe("อัตราการผ่านขั้น", () => {
  it("ผ่านฝึกงาน → รับรถจริง", () => {
    // ผ่านฝึก 3 ใบ (F, G) → เคยถึงส่งมอบ 2 ใบ
    const r = trainingToDelivered(deals, history)
    expect(r.passed).toBe(2)
    expect(r.delivered).toBe(2)
    expect(r.rate).toBe(1)
  })

  it("เซ็นสัญญา → ครบ 90 วัน นับเฉพาะใบที่เซ็นมานานพอ", () => {
    const r = signedToCompleted(deals, history, NOW)
    expect(r.eligible).toBe(2)     // ดีล 6 เซ็น 11 มิ.ย. · ดีล 7 เซ็น 10 มี.ค.
    expect(r.completed).toBe(1)    // มีแค่ดีล 7 ที่ครบ 90 วันแล้ว
    expect(r.rate).toBeCloseTo(0.5, 5)
  })

  it("ดีลที่เพิ่งเซ็นยังไม่ถูกนับเป็นตัวหาร", () => {
    const fresh: HistoryRow[] = [{ dealId: "9", fromStage: "CONTRACT_SCHEDULED", toStage: "CONTRACT_SIGNED", changedAt: day("2026-09-20") }]
    expect(signedToCompleted([{ _id: "9", stage: "CONTRACT_SIGNED" }], fresh, NOW).eligible).toBe(0)
  })
})

describe("funnel และการติดตาม", () => {
  it("funnel ไล่ทุกขั้นพร้อมอัตราผ่านจากขั้นก่อน", () => {
    const f = funnel(deals, history)
    expect(f).toHaveLength(10)
    expect(f.find((x) => x.stage === "DELIVERED")?.count).toBe(2)
    expect(f.find((x) => x.stage === "COMPLETED_90D")?.count).toBe(1)
  })

  it("ดีลเลยวันติดตาม เรียงค้างนานสุดก่อน", () => {
    const rows = followUpOverdue(deals, NOW)
    expect(rows.map((r) => r.quotationNo)).toEqual(["B"])
    expect(rows[0].overdueDays).toBe(14)
    expect(rows[0].holdReason).toBe("รอเงินดาวน์จากญาติ")   // ใช้โชว์ในแดชบอร์ดว่าค้างเพราะอะไร
  })
})
