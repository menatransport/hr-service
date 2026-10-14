import { test } from "node:test";
import assert from "node:assert/strict";

import { decidePeriod, defaultPeriodCode, type PeriodState } from "@/lib/payroll/period-state";

const state = (code: string, status: PeriodState["status"]): PeriodState => ({ code, status });

test("รอบที่เปิดอยู่ เขียนได้", () => {
  const d = decidePeriod("2026-10", state("2026-10", "open"));
  assert.equal(d.ok, true);
  assert.deepEqual(d.ok && d.period, { year: 2569, month: 9 });
});

test("รอบที่ปิดแล้ว เขียนไม่ได้ และบอกว่าใครปิด", () => {
  const d = decidePeriod("2026-09", {
    code: "2026-09",
    status: "locked",
    lockedBy: "สมหญิง",
  });
  assert.equal(d.ok, false);
  assert.ok(!d.ok && d.message.includes("ปิดแล้ว"));
  assert.ok(!d.ok && d.message.includes("สมหญิง"));
});

test("รอบที่ยังไม่เปิด เขียนไม่ได้ — ไม่ใช่ปล่อยผ่านเพราะยังไม่มีแถว", () => {
  const d = decidePeriod("2030-01", null);
  assert.equal(d.ok, false);
  assert.ok(!d.ok && d.message.includes("ยังไม่เปิด"), !d.ok ? d.message : "");
});

test("รหัสรอบผิดรูปแบบ ถูกปฏิเสธก่อนไปถามสถานะ", () => {
  for (const bad of ["", "2026-13", "เดือนกันยา", "2026-9"]) {
    assert.equal(decidePeriod(bad, state("x", "open")).ok, false, bad);
  }
});

test("ค่าเริ่มต้นคือรอบที่เปิดอยู่ล่าสุด ไม่ใช่เดือนตามนาฬิกา", () => {
  const states = [
    state("2026-08", "locked"),
    state("2026-09", "open"),
    state("2026-10", "unopened"),
  ];
  assert.equal(defaultPeriodCode(states, "2026-01"), "2026-09");
});

test("เปิดอยู่หลายรอบ เอารอบใหม่สุด", () => {
  const states = [state("2026-09", "open"), state("2026-10", "open")];
  assert.equal(defaultPeriodCode(states, "2026-01"), "2026-10");
});

test("ไม่มีรอบไหนเปิด ถอยไปรอบที่ปิดล่าสุด ยังเปิดดูย้อนหลังได้", () => {
  const states = [state("2026-07", "locked"), state("2026-08", "locked")];
  assert.equal(defaultPeriodCode(states, "2026-01"), "2026-08");
});

test("ไม่มีข้อมูลรอบเลย ใช้ค่าสำรองที่ส่งเข้ามา", () => {
  assert.equal(defaultPeriodCode([], "2026-09"), "2026-09");
});
