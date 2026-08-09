import { caseAgeDays } from "./case-flow";
import { reasonGroups } from "./data";
import type { DepartmentId, HrCase, ReasonGroupCode } from "./types";

/**
 * ตัวเลขสรุปของหน้า `/desk/reports` — **คำนวณจากคำร้องจริงทุกครั้ง**
 * ไม่มีชุดตัวเลขตายตัวใน `lib/data.ts` อีกแล้ว
 */

export interface ReasonSlice {
  code: ReasonGroupCode;
  count: number;
}

/** จำนวนคำร้องแยกตามกลุ่มสาเหตุ — เรียงมากไปน้อย ตัดกลุ่มที่ไม่มีคำร้องทิ้ง */
export function reasonBreakdown(cases: HrCase[]): ReasonSlice[] {
  const tally = new Map<ReasonGroupCode, number>(
    reasonGroups.map((g) => [g.code, 0]),
  );
  for (const c of cases) {
    tally.set(c.reasonGroup, (tally.get(c.reasonGroup) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([code, count]) => ({ code, count }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface DepartmentSlice {
  id: DepartmentId;
  cases: number;
  /** เวลาปิดคำร้องเฉลี่ย (วัน) — นับเฉพาะคำร้องที่ปิดแล้ว, `null` = ยังไม่มีคำร้องปิด */
  avgDays: number | null;
}

/** ปริมาณงานและเวลาปิดคำร้องเฉลี่ยรายหน่วยงาน — เรียงตามจำนวนคำร้อง */
export function departmentPerformance(cases: HrCase[]): DepartmentSlice[] {
  const tally = new Map<DepartmentId, { cases: number; days: number[] }>();

  for (const c of cases) {
    if (!c.departmentId) continue;
    const row = tally.get(c.departmentId) ?? { cases: 0, days: [] };
    row.cases += 1;
    if (c.status === "closed") row.days.push(caseAgeDays(c));
    tally.set(c.departmentId, row);
  }

  return [...tally.entries()]
    .map(([id, row]) => ({
      id,
      cases: row.cases,
      avgDays: row.days.length
        ? Math.round((row.days.reduce((a, b) => a + b, 0) / row.days.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.cases - a.cases);
}
