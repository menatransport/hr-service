import type { PeriodRef } from "../period";
import { periodCode } from "../period";
import { findSystemItem } from "../registry";
import { adaptPartnerEntries, PARTNER_ITEM_ID } from "./adapter";
import { loadPartnerMonth, type PartnerSourceDeps } from "./source";
import { summarizeSystemItem, type SystemItemSummary } from "./summary";

/**
 * อ่าน → แปลง → สรุป ของรายการรถร่วมหนึ่งรอบ — **ฝั่งเซิร์ฟเวอร์เท่านั้น**
 * (เส้น `GET /api/payroll/summary/partner` ใช้ตัวนี้ตัวเดียว)
 */
export async function partnerSummaryFor(
  period: PeriodRef,
  deps?: PartnerSourceDeps,
): Promise<SystemItemSummary> {
  const item = findSystemItem(PARTNER_ITEM_ID);
  if (!item) throw new Error(`ไม่พบรายการ ${PARTNER_ITEM_ID} ในทะเบียน`);

  const data = await loadPartnerMonth(period, deps);
  const facts = adaptPartnerEntries({
    period: periodCode(period),
    entries: data.entries,
    links: data.links,
    contracts: data.contracts,
  });
  return summarizeSystemItem(item, facts, {
    month: data.month,
    phase: data.phase,
    truncated: data.truncated,
  });
}
