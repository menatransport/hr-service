import { test } from "node:test";
import assert from "node:assert/strict";

import type { DeskIdentity } from "@/lib/auth/identity";
import type { IntakeRecord } from "@/lib/payroll/intake-status";
import { filterRecords, visibleItems } from "@/lib/payroll/scope-filter";
import { INTAKE_ITEMS, itemsByOwner } from "@/lib/payroll/registry";

const identity = (departmentId: string, authenticated = true): DeskIdentity => ({
  employeeId: "00001",
  name: "ทดสอบ ระบบ",
  firstName: "ทดสอบ",
  role: "-",
  position: "Supervisor",
  department: "-",
  departmentId,
  level: 3,
  levelLabel: "Supervisor",
  imageUrl: null,
  authenticated,
});

const record = (itemId: string): IntakeRecord => ({
  itemId,
  stage: "submitted",
  updatedAt: "2026-10-14T03:00:00.000Z",
  updatedBy: "ทดสอบ ระบบ",
});

test("ฝ่ายจัดส่งเห็นเฉพาะรายการของตัวเอง ไม่เห็นของฝ่ายอื่น", () => {
  const items = visibleItems(identity("15"));
  assert.equal(items.length, itemsByOwner("จัดส่ง ลาดกระบัง").length);
  assert.ok(items.every((i) => i.owner === "จัดส่ง ลาดกระบัง"));
});

test("HR เห็นทุกรายการในทะเบียน", () => {
  assert.equal(visibleItems(identity("24")).length, INTAKE_ITEMS.length);
});

test("หน่วยงานที่ไม่อยู่ในทะเบียนผู้รับผิดชอบ เห็นศูนย์รายการ — ไม่ใช่เห็นทั้งหมด", () => {
  assert.deepEqual(visibleItems(identity("19")), []);
});

test("สถานะของฝ่ายอื่นไม่หลุดออกจาก API", () => {
  const all = [record("01"), record("17"), record("24")];
  const seen = filterRecords(identity("15"), all).map((r) => r.itemId);
  assert.deepEqual(seen, ["01"]);
});

test("HR ได้สถานะทุกแถวตามเดิม", () => {
  const all = [record("01"), record("17")];
  assert.equal(filterRecords(identity("24"), all).length, 2);
});
