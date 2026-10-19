import assert from "node:assert/strict"
import { describe, it } from "node:test"

import * as rbac from "@/lib/partner/rbac"
import type { PermDomain, Role } from "@/lib/partner/rbac"

/* ── สำเนาของเดิมจาก mena-partner-driver/lib/rbac.ts (ก่อนย้าย) — ใช้เป็นคำตอบอ้างอิงเท่านั้น ── */
const ORIGINAL_MATRIX: Record<Role, readonly PermDomain[]> = {
  superadmin: ["masterdata", "contracts", "promotions", "vehiclecost", "finance", "sales", "cancel_contract", "delete", "lock", "manage_users"],
  admin:      ["masterdata", "contracts", "promotions", "vehiclecost", "finance", "sales", "cancel_contract", "delete", "lock"],
  fleet:      ["masterdata", "contracts", "promotions", "vehiclecost", "sales"],
  finance:    ["finance", "sales"],
  salesperson: ["sales"],
  viewer:     [],
}

/* domainOfApiPath ของเดิม (คัดลอกตรงตัว) */
function originalDomainOfApiPath(pathname: string): PermDomain | null {
  const p = pathname
  if (p.startsWith("/api/drivers") || p.startsWith("/api/vehicles") || p.startsWith("/api/price-list")) return "masterdata"
  if (p.startsWith("/api/contracts")) return "contracts"
  if (p.startsWith("/api/quotations") || p.startsWith("/api/customers")) return "sales"
  if (p.startsWith("/api/catalog")) return "masterdata"   // template catalog (route เช็ค masterdata ซ้ำ)
  if (p.startsWith("/api/promotions")) return "promotions"
  if (
    p.startsWith("/api/vehicle-cost") ||
    p.startsWith("/api/debt-acceptances") ||
    p.startsWith("/api/trips") ||
    p.startsWith("/api/import/debt-acceptance") ||
    p.startsWith("/api/import/stock")
  ) return "vehiclecost"
  if (
    p.startsWith("/api/ledger") ||
    p.startsWith("/api/trip-fuel") ||
    p.startsWith("/api/attendance") ||
    p.startsWith("/api/payroll-extras") ||
    p.startsWith("/api/insurance-tax") ||
    p.startsWith("/api/payroll") ||
    p.startsWith("/api/adjustments") ||
    p.startsWith("/api/month-status") ||
    p.startsWith("/api/import")
  ) return "finance"
  if (p.startsWith("/api/admin/users")) return "manage_users"
  return null
}

const ORIGINAL_SALES_PAGES = ["/price-list", "/quotations", "/catalog"]
function originalSalespersonPageAllowed(pathname: string): boolean {
  if (pathname === "/") return true
  return ORIGINAL_SALES_PAGES.some((base) => pathname === base || pathname.startsWith(base + "/") || pathname.startsWith(base + "?"))
}

const DOMAINS: PermDomain[] = [
  "masterdata", "sales", "contracts", "promotions", "vehiclecost", "finance",
  "cancel_contract", "delete", "lock", "manage_users",
]

/** ทุก prefix ที่ของเดิมรู้จัก + ตัวที่ต้องตก null (default-closed) */
const LEGACY_API = [
  "/api/drivers", "/api/drivers/123", "/api/vehicles/x", "/api/price-list",
  "/api/contracts", "/api/contracts/abc/attachments",
  "/api/quotations", "/api/quotations/1", "/api/customers",
  "/api/catalog", "/api/catalog/pdf",
  "/api/promotions", "/api/promotions/1/confirm",
  "/api/vehicle-cost", "/api/debt-acceptances", "/api/trips", "/api/import/debt-acceptance", "/api/import/stock",
  "/api/ledger", "/api/trip-fuel", "/api/attendance", "/api/payroll-extras", "/api/insurance-tax",
  "/api/payroll", "/api/payroll/run", "/api/adjustments", "/api/month-status", "/api/import", "/api/import/ledger",
  "/api/admin/users", "/api/admin/users/x",
  "/api/upload", "/api/module-status", "/api/something-new", "/api/admin/other",
]

describe("RBAC matrix — 6 บทบาท × ทุก PermDomain ต้องเหมือนของเดิมทุกช่อง", () => {
  it("ROLES ครบ 6 ตัวเหมือนเดิม", () => {
    assert.deepEqual([...rbac.ROLES], ["superadmin", "admin", "fleet", "finance", "salesperson", "viewer"])
  })
  for (const role of rbac.ROLES) {
    for (const domain of DOMAINS) {
      const expected = ORIGINAL_MATRIX[role].includes(domain)
      it(`${role} × ${domain} = ${expected}`, () => {
        assert.equal(rbac.hasPerm(role, domain), expected)
      })
    }
  }
  it("role ไม่รู้จัก/ไม่มี = viewer (ไม่มีสิทธิ์อะไรเลย)", () => {
    for (const d of DOMAINS) {
      assert.equal(rbac.hasPerm(undefined, d), false)
      assert.equal(rbac.hasPerm("hacker", d), false)
    }
  })
  it("canUpload / isAdminRole เท่าเดิม", () => {
    for (const role of rbac.ROLES) {
      assert.equal(rbac.canUpload(role), ORIGINAL_MATRIX[role].length > 0, role)
      assert.equal(rbac.isAdminRole(role), role === "admin" || role === "superadmin", role)
    }
  })
})

describe("domainOfApiPath รู้ prefix /api/partner", () => {
  for (const p of LEGACY_API) {
    const partner = p.replace(/^\/api/, "/api/partner")
    it(`${partner} = เดิมของ ${p}`, () => {
      assert.equal(rbac.domainOfApiPath(partner), originalDomainOfApiPath(p))
    })
    it(`${p} (แบบเดิม) ยังตอบเหมือนเดิม`, () => {
      assert.equal(rbac.domainOfApiPath(p), originalDomainOfApiPath(p))
    })
  }
  it("ชื่อคล้ายแต่ไม่ใช่ /api/partner/ ไม่ถูกตัด", () => {
    assert.equal(rbac.domainOfApiPath("/api/partnerx/contracts"), null)
    assert.equal(rbac.domainOfApiPath("/api/partner"), null)
  })
})

describe("salespersonPageAllowed รู้ /partner", () => {
  const pages = ["/", "/price-list", "/price-list/x", "/quotations", "/quotations/new", "/catalog",
    "/drivers", "/contracts", "/payroll", "/price-listing", "/admin/users"]
  for (const p of pages) {
    const partner = p === "/" ? "/partner" : `/partner${p}`
    it(`${partner} = เดิมของ ${p}`, () => {
      assert.equal(rbac.salespersonPageAllowed(partner), originalSalespersonPageAllowed(p))
    })
  }
  it("หน้าที่ฝ่ายขายถูกพาไปต้องเปิดได้เอง (ไม่วนลูป)", () => {
    assert.equal(rbac.salespersonPageAllowed(rbac.SALESPERSON_HOME), true)
  })
})
