import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideGate, needsPartnerRole, type GateDecision, type GateInput } from "./gate";
import { ROLES, type Role } from "@/lib/partner/rbac";

const NEXT: GateDecision = { action: "next" };
const R401 = { action: "json", status: 401 } as const;
const R403 = { action: "json", status: 403 } as const;

type Expect = GateDecision | typeof R401 | typeof R403 | { action: "redirect"; location: string };

function check(input: GateInput, expected: Expect) {
  const got = decideGate(input);
  if (expected.action === "json") {
    assert.equal(got.action, "json", JSON.stringify(input));
    assert.equal((got as { status: number }).status, expected.status, JSON.stringify(input));
  } else {
    assert.deepEqual(got, expected, JSON.stringify(input));
  }
}

const anon = (pathname: string, method = "GET", search = ""): GateInput => ({ pathname, method, search, authenticated: false });
const user = (pathname: string, method = "GET", role: Role | null = "viewer"): GateInput => ({ pathname, method, authenticated: true, role });

describe("hr เดิม — พฤติกรรมต้องไม่เปลี่ยน", () => {
  const table: Array<[GateInput, Expect]> = [
    [anon("/home"), { action: "redirect", location: "/?next=%2Fhome" }],
    [anon("/desk/cases/123", "GET", "?tab=log"), { action: "redirect", location: "/?next=%2Fdesk%2Fcases%2F123%3Ftab%3Dlog" }],
    [anon("/payroll/intake"), { action: "redirect", location: "/?next=%2Fpayroll%2Fintake" }],
    [anon("/recruitment/admin"), { action: "redirect", location: "/?next=%2Frecruitment%2Fadmin" }],
    [anon("/api/cases", "GET"), NEXT],
    [anon("/api/cases", "HEAD"), NEXT],
    [anon("/api/cases", "POST"), R401],
    [anon("/api/cases/1", "PATCH"), R401],
    [anon("/api/cases/1", "PUT"), R401],
    [anon("/api/cases/1", "DELETE"), R401],
    [anon("/api/uploads", "POST"), R401],
    [anon("/api/recruitment/public/applications", "POST"), NEXT],
    [anon("/api/recruitment/questions", "POST"), R401],
    [anon("/api/auth/google", "GET"), NEXT],
    [anon("/api/auth/logout", "POST"), NEXT],
    [anon("/api/cron/media-retention", "GET"), NEXT],
    [anon("/api/cron/media-retention", "POST"), R401],
    [user("/home"), NEXT],
    [user("/payroll/summary"), NEXT],
    [user("/api/cases", "POST"), NEXT],
    [user("/api/cases/1", "DELETE", "viewer"), NEXT], // hr ไม่มี RBAC ที่ด่าน — role รถร่วมไม่กระทบ hr
  ];
  table.forEach(([input, expected], i) => it(`#${i} ${input.method} ${input.pathname} auth=${input.authenticated}`, () => check(input, expected)));
});

describe("public ของรถร่วม — ผ่านไม่ต้องล็อกอิน ทุก method", () => {
  for (const p of ["/trucks", "/trucks/me009-hino", "/sitemap.xml", "/robots.txt", "/og/truck/x", "/api/public/trucks", "/api/public/leads"]) {
    for (const m of ["GET", "POST"]) it(`${m} ${p}`, () => check(anon(p, m), NEXT));
  }
  it("/trucksecret ไม่ใช่ public (หน้านอก matcher อยู่แล้ว แต่ gate ต้องไม่ถือเป็น public)", () => {
    check(anon("/trucksecret"), { action: "redirect", location: "/?next=%2Ftrucksecret" });
  });
  it("/api/publicity ไม่ใช่ public", () => check(anon("/api/publicity", "POST"), R401));
});

describe("/api/partner/cron/* ผ่านด่าน (route ตรวจ Bearer เอง)", () => {
  for (const m of ["GET", "POST"]) {
    it(`${m} ไม่ล็อกอิน`, () => check(anon("/api/partner/cron/deals", m), NEXT));
    it(`${m} ล็อกอินเป็น viewer`, () => check(user("/api/partner/cron/deals", m, "viewer"), NEXT));
  }
});

describe("/api/partner/** ไม่ล็อกอิน → 401 ทุก method (ปิดช่อง GET ที่ hr ปล่อย)", () => {
  for (const m of ["GET", "HEAD", "POST", "PATCH", "DELETE"]) {
    it(`${m} /api/partner/contracts`, () => check(anon("/api/partner/contracts", m), R401));
  }
  it("GET /api/partner/ledger", () => check(anon("/api/partner/ledger"), R401));
  it("GET /api/partner (ราก)", () => check(anon("/api/partner"), R401));
  it("/api/partner/session ผ่าน (route ตอบ null เอง)", () => check(anon("/api/partner/session"), NEXT));
});

