import { test } from "node:test";
import assert from "node:assert/strict";

import { canExportResignedPhone } from "./resigned-phone-export";

test("สองคนที่ได้รับสิทธิ์ — ทั้ง username และอีเมลเต็ม ไม่สนตัวพิมพ์", () => {
  assert.equal(canExportResignedPhone({ username: "putthachart.n" }), true);
  assert.equal(canExportResignedPhone({ username: "Kanokwan.S" }), true);
  assert.equal(canExportResignedPhone({ username: " kanokwan.s@menatransport.co.th " }), true);
});

test("คนอื่น / ไม่มี username / ไม่มีผู้ใช้ = ไม่ได้เบอร์", () => {
  assert.equal(canExportResignedPhone({ username: "narongkorn.a" }), false);
  assert.equal(canExportResignedPhone({ username: "putthachart.n@gmail.com" }), false);
  assert.equal(canExportResignedPhone({ username: "" }), false);
  assert.equal(canExportResignedPhone(null), false);
});
