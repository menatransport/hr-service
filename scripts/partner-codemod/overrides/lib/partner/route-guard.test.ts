import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import * as rbac from "@/lib/partner/rbac"
import { apiPathOf, needFor } from "@/scripts/partner-codemod/route-guard.mjs"

/**
 * ทุก handler ที่เขียนข้อมูลใน app/api/partner/** ต้องเรียก `requirePartnerPerm(need)` เป็นคำสั่งแรก
 * และ need ต้องตรงกับตารางเดิม (`domainOfApiPath` + กติกา DELETE/upload/module-status ของ lib/auth/gate.ts)
 * — สแกนไฟล์จริง ไม่ต่อฐาน
 */
const ROOT = path.resolve(__dirname, "../..")
const API = path.join(ROOT, "app/api/partner")

function routes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return routes(full)
    return /^route\.tsx?$/.test(e.name) ? [path.relative(ROOT, full).split(path.sep).join("/")] : []
  })
}

const HANDLER = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g

describe("RBAC ชั้น route ของ /api/partner", () => {
  const files = routes(API)
  const cases = files.flatMap((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8")
    return [...src.matchAll(HANDLER)].map((m) => ({ f, method: m[1], after: src.slice(m.index!, m.index! + 1200) }))
  })

  it("พบ handler ที่เขียนข้อมูล (กันเทสต์ผ่านเพราะสแกนไม่เจออะไร)", () => {
    expect(files.length).toBeGreaterThan(90)
    expect(cases.length).toBeGreaterThan(80)
  })

  it.each(cases.map((c) => [`${c.method} ${apiPathOf(c.f)}`, c] as const))("%s เรียก requirePartnerPerm ตามตาราง", (_n, c) => {
    const need = needFor(apiPathOf(c.f), c.method, rbac)
    if (need === null) {
      expect(c.after).not.toMatch(/requirePartnerPerm/)
      return
    }
    // คำสั่งแรกในตัวฟังก์ชัน
    const body = c.after.slice(c.after.indexOf("{", c.after.indexOf(")")) + 1)
    const first = body.replace(/^\s*(\/\/[^\n]*\n\s*)*/, "")
    const expected = need === "upload" ? "login" : need
    expect(first.startsWith(`const perm = await requirePartnerPerm("${expected}")`)).toBe(true)
    if (need === "upload") expect(body).toMatch(/canUpload\(perm\.user\.role\)/)
  })

  it("DELETE ทุกตัว = admin ขึ้นไป · cron ไม่ถูกครอบ", () => {
    for (const c of cases.filter((x) => x.method === "DELETE")) {
      expect(c.after).toMatch(/requirePartnerPerm\("(admin|manage_users)"\)/)
    }
    expect(needFor("/api/partner/cron/deals", "POST", rbac)).toBeNull()
    expect(needFor("/api/partner/module-status", "POST", rbac)).toBe("login")
    expect(needFor("/api/partner/ledger/[id]", "PATCH", rbac)).toBe("finance")
    expect(needFor("/api/partner/admin/month-summary", "POST", rbac)).toBe("admin")
  })
})
