import { test } from "node:test";
import assert from "node:assert/strict";
import type { Document } from "mongodb";

import { HR, PARTNER } from "@/lib/db/registry.mjs";
import { ENTRY_PROJECTION, loadPartnerMonth, normalizePhase, type ReadCol } from "@/lib/payroll/partner/source";
import { PARTNER_MEASURES } from "@/lib/payroll/partner/adapter";

const LINKS = HR.partnerDriverLinks.name;
const ENTRIES = PARTNER.payrollEntries;
const STATUS = PARTNER.monthStatus;
const CONTRACTS = PARTNER.contracts;

interface Call { col: string; op: "find" | "findOne"; filter: Document; options: Document }

/** ฐานปลอม — จำทุกคิวรีไว้ให้ตรวจรูป ไม่มีการต่อ Mongo จริง */
function fakeDeps(data: Record<string, Document[]>) {
  const calls: Call[] = [];
  const col = (name: string): ReadCol => ({
    find: (filter, options) => {
      calls.push({ col: name, op: "find", filter, options });
      return { toArray: async () => data[name] ?? [] };
    },
    findOne: async (filter, options) => {
      calls.push({ col: name, op: "findOne", filter, options });
      return (data[name] ?? [])[0] ?? null;
    },
  });
  return {
    calls,
    deps: { partner: async (name: string) => col(name), links: async () => col(LINKS) },
  };
}

test("อ่านเดือนของรอบด้วยคีย์ที่แปลงแล้ว พร้อม projection และเพดาน", async () => {
  const { calls, deps } = fakeDeps({
    [ENTRIES]: [
      { contractCode: "MTL001", month: "2026-09", transportFee: 100, paidNet: 97 },
      { contractCode: "MTL002", month: "2026-09", transportFee: 50, paidNet: 50 },
    ],
    [STATUS]: [{ phase: "review" }],
    [LINKS]: [{ contractCode: "MTL001", drivercode: "670101" }],
    [CONTRACTS]: [{ contractCode: "MTL001", licensePlate: "70-1234" }],
  });

  const got = await loadPartnerMonth({ year: 2569, month: 8 }, deps);

  assert.equal(got.month, "2026-09");
  assert.equal(got.phase, "checked");
  assert.equal(got.entries.length, 2);
  assert.deepEqual(got.links, [{ contractCode: "MTL001", drivercode: "670101" }]);
  assert.equal(got.contracts[0].licensePlate, "70-1234");
  assert.equal(got.truncated, false);

  const entries = calls.find((c) => c.col === ENTRIES)!;
  assert.deepEqual(entries.filter, { month: "2026-09" });
  assert.equal(entries.options.projection, ENTRY_PROJECTION);
  assert.ok(typeof entries.options.limit === "number");

  for (const c of calls.filter((c) => c.col === LINKS || c.col === CONTRACTS)) {
    assert.deepEqual(c.filter, { contractCode: { $in: ["MTL001", "MTL002"] } });
    assert.equal(c.options.projection._id, 0);
  }
});

test("เดือนที่ไม่มีแถว ไม่ยิงคิวรีคู่/สัญญาต่อ และสถานะเริ่มเป็น draft", async () => {
  const { calls, deps } = fakeDeps({});
  const got = await loadPartnerMonth({ year: 2569, month: 9 }, deps);
  assert.equal(got.month, "2026-10");
  assert.equal(got.phase, "draft");
  assert.deepEqual(got.entries, []);
  assert.equal(calls.some((c) => c.col === LINKS || c.col === CONTRACTS), false);
});

test("projection ครอบทุกช่องที่ผังเงินใช้ และไม่ดึงก้อนรายละเอียด", () => {
  for (const m of PARTNER_MEASURES) assert.equal(ENTRY_PROJECTION[m.field], 1, m.field);
  assert.equal(ENTRY_PROJECTION.carryOut, 1);
  assert.equal("ledgerItems" in ENTRY_PROJECTION, false);
  assert.equal("extrasItems" in ENTRY_PROJECTION, false);
});

test("สถานะงวด: review = ตรวจแล้ว · ค่าแปลกตกเป็น draft", () => {
  assert.equal(normalizePhase("approved"), "approved");
  assert.equal(normalizePhase("locked"), "locked");
  assert.equal(normalizePhase("review"), "checked");
  assert.equal(normalizePhase(undefined), "draft");
  assert.equal(normalizePhase("อะไรก็ได้"), "draft");
});
