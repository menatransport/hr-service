import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertPassAllowed,
  overrideToStore,
  reviewActions,
  stageWriteCheck,
} from "@/lib/payroll/intake-gate";
import type { IntakeRecord } from "@/lib/payroll/intake-status";

const record = (over: Partial<IntakeRecord> = {}): IntakeRecord => ({
  itemId: "13",
  stage: "submitted",
  updatedAt: "2026-10-14T03:00:00.000Z",
  updatedBy: "ทดสอบ",
  errors: 0,
  warnings: 0,
  fileId: "6700000000000000000000aa",
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

test("เหตุผลข้ามด่านเก็บเฉพาะเมื่อไฟล์มีข้อผิดพลาดค้างจริง", () => {
  assert.equal(overrideToStore(record({ errors: 0 }), "เหตุผล"), undefined);
  assert.equal(overrideToStore(record({ errors: undefined }), "เหตุผล"), undefined);
  assert.equal(overrideToStore(record({ errors: 2 }), "  ยอดถูกแล้ว "), "ยอดถูกแล้ว");
  assert.equal(overrideToStore(record({ errors: 2 }), "   "), undefined);
});

/* ---------------------------------------------- ใครเขียนขั้นไหนได้ */

test("“อัปโหลดแล้ว” กับ “รอส่ง” เขียนจาก client ไม่ได้ ไม่ว่าใคร", () => {
  for (const stage of ["submitted", "waiting"] as const) {
    const hr = stageWriteCheck(stage, true, "ทรัพยากรบุคคล");
    assert.equal(hr.ok, false);
    assert.equal(hr.ok ? 0 : hr.status, 400);
  }
});

test("ตีกลับเป็นคำตัดสินของ HR เหมือนการรับเข้ารอบ — ฝ่ายเจ้าของข้อมูลเขียนไม่ได้", () => {
  for (const stage of ["passed", "returned"] as const) {
    const owner = stageWriteCheck(stage, false, "จัดส่งลาดกระบัง");
    assert.equal(owner.ok, false);
    assert.equal(owner.ok ? 0 : owner.status, 403);
    assert.match(owner.ok ? "" : owner.message, /จัดส่งลาดกระบัง/);
    assert.equal(stageWriteCheck(stage, true, "ทรัพยากรบุคคล").ok, true);
  }
});

/* ---------------------------------------------- ทำอะไรได้กับแถวที่เก็บไว้ */

test("ด่าน 2 เปิดได้จากแถวที่เก็บไว้ ไม่ต้องอัปโหลดไฟล์ซ้ำในเบราว์เซอร์นี้", () => {
  const stored = record({ stage: "submitted", fileId: "6700000000000000000000aa" });
  const actions = reviewActions(stored, true);
  assert.equal(actions.hasFile, true);
  assert.equal(actions.canApprove, true);
  assert.equal(actions.canReturn, true);
  assert.equal(actions.canReopen, false);
  assert.equal(actions.note, null);
});

test("บัญชีที่ไม่มีสิทธิ์ตัดสิน เห็นผลตรวจได้แต่กดอะไรไม่ได้", () => {
  const actions = reviewActions(record({ stage: "submitted" }), false);
  assert.equal(actions.canApprove, false);
  assert.equal(actions.canReturn, false);
  assert.equal(actions.canReopen, false);
  assert.match(actions.note ?? "", /ค่าจ้างและสวัสดิการ/);
});

test("แถวที่ยังไม่มีไฟล์เข้ามา ตัดสินไม่ได้ และบอกว่าเพราะอะไร", () => {
  const actions = reviewActions({ ...record({ stage: "waiting" }), fileId: undefined }, true);
  assert.equal(actions.hasFile, false);
  assert.equal(actions.canApprove, false);
  assert.match(actions.note ?? "", /ยังไม่มีไฟล์/);
});

test("แถวที่รับเข้ารอบแล้ว ผ่านซ้ำไม่ได้ ต้องเปิดใบกลับมาก่อน", () => {
  const actions = reviewActions(record({ stage: "passed" }), true);
  assert.equal(actions.canApprove, false);
  assert.equal(actions.canReopen, true);
  assert.match(actions.note ?? "", /เปิดใบกลับมา/);
});

test("แถวที่ถูกตีกลับรอฝ่ายส่งใหม่ — ยังกดผ่านไม่ได้", () => {
  const actions = reviewActions(record({ stage: "returned" }), true);
  assert.equal(actions.canApprove, false);
  assert.equal(actions.canReturn, false);
  assert.match(actions.note ?? "", /ส่งไฟล์ใหม่/);
});
