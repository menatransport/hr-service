import type { Fact } from "../normalize";
import type { SystemItem } from "../registry";
import { isAdjustment, isUnlinked } from "./adapter";
import type { PartnerPhase } from "./source";

/**
 * สรุปยอดของรายการจากระบบ (รถร่วม) สำหรับหน้า `/payroll/summary` — **pure ใช้ได้ทั้ง server และ client**
 *
 * เงินทุกตัวบวกเป็นสตางค์ ไม่บวก float · ยอด `net` ของรายการ = `paidNet` รวมของ partner
 * (ข้อตกลงของ `adapter.ts`)
 *
 * ## ทำไมไม่ใช้ด่าน 1/ด่าน 2 ของ intake
 *
 * ด่าน 1 ตรวจผังคอลัมน์ ชนิดข้อมูล ช่องว่าง ของ **ไฟล์ที่คนกรอก** — ข้อมูลรายการนี้ไม่ได้มาจาก
 * ไฟล์ ผังคงที่ตามโค้ด และ partner มีขั้นตรวจ → อนุมัติ → ปิดงวดของตัวเองอยู่แล้ว (`month_status`)
 * ด่าน 2 (HR กดผ่าน) จะกลายเป็นการอนุมัติซ้ำซ้อนกับผู้บริหารของ partner และขัดกับกติกา
 * "การจ่ายยึดสถานะของ partner" — จึง **ไม่ใช้ทั้งสองด่าน** แทนด้วยข้อสังเกตที่ไม่บล็อก
 * (`notesOf`) ซึ่งเป็นเรื่องที่ hr เห็นได้แต่ partner ไม่เห็น: คนที่ยังไม่จับคู่ และแถวที่ไม่สอดคล้องกันเอง
 */

export const PHASE_LABEL: Record<PartnerPhase, string> = {
  draft: "ร่าง — ระบบรถร่วมยังไม่ส่งตรวจ",
  checked: "ตรวจแล้ว รอผู้บริหารอนุมัติ",
  approved: "อนุมัติแล้ว",
  locked: "ปิดงวดแล้ว",
};

/** ยอดของงวดที่อนุมัติ/ปิดแล้วเท่านั้นที่นิ่ง — ก่อนนั้น partner ยังคำนวณใหม่ได้ทุกเมื่อ */
export const isFinalPhase = (phase: PartnerPhase): boolean => phase === "approved" || phase === "locked";

export interface SystemPayeeRow {
  payeeId: string;
  personId: string;
  personName: string;
  plate: string;
  add: number;
  cut: number;
  net: number;
  unlinked: boolean;
  adjusted: boolean;
}

export interface SystemItemSummary {
  itemId: string;
  title: string;
  system: string;
  /** เดือนของระบบต้นทางที่อ่าน */
  month: string;
  phase: PartnerPhase;
  final: boolean;
  /** จำนวนผู้รับเงิน (สัญญา) */
  payees: number;
  /** จำนวนคนที่จับคู่แล้ว (นับ drivercode ไม่ซ้ำ — คนสองสัญญานับครั้งเดียว) */
  linkedPeople: number;
  add: number;
  cut: number;
  net: number;
  unlinked: number;
  adjusted: number;
  truncated: boolean;
  rows: SystemPayeeRow[];
}

const toBaht = (cents: number) => cents / 100;

