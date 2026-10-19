import { test } from "node:test";
import assert from "node:assert/strict";
import type { Document } from "mongodb";

import { HR, PARTNER } from "@/lib/db/registry.mjs";
import { paidNetOf } from "@/lib/payroll/partner/adapter";
import { CONTRACTS, ENTRIES, LINKS } from "@/lib/payroll/partner/fixtures";
import { partnerSummaryFor } from "@/lib/payroll/partner/load";
import type { ReadCol } from "@/lib/payroll/partner/source";

const data: Record<string, Document[]> = {
  [PARTNER.payrollEntries]: ENTRIES as unknown as Document[],
  [PARTNER.monthStatus]: [{ phase: "locked" }],
  [PARTNER.contracts]: CONTRACTS as unknown as Document[],
  [HR.partnerDriverLinks.name]: LINKS as unknown as Document[],
};
const col = (name: string): ReadCol => ({
  find: () => ({ toArray: async () => data[name] ?? [] }),
  findOne: async () => (data[name] ?? [])[0] ?? null,
});

test("ต้นจนจบ (ฐานปลอม): ยอดของรอบ ก.ย. 2569 = paidNet รวมของ partner งวด 2026-09", async () => {
  const s = await partnerSummaryFor(
    { year: 2569, month: 8 },
    { partner: async (n) => col(n), links: async () => col(HR.partnerDriverLinks.name) },
  );
  assert.equal(s.month, "2026-09");
  assert.equal(s.itemId, "partner-mixer");
  assert.equal(s.final, true);
  assert.equal(s.payees, ENTRIES.length);
  const total = ENTRIES.reduce((t, e) => t + Math.round(paidNetOf(e) * 100), 0);
  assert.equal(Math.round(s.net * 100), total);
  assert.equal(s.unlinked, 1);
});
