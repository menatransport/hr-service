import { describe, it, expect } from "vitest"
import { composeThaiAddress, listProvinces, listDistricts, listSubdistricts, type ProvinceNode } from "./thai-address"
import data from "@/partner-assets/data/thai-address.json"

const DB = data as unknown as ProvinceNode[]

describe("composeThaiAddress", () => {
  it("uses ต./อ./จ. for a normal province", () => {
    expect(composeThaiAddress({
      addressDetail: "99/1 ม.2", subdistrict: "เกาะกลาง", district: "เกาะลันตา",
      province: "กระบี่", postalCode: "81120",
    })).toBe("99/1 ม.2 ต.เกาะกลาง อ.เกาะลันตา จ.กระบี่ 81120")
  })

  it("uses แขวง/เขต and no จ. prefix for Bangkok", () => {
    expect(composeThaiAddress({
      addressDetail: "10 ถ.สุขุมวิท", subdistrict: "คลองตัน", district: "คลองเตย",
      province: "กรุงเทพมหานคร", postalCode: "10110",
    })).toBe("10 ถ.สุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110")
  })

  it("skips empty parts", () => {
    expect(composeThaiAddress({ province: "กระบี่" })).toBe("จ.กระบี่")
    expect(composeThaiAddress({})).toBe("")
    expect(composeThaiAddress({ addressDetail: "  " })).toBe("")
  })
})

describe("dataset lookups", () => {
  it("has 77 provinces", () => {
    expect(listProvinces(DB).length).toBe(77)
  })
  it("lists อำเภอ for a province", () => {
    expect(listDistricts(DB, "กระบี่")).toContain("เกาะลันตา")
    expect(listDistricts(DB, undefined)).toEqual([])
  })
  it("returns ตำบล + zip for province/อำเภอ", () => {
    const t = listSubdistricts(DB, "กระบี่", "เกาะลันตา").find((x) => x.n === "เกาะกลาง")
    expect(t?.z).toBe("81120")
    expect(listSubdistricts(DB, "กระบี่", undefined)).toEqual([])
  })
})
