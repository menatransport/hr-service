import { test } from "node:test";
import assert from "node:assert/strict";

import { sumByPayee, type Fact } from "@/lib/payroll/normalize";
import {
  adaptPartnerEntries,
  ADJUST_LABEL,
  CARRY_OUT_LABEL,
  isAdjustment,
  isUnlinked,
  netSatang,
  paidNetOf,
  PARTNER_ITEM_ID,
  PARTNER_MEASURES,
  UNLINKED_NOTE,
} from "@/lib/payroll/partner/adapter";
import { CONTRACTS, EDITED_ENTRY, ENTRIES, LEGACY_ENTRY, LINKS } from "@/lib/payroll/partner/fixtures";

const ALL = [...ENTRIES, EDITED_ENTRY, LEGACY_ENTRY];
const facts = adaptPartnerEntries({ period: "2026-09", entries: ALL, links: LINKS, contracts: CONTRACTS });
const ofPayee = (code: string): Fact[] => facts.filter((f) => f.payeeId === code);
const cents = (n: number) => Math.round(n * 100);

test("ยอดรวมที่ส่งออก = paidNet รวมของ partner ทุกสตางค์", () => {
  const partnerTotal = ALL.reduce((s, e) => s + cents(paidNetOf(e)), 0);
  assert.equal(netSatang(facts), partnerTotal);
});

test("ทุกสัญญา: Σเพิ่ม − Σหัก = paidNet ของแถวนั้น", () => {
  for (const entry of ALL) {
    assert.equal(netSatang(ofPayee(entry.contractCode)), cents(paidNetOf(entry)), entry.contractCode);
  }
});

test("sumByPayee ของท่อเดิมได้ยอดเดียวกัน (เข้าท่อเดียวกับรายการไฟล์ได้ตรง ๆ)", () => {
  const rows = sumByPayee(facts);
  assert.equal(rows.length, ALL.length);
  for (const row of rows) {
    const entry = ALL.find((e) => e.contractCode === row.payeeId)!;
    assert.equal(cents(row.add) - cents(row.cut), cents(paidNetOf(entry)), row.payeeId);
  }
});

test("แถวปกติของ engine ไม่ต้องมีบรรทัดปรับส่วนต่าง", () => {
  for (const entry of ENTRIES) {
    assert.equal(ofPayee(entry.contractCode).some(isAdjustment), false, entry.contractCode);
  }
});

test("ค่างวด น้ำมันเกินเรต หนี้ยกมา WHT ลงเป็น ‘หัก’ · คืนน้ำมันต่ำกว่าเรตลงเป็น ‘เพิ่ม’", () => {
  const find = (code: string, label: string) =>
    ofPayee(code).find((f) => f.kind === "ค่าที่วัด" && f.measure === label);
  const effect = (code: string, label: string) => {
    const f = find(code, label);
    return f?.kind === "ค่าที่วัด" ? [f.effect, f.value] : undefined;
  };
  assert.deepEqual(effect("MTL001", "ค่างวดรถ"), ["หัก", 12000]);
  assert.deepEqual(effect("MTL001", "คืนน้ำมันต่ำกว่าเรต"), ["เพิ่ม", 820.25]);
  assert.deepEqual(effect("MTL002", "น้ำมันเกินเรต"), ["หัก", 3200]);
  assert.deepEqual(effect("MTL002", "หนี้ยกมาจากงวดก่อน"), ["หัก", 2500]);
  assert.equal(effect("MTL001", "ภาษีหัก ณ ที่จ่าย 3%")?.[0], "หัก");
});

test("สุทธิติดลบ: โอน 0 และยอดยกไปงวดหน้าขึ้นเป็น ‘เพิ่ม’ ให้สมดุล", () => {
  const entry = ENTRIES.find((e) => e.contractCode === "MTL003")!;
  assert.equal(entry.paidNet, 0);
  assert.ok((entry.carryOut ?? 0) > 0);
  const carry = ofPayee("MTL003").find((f) => f.kind === "ค่าที่วัด" && f.measure === CARRY_OUT_LABEL);
  assert.ok(carry && carry.kind === "ค่าที่วัด");
  assert.equal(carry.effect, "เพิ่ม");
  assert.equal(carry.value, entry.carryOut);
  assert.equal(netSatang(ofPayee("MTL003")), 0);
});

