import { test } from "node:test";
import assert from "node:assert/strict";

import { assertPassAllowed } from "@/lib/payroll/intake-gate";
import type { IntakeRecord } from "@/lib/payroll/intake-status";

const record = (over: Partial<IntakeRecord> = {}): IntakeRecord => ({
  itemId: "13",
  stage: "submitted",
  updatedAt: "2026-10-14T03:00:00.000Z",
  updatedBy: "ทดสอบ",
  errors: 0,
  warnings: 0,
  ...over,
});

test("ไฟล์ที่ตรวจผ่านด่าน 1 ผ่านได้", () => {
  assert.doesNotThrow(() => assertPassAllowed(record()));
});

test("ยังมีข้อผิดพลาดค้าง ผ่านไม่ได้ถ้าไม่มีเหตุผลกำกับ", () => {
  assert.throws(() => assertPassAllowed(record({ errors: 2 })), /ยังมีข้อผิดพลาด 2 ข้อ/);
});

test("HR ข้ามด่านได้ แต่ต้องเขียนเหตุผล และเหตุผลต้องไม่ใช่ช่องว่าง", () => {
  assert.doesNotThrow(() =>
    assertPassAllowed(record({ errors: 1 }), "ยอดถูกแล้ว ยืนยันกับบัญชีทางโทรศัพท์"),
  );
  assert.throws(() => assertPassAllowed(record({ errors: 1 }), "   "), /เหตุผล/);
});

test("ของที่รอยืนยันกติกา (pending) ไม่ขวางการผ่าน", () => {
  assert.doesNotThrow(() => assertPassAllowed(record({ pendingChecks: 3 })));
});

test("ไฟล์ที่ยังไม่เคยผ่านด่าน 1 เลย ผ่านไม่ได้", () => {
  assert.throws(
    () => assertPassAllowed(record({ errors: undefined, checkedAt: undefined })),
    /ยังไม่ได้ตรวจ/,
  );
});
