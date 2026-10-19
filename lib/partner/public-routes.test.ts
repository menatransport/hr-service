import assert from "node:assert/strict"
import { test } from "node:test"

import { isPublicPath } from "@/lib/partner/public-routes"

test("เปิดเฉพาะเส้นทางสาธารณะที่ตั้งใจ", () => {
  for (const p of ["/trucks", "/trucks/me009-hino-fm2p-2561", "/api/public/trucks", "/og/truck/x", "/sitemap.xml", "/robots.txt", "/api/partner/cron/deals"])
    assert.equal(isPublicPath(p), true, p)
})

test("หน้าระบบภายในต้องไม่หลุดเป็น public", () => {
  for (const p of ["/", "/partner", "/partner/drivers", "/payroll", "/api/partner/drivers", "/api/partner/contracts",
    "/api/partner/upload", "/partner/admin/users", "/api/cron/media-retention", "/api/partner/session"])
    assert.equal(isPublicPath(p), false, p)
})

test("กันชื่อ path ที่ขึ้นต้นคล้ายกันแต่ไม่ใช่ของสาธารณะ", () => {
  assert.equal(isPublicPath("/trucksecret"), false)
  assert.equal(isPublicPath("/api/publicity"), false)
  assert.equal(isPublicPath("/api/partner/cronx"), false)
})
