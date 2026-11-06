import { MODULES, type ModuleGroup, type ModuleItem } from "@/lib/modules";

import { MANUALS, type Manual } from "./manual";

export interface ManualEntry {
  manual: Manual;
  item: ModuleItem;
  group: ModuleGroup;
  /** หัวข้อ subgroup เมื่อเมนูนี้เป็นเมนูย่อย */
  parentLabel?: string;
}

/**
 * คู่มือทุกเล่ม เรียงตามเมนูใน `lib/modules.ts` — ข้ามกลุ่มที่ซ่อนและเมนูที่ยัง “เร็ว ๆ นี้”
 * ชื่อ/ไอคอนตรงกับเมนูที่ผู้ใช้เห็นจริง: subgroup ที่เหลือลูกเดียวตามสิทธิ์ถูก `filterModules()`
 * ยุบเป็นเมนูเดียวชื่อหัวข้อ (เช่น “พนักงานใหม่”) คู่มือจึงใช้ชื่อหัวข้อนั้นเหมือนกัน (6 พ.ย. 2569 · Bew)
 */
export function manualEntries(hidden: ReadonlySet<string> = new Set()): ManualEntry[] {
  const byId = new Map(MANUALS.map((m) => [m.id, m]));
  return MODULES.filter((g) => !g.hidden).flatMap((group) =>
    group.items.flatMap((item): ManualEntry[] => {
      if (item.soon) return [];
      const seen = item.children?.filter((c) => !hidden.has(c.id));
      const leaves =
        seen?.length === 1
          ? [{ c: { ...seen[0], label: item.label, icon: item.icon }, parentLabel: undefined }]
          : item.children
            ? item.children.map((c) => ({ c, parentLabel: item.label }))
            : [{ c: item, parentLabel: undefined }];
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