describe("หน้า /partner/** ไม่ล็อกอิน → เด้งหน้าล็อกอิน hr พร้อม next", () => {
  it("/partner", () => check(anon("/partner"), { action: "redirect", location: "/?next=%2Fpartner" }));
  it("/partner/contracts?status=active", () =>
    check(anon("/partner/contracts", "GET", "?status=active"), { action: "redirect", location: "/?next=%2Fpartner%2Fcontracts%3Fstatus%3Dactive" }));
});

describe("ฝ่ายขายเปิดหน้านอกรายการ → /partner/price-list", () => {
  const to = { action: "redirect", location: "/partner/price-list" } as const;
  for (const p of ["/partner/drivers", "/partner/contracts/1", "/partner/payroll", "/partner/admin/users", "/partner/price-listing"]) {
    it(`salesperson ${p}`, () => check(user(p, "GET", "salesperson"), to));
  }
  for (const p of ["/partner", "/partner/price-list", "/partner/quotations", "/partner/quotations/new", "/partner/catalog"]) {
    it(`salesperson ${p} ผ่าน`, () => check(user(p, "GET", "salesperson"), NEXT));
  }
  it("บทบาทอื่นเปิดได้ทุกหน้า", () => {
    for (const r of ROLES.filter((x) => x !== "salesperson")) check(user("/partner/drivers", "GET", r), NEXT);
  });
  it("ฝ่ายขายเรียก GET API นอกรายการได้ (ของเดิมจำกัดแค่หน้า)", () => check(user("/api/partner/drivers", "GET", "salesperson"), NEXT));
});

describe("ล็อกอินแล้ว GET /api/partner/** ผ่านทุกบทบาท", () => {
  for (const r of ROLES) it(r, () => check(user("/api/partner/ledger", "GET", r), NEXT));
  it("role ไม่ส่ง = viewer ยังอ่านได้", () => check(user("/api/partner/ledger", "GET", null), NEXT));
});

describe("non-GET /api/partner/** — RBAC", () => {
  // [path, method, roles ที่ผ่าน]
  const table: Array<[string, string, Role[]]> = [
    ["/api/partner/contracts/1", "DELETE", ["superadmin", "admin"]],
    ["/api/partner/quotations/1", "DELETE", ["superadmin", "admin"]], // DELETE ชนะ sales
    ["/api/partner/contracts", "POST", ["superadmin", "admin", "fleet"]],
    ["/api/partner/drivers/1", "PATCH", ["superadmin", "admin", "fleet"]],
    ["/api/partner/quotations", "POST", ["superadmin", "admin", "fleet", "finance", "salesperson"]],
    ["/api/partner/promotions", "POST", ["superadmin", "admin", "fleet"]],
    ["/api/partner/vehicle-cost", "POST", ["superadmin", "admin", "fleet"]],
    ["/api/partner/import/stock", "POST", ["superadmin", "admin", "fleet"]],
    ["/api/partner/import/ledger", "POST", ["superadmin", "admin", "finance"]],
    ["/api/partner/ledger", "PUT", ["superadmin", "admin", "finance"]],
    ["/api/partner/payroll/run", "POST", ["superadmin", "admin", "finance"]],
    ["/api/partner/admin/users", "POST", ["superadmin"]],
    ["/api/partner/deals", "POST", ["superadmin", "admin"]], // ไม่อยู่ใน map = admin เท่านั้น
    ["/api/partner/company-config", "PUT", ["superadmin", "admin"]],
    ["/api/partner/upload", "POST", ["superadmin", "admin", "fleet", "finance", "salesperson"]],
    ["/api/partner/module-status", "POST", ["superadmin", "admin", "fleet", "finance", "salesperson", "viewer"]],
  ];
  for (const [path, method, allowed] of table) {
    for (const r of ROLES) {
      const ok = allowed.includes(r);
      it(`${method} ${path} as ${r} → ${ok ? "ผ่าน" : "403"}`, () => check(user(path, method, r), ok ? NEXT : R403));
    }
  }
  it("role ไม่ส่ง (null) = viewer → เขียนไม่ได้", () => check(user("/api/partner/quotations", "POST", null), R403));
});

describe("needsPartnerRole — หา role (แตะฐาน) เฉพาะโซนรถร่วมที่ล็อกอินแล้ว", () => {
  const cases: Array<[string, boolean, boolean]> = [
    ["/partner/drivers", true, true],
    ["/api/partner/ledger", true, true],
    ["/partner", true, true],
    ["/partner/drivers", false, false],
    ["/api/partner/session", true, false],
    ["/api/partner/cron/deals", true, false],
    ["/home", true, false],
    ["/api/cases", true, false],
    ["/trucks", true, false],
    ["/partnerx", true, false],
  ];
  for (const [p, auth, want] of cases) it(`${p} auth=${auth} → ${want}`, () => assert.equal(needsPartnerRole(p, auth), want));
});
