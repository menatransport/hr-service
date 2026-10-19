import assert from "node:assert/strict";
import { test } from "node:test";

import { findModule, MODULES, type ModuleItem } from "./modules";

const all = (): ModuleItem[] => MODULES.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));

test("id ของเมนูไม่ซ้ำกันทั้งไฟล์ (ใช้เป็นชื่อ view transition)", () => {
  const ids = all().map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("เมนูรถร่วมครบ 21 กลุ่มงาน และอยู่ใต้ /partner ทั้งหมด ยกเว้น /trucks", () => {
  const partner = MODULES.find((g) => g.id === "partner")!;
  const items = partner.items.flatMap((i) => [i, ...(i.children ?? [])]);
  const hrefs = items.flatMap((i) => [i.href, ...(i.match ? [i.match] : [])]);
  for (const h of hrefs) assert.ok(h.startsWith("/partner/") || h === "/trucks", h);
  const groups = new Set(hrefs.map((h) => h.split("/")[h === "/trucks" ? 1 : 2]));
  const expected = [
    "contracts", "drivers", "payroll", "payroll-extras", "driver-ledger", "trips", "trip-fuel",
    "vehicles", "vehicle-cost", "insurance-tax", "quotations", "price-list", "promotions", "catalog",
    "reports", "alerts", "attendance", "adjustments", "import", "admin", "trucks",
  ];
  for (const g of expected) assert.ok(groups.has(g), `ขาด ${g}`);
  assert.equal(expected.length, 21);
});

test("/partner/payroll ไม่ถูกจับเป็นเมนูค่าจ้างของ hr และกลับกัน", () => {
  assert.equal(findModule("/partner/payroll")?.group.id, "partner");
  assert.equal(findModule("/payroll/intake")?.group.id, "master");
});

test("เมนูคนขับรถร่วม ↔ พจส. อยู่กลุ่มพนักงานจัดส่ง", () => {
  assert.equal(findModule("/desk/driver-links")?.group.id, "driver");
});

test("ทุกลิงก์ของกลุ่มรถร่วมมีหน้าจริง (ไม่พาไป 404)", async () => {
  const fs = await import("node:fs");
  const partner = MODULES.find((g) => g.id === "partner")!;
  for (const i of partner.items.flatMap((i) => [i, ...(i.children ?? [])])) {
    const file =
      i.href === "/trucks" ? "app/(partner-public)/trucks/page.tsx" : `app${i.href.split("?")[0]}/page.tsx`;
    assert.ok(fs.existsSync(file), `${i.id} → ${i.href} ไม่มี ${file}`);
  }
});

test("/partner/adjustments/<เดือน> ไฮไลต์เมนูรายการปรับปรุง", () => {
  assert.equal(findModule("/partner/adjustments/2026-09")?.child?.id, "pt-adjustments");
});
