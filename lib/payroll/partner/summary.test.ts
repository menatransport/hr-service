import { test } from "node:test";
import assert from "node:assert/strict";

import { SYSTEM_ITEMS } from "@/lib/payroll/registry";
import { adaptPartnerEntries, paidNetOf } from "@/lib/payroll/partner/adapter";
import { CONTRACTS, EDITED_ENTRY, ENTRIES, LINKS } from "@/lib/payroll/partner/fixtures";
import { combineTotals, notesOf, summarizeSystemItem } from "@/lib/payroll/partner/summary";

const item = SYSTEM_ITEMS[0];
const ALL = [...ENTRIES, EDITED_ENTRY];
const facts = adaptPartnerEntries({ period: "2026-09", entries: ALL, links: LINKS, contracts: CONTRACTS });
const cents = (n: number) => Math.round(n * 100);

test("ยอดสุทธิของรายการ = paidNet รวมของ partner · แยกดูรายสัญญาได้", () => {
  const s = summarizeSystemItem(item, facts, { month: "2026-09", phase: "approved" });
  assert.equal(cents(s.net), ALL.reduce((t, e) => t + cents(paidNetOf(e)), 0));
  assert.equal(cents(s.add) - cents(s.cut), cents(s.net));
  assert.equal(s.payees, ALL.length);
  for (const row of s.rows) {
    const e = ALL.find((x) => x.contractCode === row.payeeId)!;
    assert.equal(cents(row.net), cents(paidNetOf(e)), row.payeeId);
  }
});

test("นับคนที่จับคู่แบบไม่ซ้ำ · คนไม่มีคู่และแถวปรับส่วนต่างถูกนับแยก", () => {
  const s = summarizeSystemItem(item, facts, { month: "2026-09", phase: "approved" });
  /* MTL001→670101, MTL003→670150, MTL004+MTL005→670200 */
  assert.equal(s.linkedPeople, 3);
  assert.equal(s.unlinked, 2); /* MTL002 + MTL006 */
  assert.equal(s.adjusted, 1);
  assert.equal(s.rows.find((r) => r.payeeId === "MTL001")?.plate, "70-1234 กทม.");
});

test("งวดที่ยังไม่อนุมัติ ขึ้นข้อสังเกต ไม่บล็อก", () => {
  const s = summarizeSystemItem(item, facts, { month: "2026-09", phase: "checked" });
  assert.equal(s.final, false);
  const notes = notesOf(s);
  assert.ok(notes.some((n) => n.includes("ยังไม่อนุมัติ")));
  assert.ok(notes.some((n) => n.includes("ยังไม่จับคู่")));
  assert.ok(notes.some((n) => n.includes("ส่วนต่าง")));
});

test("เดือนที่ไม่มีแถว ได้ยอดศูนย์และบอกตรง ๆ", () => {
  const s = summarizeSystemItem(item, [], { month: "2026-10", phase: "draft" });
  assert.equal(s.payees, 0);
  assert.equal(s.net, 0);
  assert.deepEqual(notesOf(s), ["ระบบรถร่วมยังไม่มียอดของงวด 2026-10"]);
});

test("รวมหลายรายการเป็นสตางค์ ไม่มีเศษ float", () => {
  const total = combineTotals([
    { add: 0.1, cut: 0, net: 0.1 },
    { add: 0.2, cut: 0, net: 0.2 },
  ]);
  assert.equal(total.add, 0.3);
  assert.equal(total.net, 0.3);
});
