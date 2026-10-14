import { test } from "node:test";
import assert from "node:assert/strict";

import { intakeEvent, type IntakeEvent } from "@/lib/payroll/intake-events";
import { emptyRecord, type IntakeRecord } from "@/lib/payroll/intake-status";

const at = "2026-10-14T03:00:00.000Z";

const record = (over: Partial<IntakeRecord> = {}): IntakeRecord => ({
  ...emptyRecord("13"),
  stage: "submitted",
  fileName: "ค่าเที่ยว.xlsx",
  fileId: "6700000000000000000000aa",
  errors: 0,
  updatedAt: at,
  updatedBy: "สมหญิง ส่งของ",
  ...over,
});

test("เหตุการณ์อัปโหลดบอกไฟล์ที่เข้ามาและจำนวนข้อผิดพลาดที่ตรวจเจอ", () => {
  const event = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "uploaded",
    actor: "สมหญิง ส่งของ",
    at,
    record: record({ errors: 2 }),
  });
  assert.deepEqual(event, {
    period: "2026-09",
    itemId: "13",
    kind: "uploaded",
    actor: "สมหญิง ส่งของ",
    at,
    fileName: "ค่าเที่ยว.xlsx",
    fileId: "6700000000000000000000aa",
    errors: 2,
  } satisfies IntakeEvent);
});

test("เหตุการณ์รับเข้ารอบเก็บเหตุผลข้ามด่านและจำนวนข้อผิดพลาดที่อนุมัติทับไป", () => {
  const event = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "passed",
    actor: "บัว ค่าจ้าง",
    at,
    record: record({ stage: "passed", errors: 3 }),
    overrideReason: "  ยืนยันยอดกับบัญชีทางโทรศัพท์แล้ว  ",
  });
  assert.equal(event.kind, "passed");
  assert.equal(event.errors, 3);
  assert.equal(event.overrideReason, "ยืนยันยอดกับบัญชีทางโทรศัพท์แล้ว");
  assert.equal(event.actor, "บัว ค่าจ้าง");
});

test("รับเข้ารอบที่ไม่มีข้อผิดพลาดค้าง ยังบันทึกเลขศูนย์ไว้ ไม่ปล่อยว่าง", () => {
  const event = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "passed",
    actor: "บัว ค่าจ้าง",
    at,
    record: record({ stage: "passed", errors: 0 }),
  });
  assert.equal(event.errors, 0);
  assert.ok(!("overrideReason" in event), "ไม่มีเหตุผลข้ามด่านก็ต้องไม่มีคีย์นี้");
});

test("ตีกลับกับเปิดใบกลับมาเก็บเหตุผลไว้ในคีย์เดียวกัน", () => {
  const returned = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "returned",
    actor: "บัว ค่าจ้าง",
    at,
    record: record({ stage: "returned" }),
    reason: "คอลัมน์ “ยอดหักเงิน(บาท)” ยังมีช่องว่าง 4 แถว",
  });
  assert.equal(returned.reason, "คอลัมน์ “ยอดหักเงิน(บาท)” ยังมีช่องว่าง 4 แถว");
  assert.ok(!("overrideReason" in returned));

  const reopened = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "reopened",
    actor: "บัว ค่าจ้าง",
    at,
    record: record({ stage: "submitted" }),
    reason: "ฝ่ายแจ้งว่ายอดค่าเที่ยวผิด ขอส่งไฟล์ใหม่",
  });
  assert.equal(reopened.kind, "reopened");
  assert.equal(reopened.reason, "ฝ่ายแจ้งว่ายอดค่าเที่ยวผิด ขอส่งไฟล์ใหม่");
});

test("เหตุผลที่เป็นช่องว่างไม่ถูกเก็บ และชื่อผู้ทำที่ว่างมีข้อความแทน", () => {
  const event = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "reopened",
    actor: "   ",
    at,
    reason: "   ",
  });
  assert.ok(!("reason" in event));
  assert.equal(event.actor, "ไม่ทราบชื่อผู้ใช้");
});

test("ไม่มีแถวสถานะแนบมา = ไม่มีคีย์ไฟล์ค้างเป็น undefined ในเอกสาร", () => {
  const event = intakeEvent({
    period: "2026-09",
    itemId: "13",
    kind: "reopened",
    actor: "บัว ค่าจ้าง",
    at,
  });
  assert.deepEqual(Object.keys(event).sort(), [
    "actor",
    "at",
    "itemId",
    "kind",
    "period",
  ]);
});
