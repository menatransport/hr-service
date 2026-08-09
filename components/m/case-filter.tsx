"use client";

import { useState } from "react";

import { CaseCard } from "@/components/m/case-card";
import type { HrCase } from "@/lib/types";

type Filter = "all" | "open" | "closed";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "open", label: "ยังไม่ปิด" },
  { id: "closed", label: "ปิดแล้ว" },
];

const matches = (c: HrCase, f: Filter) =>
  f === "all" ? true : f === "closed" ? c.status === "closed" : c.status !== "closed";

export function CaseFilter({ cases }: { cases: HrCase[] }) {
  const [active, setActive] = useState<Filter>("all");
  const visible = cases.filter((c) => matches(c, active));

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="กรองเคส"
        className="-mx-5 flex gap-2 overflow-x-auto px-5 no-scrollbar"
      >
        {filters.map((f) => {
          const on = active === f.id;
          return (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setActive(f.id)}
              className={`flex-none rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
                on
                  ? "border-ink bg-ink text-ink-content"
                  : "border-line bg-base-100 text-mut hover:border-ink/30 hover:text-ink"
              }`}
            >
              {f.label}
              <span className={on ? "opacity-70" : "opacity-60"}>
                {" "}
                {cases.filter((c) => matches(c, f.id)).length}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length ? (
        <div className="flex flex-col gap-2.5">
          {visible.map((c) => (
            <CaseCard key={c.trackingNo} hrCase={c} showDepartment />
          ))}
        </div>
      ) : (
        <p className="rounded-box border border-dashed border-line px-4 py-8 text-center text-[13px] text-mut">
          ไม่มีเคสในหมวดนี้
        </p>
      )}
    </div>
  );
}
