import { test } from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeZip,
  MAX_INTAKE_FILE_BYTES,
  validateIntakeUpload,
  XLSX_TYPE,
} from "@/lib/payroll/intake-upload";

const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const TEXT_HEAD = new TextEncoder().encode("hello");

const good = {
  period: "2026-09",
  itemId: "13",
  fileName: "เงินเดือน.xlsx",
  fileType: XLSX_TYPE,
  size: 5000,
  head: ZIP_HEAD,
};

test("คำขอที่ถูกต้องผ่าน และตัดช่องว่างรอบ itemId", () => {
  const r = validateIntakeUpload({ ...good, itemId: " 13 " });
  assert.deepEqual(r, { ok: true, period: "2026-09", itemId: "13" });
});

test("period ต้องเป็น YYYY-MM", () => {
  for (const period of [null, "", "2026-9", "2026-13", "26-09", "2026-00"]) {
    const r = validateIntakeUpload({ ...good, period });
    assert.equal(r.ok, false, String(period));
  }
});

test("ไม่ระบุ itemId", () => {
  for (const itemId of [null, "", "   "]) {
    assert.equal(validateIntakeUpload({ ...good, itemId }).ok, false);
  }
});

test("ไฟล์ว่างหรือไม่มีไฟล์", () => {
  const r = validateIntakeUpload({ ...good, size: 0 });
  assert.equal(r.ok, false);
});

test("ไม่ใช่ .xlsx (.xls / .csv) ได้ข้อความบอกให้บันทึกใหม่", () => {
  for (const fileName of ["a.xls", "a.csv", "a.xlsx.txt", "a"]) {
    const r = validateIntakeUpload({ ...good, fileName });
    assert.equal(r.ok, false, fileName);
    if (!r.ok) assert.match(r.message, /\.xlsx/);
  }
});

test("นามสกุลตัวพิมพ์ใหญ่ .XLSX ผ่าน", () => {
  assert.equal(validateIntakeUpload({ ...good, fileName: "A.XLSX" }).ok, true);
});

test("ใหญ่เกิน 10 MB", () => {
  const r = validateIntakeUpload({ ...good, size: MAX_INTAKE_FILE_BYTES + 1 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /10 MB/);
  assert.equal(validateIntakeUpload({ ...good, size: MAX_INTAKE_FILE_BYTES }).ok, true);
});

test("MIME ที่เป็นอย่างอื่นชัดเจนถูกปฏิเสธ แต่ว่าง/octet-stream ผ่านไปตรวจเนื้อไฟล์", () => {
  assert.equal(validateIntakeUpload({ ...good, fileType: "text/plain" }).ok, false);
  assert.equal(validateIntakeUpload({ ...good, fileType: "" }).ok, true);
  assert.equal(validateIntakeUpload({ ...good, fileType: "application/octet-stream" }).ok, true);
});

test("เปลี่ยนนามสกุลเฉย ๆ (.txt -> .xlsx แม้เบราว์เซอร์ส่ง MIME xlsx) ถูกจับจากเนื้อไฟล์", () => {
  const r = validateIntakeUpload({ ...good, head: TEXT_HEAD });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.message, /ไม่ใช่ Excel จริง/);
});

test("looksLikeZip", () => {
  assert.equal(looksLikeZip(ZIP_HEAD), true);
  assert.equal(looksLikeZip(TEXT_HEAD), false);
  assert.equal(looksLikeZip(new Uint8Array([0x50, 0x4b])), false);
});
