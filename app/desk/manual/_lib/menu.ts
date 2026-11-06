import { MODULES, type ModuleGroup, type ModuleItem } from "@/lib/modules";

import { MANUALS, type Manual } from "./manual";

export interface ManualEntry {
  manual: Manual;
  item: ModuleItem;
  group: ModuleGroup;
  /** หัวข้อ subgroup เมื่อเมนูนี้เป็นเมนูย่อย */
  parentLabel?: string;
}

/** คู่มือทุกเล่ม เรียงตามเมนูใน `lib/modules.ts` — ข้ามกลุ่มที่ซ่อนและเมนูที่ยัง “เร็ว ๆ นี้” */
export function manualEntries(hidden: ReadonlySet<string> = new Set()): ManualEntry[] {
  const byId = new Map(MANUALS.map((m) => [m.id, m]));
  return MODULES.filter((g) => !g.hidden).flatMap((group) =>
    group.items.flatMap((item): ManualEntry[] => {
      if (item.soon) return [];
      const leaves = item.children ? item.children.map((c) => ({ c, parentLabel: item.label })) : [{ c: item, parentLabel: undefined }];
      return leaves.flatMap(({ c, parentLabel }) => {
        const manual = byId.get(c.id);
        return manual && !hidden.has(c.id) ? [{ manual, item: c, group, parentLabel }] : [];
      });
    }),
  );
}

const DATE = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });

/** `2026-11-05` → `5 พ.ย. 2569` */
export const thaiDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00+07:00`));
