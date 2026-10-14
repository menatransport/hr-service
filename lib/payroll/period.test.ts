import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_PERIOD,
  initialPeriod,
  periodFromCode,
  writablePeriod,
} from "@/lib/payroll/period";

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

test("writablePeriod: เขียนได้เฉพาะรอบที่เปิดอยู่ — รูปแบบผิด/ปิดแล้ว/ยังมาไม่ถึง ถูกปฏิเสธที่เซิร์ฟเวอร์", () => {
  const open = writablePeriod("2026-09");
  assert.equal(open.ok, true);
  assert.deepEqual(open.ok ? open.period : null, CURRENT_PERIOD);

  const locked = writablePeriod("2026-03");
  assert.equal(locked.ok, false);
  assert.match(locked.ok ? "" : locked.message, /ปิดแล้ว/);
  assert.match(locked.ok ? "" : locked.message, /มี\.ค\. 2569/);

  for (const ahead of ["2026-10", "2027-01", "2099-01"]) {
    const future = writablePeriod(ahead);
    assert.equal(future.ok, false, `${ahead} ต้องเขียนไม่ได้`);
    assert.match(future.ok ? "" : future.message, /ยังมาไม่ถึง/);
  }

  for (const bad of ["2026-13", "2026-9", "junk", "", null, undefined]) {
    const wrong = writablePeriod(bad);
    assert.equal(wrong.ok, false);
    assert.match(wrong.ok ? "" : wrong.message, /YYYY-MM/);
  }
});
