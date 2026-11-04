import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONFIRMED_OWNER_DEPARTMENT_ID,
  parseOwnerDepartments,
  resolveOwnerDepartments,
  unmappedIn,
} from "@/lib/payroll/owner-directory";

/*
 * **เทสต์ชุดนี้ไม่อ่าน `process.env` จริง** — ค่า env ถูกแปลงด้วย
 * `parseOwnerDepartments()` ที่รับข้อความเข้ามา จึงทดสอบได้โดยไม่ขึ้นกับ shell
 * หรือ CI ที่เผลอตั้ง `NEXT_PUBLIC_PAYROLL_OWNER_DEPARTMENTS` ไว้
 */

test("อ่านค่า env เป็นคู่ชื่อฝ่าย=รหัส และข้ามคู่ที่อ่านไม่ได้", () => {
  assert.deepEqual(parseOwnerDepartments("บัญชี กรุงเทพ=31,บัญชี ลาดกระบัง=32"), {
    "บัญชี กรุงเทพ": "31",
    "บัญชี ลาดกระบัง": "32",
  });
  assert.deepEqual(parseOwnerDepartments(" บัญชี กรุงเทพ = 31 "), {
    "บัญชี กรุงเทพ": "31",
  });
  assert.deepEqual(parseOwnerDepartments("ฝ่ายที่ไม่มีในทะเบียน=31"), {});
  assert.deepEqual(parseOwnerDepartments("บัญชี กรุงเทพ="), {});
  assert.deepEqual(parseOwnerDepartments(""), {});
  assert.deepEqual(parseOwnerDepartments(undefined), {});
});

test("env เติมได้แค่ฝ่ายที่ยังไม่มีรหัส — ทับรหัสที่ยืนยันแล้วไม่ได้", () => {
  const ids = resolveOwnerDepartments(CONFIRMED_OWNER_DEPARTMENT_ID, {
    "จัดส่ง ลาดกระบัง": "99",
    "บัญชี กรุงเทพ": "31",
  });
  assert.equal(ids["จัดส่ง ลาดกระบัง"], "15", "รหัสที่ยืนยันแล้วต้องไม่ถูก env ทับ");
  assert.equal(ids["บัญชี กรุงเทพ"], "31");
  assert.equal(ids["บัญชี ลาดกระบัง"], null);
});

test("ไม่ตั้ง env เลย = ฝ่ายบัญชีสองฝ่ายยังเป็น null ไม่ใช่เดาเลข", () => {
  const ids = resolveOwnerDepartments(CONFIRMED_OWNER_DEPARTMENT_ID, {});
  assert.equal(ids["บัญชี กรุงเทพ"], null);
  assert.equal(ids["บัญชี ลาดกระบัง"], null);
  assert.deepEqual(unmappedIn(ids).sort(), ["บัญชี กรุงเทพ", "บัญชี ลาดกระบัง"]);
});

test("เติม env ครบสองฝ่ายแล้วไม่เหลือฝ่ายที่ไม่มีรหัส", () => {
  const ids = resolveOwnerDepartments(CONFIRMED_OWNER_DEPARTMENT_ID, {
    "บัญชี กรุงเทพ": "31",
    "บัญชี ลาดกระบัง": "32",
  });
  assert.deepEqual(unmappedIn(ids), []);
});
