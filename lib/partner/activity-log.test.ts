import { describe, it, expect } from "vitest"
import { diffFields } from "./activity-log"

const KEYS = ["saleStatus", "repairStart", "repairEnd"]

describe("diffFields", () => {
  it("returns only changed fields with { from, to }", () => {
    const before = { saleStatus: "ready", repairStart: null, repairEnd: null }
    const after  = { saleStatus: "repair15", repairStart: "2026-07-09", repairEnd: "2026-07-24" }
    expect(diffFields(before, after, KEYS)).toEqual({
      saleStatus:  { from: "ready", to: "repair15" },
      repairStart: { from: null, to: "2026-07-09" },
      repairEnd:   { from: null, to: "2026-07-24" },
    })
  })

  it("returns empty object when nothing changed", () => {
    const row = { saleStatus: "ready", repairStart: null, repairEnd: null }
    expect(diffFields(row, { ...row }, KEYS)).toEqual({})
  })

  it("treats undefined (absent field) as equal to null", () => {
    expect(diffFields({}, { saleStatus: null, repairStart: null, repairEnd: null }, KEYS)).toEqual({})
  })

  it("logs a change when a field goes from a value back to null", () => {
    const before = { saleStatus: "repair15", repairStart: "2026-07-09", repairEnd: "2026-07-24" }
    const after  = { saleStatus: "ready", repairStart: null, repairEnd: null }
    expect(diffFields(before, after, KEYS)).toEqual({
      saleStatus:  { from: "repair15", to: "ready" },
      repairStart: { from: "2026-07-09", to: null },
      repairEnd:   { from: "2026-07-24", to: null },
    })
  })

  it("handles a null 'before' (first-ever edit)", () => {
    expect(diffFields(null, { saleStatus: "ready" }, ["saleStatus"])).toEqual({
      saleStatus: { from: null, to: "ready" },
    })
  })

  it("ignores keys not in the tracked list", () => {
    const before = { saleStatus: "ready", other: 1 }
    const after  = { saleStatus: "ready", other: 999 }
    expect(diffFields(before, after, ["saleStatus"])).toEqual({})
  })
})
