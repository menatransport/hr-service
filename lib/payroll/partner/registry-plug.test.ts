import { test } from "node:test";
import assert from "node:assert/strict";

import type { DeskIdentity } from "@/lib/auth/identity";
import { APPROVER_DEPARTMENT_IDS } from "@/lib/payroll/approver";
import {
  findItem,
  findSystemItem,
  INTAKE_ITEMS,
  RETIRED_ITEMS,
  SYSTEM_ITEMS,
} from "@/lib/payroll/registry";
import { visibleItems } from "@/lib/payroll/scope-filter";
import { canUploadItem } from "@/lib/payroll/scope";
import { summarizePeriod } from "@/lib/payroll/summary";

/* ทะเบียน 20 รายการเดิม — ตรึงไว้ตรงนี้เพื่อยืนยันว่าจุดเสียบรายการจากระบบไม่แตะของเดิม */
const FILE_ITEM_IDS = [
  "01", "02", "06", "07", "08", "09", "10", "11", "12", "13",
  "14", "16", "17", "19", "20", "21", "22", "23", "24", "30",
];

const hr: DeskIdentity = {
  employeeId: "00001",
  name: "ทดสอบ HR",
  firstName: "ทดสอบ",
  role: "HR",
  position: "Officer",
  department: "ค่าจ้างและสวัสดิการ",
  departmentId: APPROVER_DEPARTMENT_IDS[0],
  level: 3,
  levelLabel: "Officer",
  imageUrl: null,
  authenticated: true,
};

test("ทะเบียนไฟล์เดิมยังเป็น 20 รายการเดิม ลำดับเดิม ไม่มีรายการจากระบบปน", () => {
  assert.deepEqual(INTAKE_ITEMS.map((i) => i.id), FILE_ITEM_IDS);
});

test("รายการรถร่วมขึ้นทะเบียนเป็นแหล่ง ‘ระบบ’ และไม่ส่งเข้า Tiger Soft", () => {
  const item = findSystemItem("partner-mixer");
  assert.ok(item);
  assert.equal(item.source, "ระบบ");
  assert.equal(item.excludeFromTigerSoft, true);
});

test("เลขรายการจากระบบไม่ชนกับรายการไฟล์หรือรายการที่ปลดระวาง", () => {
  const taken = new Set([...INTAKE_ITEMS, ...RETIRED_ITEMS].map((i) => i.id));
  for (const item of SYSTEM_ITEMS) assert.equal(taken.has(item.id), false, item.id);
  assert.equal(new Set(SYSTEM_ITEMS.map((i) => i.id)).size, SYSTEM_ITEMS.length);
});

test("อัปโหลดไฟล์เข้ารายการจากระบบไม่ได้ แม้เป็น HR — findItem ไม่รู้จัก", () => {
  assert.equal(findItem("partner-mixer"), undefined);
  assert.equal(canUploadItem(hr, "partner-mixer"), false);
});

test("ความครบของรอบและขอบเขตที่ HR เห็น ยังนับเฉพาะ 20 รายการไฟล์", () => {
  assert.equal(visibleItems(hr).length, 20);
  const summary = summarizePeriod({ year: 2569, month: 8 }, new Map(), new Date(2026, 8, 30));
  assert.equal(summary.rows.length, 20);
  assert.equal(summary.scoped, false);
});
