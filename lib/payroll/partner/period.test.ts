import { test } from "node:test";
import assert from "node:assert/strict";

import { periodCode } from "@/lib/payroll/period";
import {
  isIdentityMapping,
  PARTNER_MONTH_OFFSET,
  partnerMonthOf,
  periodOfPartnerMonth,
} from "@/lib/payroll/partner/period";

test("ค่าเริ่มต้น: รอบ ก.ย. 2569 อ่านงวดงานรถร่วม 2026-09 (ค.ศ.)", () => {
  assert.equal(PARTNER_MONTH_OFFSET, 0);
  assert.equal(partnerMonthOf({ year: 2569, month: 8 }), "2026-09");
  assert.equal(isIdentityMapping(), true);
});

test("ค่าเริ่มต้นตรงกับ periodCode ทุกเดือนของปี — ไม่มีการแปลงซ้อน", () => {
  for (let month = 0; month < 12; month++) {
    assert.equal(partnerMonthOf({ year: 2569, month }), periodCode({ year: 2569, month }));
  }
});

test("offset −1 (รอบ hr จ่ายงานเดือนก่อน) ข้ามปีได้ถูก", () => {
  assert.equal(partnerMonthOf({ year: 2569, month: 8 }, -1), "2026-08");
  assert.equal(partnerMonthOf({ year: 2570, month: 0 }, -1), "2026-12");
  assert.equal(partnerMonthOf({ year: 2569, month: 11 }, 1), "2027-01");
});

test("แปลงกลับได้ตรงกับขาไป และรูปแบบผิดคืน null", () => {
  for (const offset of [-1, 0, 1]) {
    const period = { year: 2570, month: 0 };
    assert.deepEqual(periodOfPartnerMonth(partnerMonthOf(period, offset), offset), period);
  }
  assert.equal(periodOfPartnerMonth("2026-9"), null);
  assert.equal(periodOfPartnerMonth("2569-13"), null);
});
