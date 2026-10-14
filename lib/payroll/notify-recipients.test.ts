import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RECIPIENTS,
  RecipientInputError,
  validateRecipients,
} from "@/lib/payroll/notify-recipients";

test("ผู้รับที่ใช้ได้ถูกเก็บเป็นรายการ ไม่ใช่ข้อความทั้งก้อน", () => {
  const { to, cc } = validateRecipients("a@x.co, b@x.co", "c@x.co");
  assert.deepEqual(to, ["a@x.co", "b@x.co"]);
  assert.deepEqual(cc, ["c@x.co"]);
});

test("คนที่อยู่ในช่องถึงแล้ว ไม่ถูกใส่สำเนาซ้ำ", () => {
  const { to, cc } = validateRecipients("a@x.co", "a@x.co, b@x.co");
  assert.deepEqual(to, ["a@x.co"]);
  assert.deepEqual(cc, ["b@x.co"], "a@x.co ได้เมลฉบับเดียว");
});

test("อีเมลผิดรูปถูกปฏิเสธพร้อมบอกว่าตัวไหน ไม่ใช่บันทึกไว้เงียบ ๆ", () => {
  assert.throws(
    () => validateRecipients("a@x.co, somchai", ""),
    (err: unknown) =>
      err instanceof RecipientInputError && /somchai/.test((err as Error).message),
  );
});

test("ไม่มีผู้รับในช่องถึง บันทึกไม่ได้ — ต้องใช้การลบถ้าจะเลิกใช้", () => {
  assert.throws(() => validateRecipients("   ", "a@x.co"), RecipientInputError);
});

test("ผู้รับเกินเพดาน ถูกปฏิเสธ — เมลแจ้งฝ่ายไม่ใช่ประกาศทั่วบริษัท", () => {
  const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@x.co`).join(", ");
  assert.throws(() => validateRecipients(many, ""), RecipientInputError);
  const atLimit = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `p${i}@x.co`).join(", ");
  assert.equal(validateRecipients(atLimit, "").to.length, MAX_RECIPIENTS);
});
