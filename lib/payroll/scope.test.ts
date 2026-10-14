import { test } from "node:test";
import assert from "node:assert/strict";

import type { DeskIdentity } from "@/lib/auth/identity";
import {
  CONFIRMED_OWNER_DEPARTMENT_ID,
  departmentIdOf,
  ownersOfDepartment,
  resolveOwnerDepartments,
  unmappedIn,
} from "@/lib/payroll/owner-directory";
import { canSeeOwner, canUploadItem, ownerScope } from "@/lib/payroll/scope";

const identity = (over: Partial<DeskIdentity> = {}): DeskIdentity => ({
  employeeId: "00001",
  name: "ทดสอบ ระบบ",
  firstName: "ทดสอบ",
  role: "จัดส่งลาดกระบัง · Supervisor",
  position: "Supervisor",
  department: "จัดส่งลาดกระบัง",
  departmentId: "15",
  level: 3,
  levelLabel: "Supervisor",
  imageUrl: null,
  authenticated: true,
  ...over,
});

test("หน่วยงานที่ยืนยันรหัสแล้วจับคู่กับผู้รับผิดชอบในทะเบียนได้", () => {
  assert.equal(departmentIdOf("จัดส่ง ลาดกระบัง"), "15");
  assert.equal(departmentIdOf("ยานยนต์"), "3");
  assert.deepEqual(ownersOfDepartment("15"), ["จัดส่ง ลาดกระบัง"]);
});

/* อ่านตารางที่ยืนยันแล้วตรง ๆ ไม่ผ่าน `OWNER_DEPARTMENT_ID` — ตัวนั้นรวมค่า env
   ของเครื่องที่รันเทสต์เข้ามาด้วย เทสต์จะแดงเพราะ shell ไม่ใช่เพราะโค้ดผิด */
test("ฝ่ายบัญชีสองฝ่ายยังไม่มีรหัสหน่วยงาน — ต้องเป็น null ไม่ใช่เดาเลข", () => {
  const ids = resolveOwnerDepartments(CONFIRMED_OWNER_DEPARTMENT_ID, {});
  assert.equal(ids["บัญชี กรุงเทพ"], null);
  assert.equal(ids["บัญชี ลาดกระบัง"], null);
  assert.deepEqual(unmappedIn(ids).sort(), ["บัญชี กรุงเทพ", "บัญชี ลาดกระบัง"]);
});

test("HR เห็นทุกฝ่าย", () => {
  const hr = identity({ departmentId: "24", department: "ทรัพยากรบุคคล" });
  assert.deepEqual(ownerScope(hr), { all: true });
  assert.equal(canSeeOwner(hr, "ยานยนต์"), true);
});

test("ฝ่ายอื่นเห็นแค่ของตัวเอง", () => {
  const delivery = identity();
  assert.deepEqual(ownerScope(delivery), {
    all: false,
    owners: ["จัดส่ง ลาดกระบัง"],
  });
  assert.equal(canSeeOwner(delivery, "จัดส่ง ลาดกระบัง"), true);
  assert.equal(canSeeOwner(delivery, "ยานยนต์"), false);
});

test("ยังไม่ล็อกอิน = ไม่เห็นอะไรเลย แม้ค่าสำรองจะสังกัด HR", () => {
  const guest = identity({ departmentId: "24", authenticated: false });
  assert.deepEqual(ownerScope(guest), { all: false, owners: [] });
  assert.equal(canSeeOwner(guest, "จัดส่ง ลาดกระบัง"), false);
});

test("อัปโหลดได้เฉพาะรายการที่ฝ่ายตัวเองรับผิดชอบ · HR อัปโหลดแทนได้", () => {
  const delivery = identity();
  assert.equal(canUploadItem(delivery, "01"), true);
  assert.equal(canUploadItem(delivery, "17"), false);
  const hr = identity({ departmentId: "24" });
  assert.equal(canUploadItem(hr, "17"), true);
});

test("รายการที่ไม่มีในทะเบียน อัปโหลดไม่ได้ ไม่ว่าใคร", () => {
  assert.equal(canUploadItem(identity({ departmentId: "24" }), "99"), false);
});