test("คนที่ยังไม่จับคู่ยังขึ้นครบ — personId ว่าง มีป้าย ไม่ถูกตัดทิ้ง", () => {
  const rows = ofPayee("MTL002");
  assert.ok(rows.length > 5);
  assert.ok(rows.every(isUnlinked));
  assert.ok(rows.every((f) => f.dims.note === UNLINKED_NOTE));
  assert.equal(ofPayee("MTL001").some(isUnlinked), false);
});

test("payeeId = contractCode เสมอ · personId = drivercode · personType = พจร. · ทะเบียนจากสัญญา", () => {
  const f = ofPayee("MTL001")[0];
  assert.equal(f.payeeId, "MTL001");
  assert.equal(f.personId, "670101");
  assert.equal(f.dims.personType, "พจร.");
  assert.equal(f.dims.plate, "70-1234 กทม.");
  assert.equal(f.dims.docNo, "2026-09/MTL001");
  assert.equal(f.itemId, PARTNER_ITEM_ID);
  assert.equal(f.owner, "ระบบรถร่วม");
  assert.equal(f.period, "2026-09");
  assert.equal(ofPayee("MTL004")[0].dims.plate, "70-9999");
});

test("คนเดียวสองสัญญา: สองผู้รับเงิน คนเดียวกัน ไม่รวมยอดเข้าด้วยกัน", () => {
  const a = ofPayee("MTL004");
  const b = ofPayee("MTL005");
  assert.ok(a.length > 0 && b.length > 0);
  assert.ok([...a, ...b].every((f) => f.personId === "670200"));
  assert.equal(new Set([...a, ...b].map((f) => f.payeeId)).size, 2);
});

test("คู่ของสัญญาที่ไม่มีแถวในเดือนนี้ ไม่สร้างแถวผี", () => {
  assert.equal(facts.some((f) => f.payeeId === "MTL999"), false);
});

test("แถวที่แก้ผ่าน PUT (ช่องย่อยไม่รวมเป็น paidNet) ได้บรรทัดปรับส่วนต่างที่มองเห็นได้", () => {
  const adj = ofPayee("MTL006").filter(isAdjustment);
  assert.equal(adj.length, 1);
  const [line] = adj;
  assert.ok(line.kind === "ค่าที่วัด");
  assert.equal(line.measure, ADJUST_LABEL);
  assert.equal(line.effect, "หัก");
  assert.equal(line.value, 500);
});

test("แถวเก่าไม่มี paidNet ใช้สูตรเดียวกับหน้าอนุมัติของ partner", () => {
  assert.equal(paidNetOf(LEGACY_ENTRY), 18300);
  assert.equal(netSatang(ofPayee("MTL007")), 1830000);
});

test("ช่องที่เป็นศูนย์ไม่ขึ้นแถว · ตัวนับเป็นอ้างอิงไม่เข้ายอด", () => {
  const rows = ofPayee("MTL005");
  assert.equal(rows.some((f) => f.kind === "ค่าที่วัด" && f.measure === "ค่าล่วงเวลา"), false);
  const days = rows.find((f) => f.kind === "ค่าที่วัด" && f.measure === "วันทำงาน");
  assert.ok(days && days.kind === "ค่าที่วัด");
  assert.equal(days.effect, "อ้างอิง");
  assert.equal(days.unit, "วัน");
});

test("ผังช่องเงิน: ทุกช่องมีเหตุผล ไม่ซ้ำ และไม่มีช่องรอยืนยัน", () => {
  const fields = PARTNER_MEASURES.map((m) => m.field);
  assert.equal(new Set(fields).size, fields.length);
  for (const m of PARTNER_MEASURES) {
    assert.ok(m.why.length > 3, m.field);
    assert.notEqual(m.effect, "รอยืนยัน", m.field);
  }
  /* ยอดรวมของ engine ห้ามลงเป็นเงิน — ลงทั้งรวมทั้งย่อยคือนับซ้ำ */
  for (const total of ["paidNet", "whtBase"] as const) {
    assert.equal(PARTNER_MEASURES.find((m) => m.field === total)?.effect, "อ้างอิง");
  }
  for (const f of ["netPay", "payable", "totalIncome", "totalDeductions"]) {
    assert.equal(fields.includes(f as never), false, f);
  }
});

test("ผลไม่ขึ้นกับลำดับที่ฐานคืนมา", () => {
  const reversed = adaptPartnerEntries({
    period: "2026-09", entries: [...ALL].reverse(), links: LINKS, contracts: CONTRACTS,
  });
  assert.deepEqual(reversed, facts);
});
