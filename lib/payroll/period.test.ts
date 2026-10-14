import { test } from "node:test";
import assert from "node:assert/strict";

import { CURRENT_PERIOD, initialPeriod, periodFromCode } from "@/lib/payroll/period";

test("periodFromCode แปลง 2026-09 เป็น ก.ย. 2569 และปฏิเสธรูปแบบผิด", () => {
  assert.deepEqual(periodFromCode("2026-09"), { year: 2569, month: 8 });
  for (const bad of ["2026-13", "2026-9", "abc", "", null, undefined]) {
    assert.equal(periodFromCode(bad), null);
  }
});

test("initialPeriod: รอบที่เลือกได้ใช้ตามลิงก์ ที่เหลือถอยกลับรอบปัจจุบัน", () => {
  assert.deepEqual(initialPeriod("2026-09"), CURRENT_PERIOD);
  assert.deepEqual(initialPeriod("2026-03"), CURRENT_PERIOD); // ปิดแล้ว
  assert.deepEqual(initialPeriod("2027-01"), CURRENT_PERIOD); // ยังมาไม่ถึง
  assert.deepEqual(initialPeriod("junk"), CURRENT_PERIOD);
  assert.deepEqual(initialPeriod(undefined), CURRENT_PERIOD);
});