export function summarizeSystemItem(
  item: SystemItem,
  facts: readonly Fact[],
  meta: { month: string; phase: PartnerPhase; truncated?: boolean },
): SystemItemSummary {
  const byPayee = new Map<
    string,
    { personId: string; personName: string; plate: string; add: number; cut: number; unlinked: boolean; adjusted: boolean }
  >();

  for (const fact of facts) {
    if (fact.itemId !== item.id) continue;
    const row = byPayee.get(fact.payeeId) ?? {
      personId: fact.personId,
      personName: fact.dims.personName ?? "",
      plate: fact.dims.plate ?? "",
      add: 0,
      cut: 0,
      unlinked: isUnlinked(fact),
      adjusted: false,
    };
    if (isAdjustment(fact)) row.adjusted = true;
    if (fact.kind === "ค่าที่วัด" && fact.unit === "บาท") {
      if (fact.effect === "เพิ่ม") row.add += Math.round(fact.value * 100);
      else if (fact.effect === "หัก") row.cut += Math.round(fact.value * 100);
    }
    byPayee.set(fact.payeeId, row);
  }

  const rows: SystemPayeeRow[] = [...byPayee]
    .map(([payeeId, r]) => ({
      payeeId,
      personId: r.personId,
      personName: r.personName,
      plate: r.plate,
      add: toBaht(r.add),
      cut: toBaht(r.cut),
      net: toBaht(r.add - r.cut),
      unlinked: r.unlinked,
      adjusted: r.adjusted,
    }))
    .sort((a, b) => a.payeeId.localeCompare(b.payeeId));

  const addC = [...byPayee.values()].reduce((s, r) => s + r.add, 0);
  const cutC = [...byPayee.values()].reduce((s, r) => s + r.cut, 0);

  return {
    itemId: item.id,
    title: item.title,
    system: item.system,
    month: meta.month,
    phase: meta.phase,
    final: isFinalPhase(meta.phase),
    payees: rows.length,
    linkedPeople: new Set(rows.filter((r) => !r.unlinked).map((r) => r.personId)).size,
    add: toBaht(addC),
    cut: toBaht(cutC),
    net: toBaht(addC - cutC),
    unlinked: rows.filter((r) => r.unlinked).length,
    adjusted: rows.filter((r) => r.adjusted).length,
    truncated: meta.truncated === true,
    rows,
  };
}

/** รวมยอดหลายรายการจากระบบ (วันนี้มีรายการเดียว) — สตางค์ */
export function combineTotals(list: readonly Pick<SystemItemSummary, "add" | "cut" | "net">[]): {
  add: number;
  cut: number;
  net: number;
} {
  const c = (n: number) => Math.round(n * 100);
  const add = list.reduce((s, x) => s + c(x.add), 0);
  const cut = list.reduce((s, x) => s + c(x.cut), 0);
  return { add: add / 100, cut: cut / 100, net: (add - cut) / 100 };
}

/** ข้อสังเกตที่ไม่บล็อก — แทนด่านตรวจของรายการไฟล์ (เหตุผลอยู่หัวไฟล์) */
export function notesOf(summary: SystemItemSummary): string[] {
  const notes: string[] = [];
  if (summary.payees === 0) {
    notes.push(`ระบบรถร่วมยังไม่มียอดของงวด ${summary.month}`);
    return notes;
  }
  if (!summary.final) {
    notes.push(`งวด ${summary.month} ยังไม่อนุมัติ/ปิดในระบบรถร่วม — ยอดยังเปลี่ยนได้`);
  }
  if (summary.unlinked > 0) {
    notes.push(
      `${summary.unlinked} สัญญายังไม่จับคู่กับรหัสพนักงาน — ยอดยังนับรวมและจ่ายตามปกติ แค่ยังไม่รู้ว่าเป็นใครในทะเบียน พจส.`,
    );
  }
  if (summary.adjusted > 0) {
    notes.push(
      `${summary.adjusted} สัญญามีบรรทัด “ส่วนต่างให้ตรงยอดโอน” — ช่องย่อยในระบบรถร่วมรวมไม่เท่ายอดโอนที่บันทึกไว้ ควรให้ระบบรถร่วมคำนวณงวดนี้ใหม่`,
    );
  }
  if (summary.truncated) {
    notes.push("แถวเกินเพดานที่อ่านได้ — ยอดนี้อาจไม่ครบ แจ้งผู้ดูแลระบบ");
  }
  return notes;
}
