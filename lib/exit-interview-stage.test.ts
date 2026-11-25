import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emptyInterview,
  stageOf,
  tenureBand,
  tenureDays,
} from "../app/recruitment/_lib/exit-interview/types";

/* สถานะ Exit Interview + ช่วงอายุงาน (คอลัมน์ DataLog) — แผนงาน app/recruitment/_docs/2026-11-24-exit-interview.md */

const exit = "2026-11-01";
const iv = (p: { outcome?: "" | "interviewed" | "N1" | "N2"; w1?: boolean; w2?: boolean }) => {
  const base = emptyInterview("x", exit);
  return { ...base, outcome: p.outcome ?? "", wave1: { ...base.wave1, completed: !!p.w1 }, wave2: { ...base.wave2, completed: !!p.w2 } };
};

test("ยังไม่มีแถว = pending", () => {
  assert.equal(stageOf(null, exit, "2026-11-05"), "pending");
});

test("N1/N2 = no_data ไม่ว่า wave จะเป็นอะไร", () => {
  assert.equal(stageOf(iv({ outcome: "N1" }), exit, "2026-11-05"), "no_data");
  assert.equal(stageOf(iv({ outcome: "N2", w1: true }), exit, "2026-12-30"), "no_data");
});

test("Wave 1 เสร็จ — ก่อนวันที่ 30 / วันที่ 30–45 / เลย 45", () => {
  assert.equal(stageOf(iv({ w1: true }), exit, "2026-11-30"), "wave1");
  assert.equal(stageOf(iv({ w1: true }), exit, "2026-12-01"), "wave2_due");
  assert.equal(stageOf(iv({ w1: true }), exit, "2026-12-16"), "wave2_due");
  assert.equal(stageOf(iv({ w1: true }), exit, "2026-12-17"), "wave2_late");
});

test("Wave 2 เสร็จ = done", () => {
  assert.equal(stageOf(iv({ w1: true, w2: true }), exit, "2026-12-20"), "done");
});

test("ช่วงอายุงานตรงกับ DataLog", () => {
  assert.equal(tenureBand(0), "0-10 วัน");
  assert.equal(tenureBand(10), "0-10 วัน");
  assert.equal(tenureBand(11), "11-30 วัน");
  assert.equal(tenureBand(90), "31-90 วัน");
  assert.equal(tenureBand(180), "91-180 วัน");
  assert.equal(tenureBand(365), "181-365 วัน");
  assert.equal(tenureBand(366), "เกิน 1 ปี");
  assert.equal(tenureBand(null), "");
});

test("อายุงาน (วัน) — ตัวอย่างแถวในไฟล์ 680691: 17 ธ.ค. 68 → 1 ม.ค. 69 = 15 วัน", () => {
  assert.equal(tenureDays("2025-12-17", "2026-01-01"), 15);
  assert.equal(tenureDays("", "2026-01-01"), null);
});
