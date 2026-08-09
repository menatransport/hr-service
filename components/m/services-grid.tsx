"use client";

import { useMemo, useState } from "react";

import { ServiceTile } from "@/components/m/service-tile";
import { SearchField } from "@/components/ui/field";
import { buildServices } from "@/lib/data";

/**
 * รายการบริการประกอบที่นี่ ไม่ใช่ที่ server — `icon` เป็น component ของ lucide
 * ซึ่งส่งข้าม server → client boundary ไม่ได้ จึงรับมาแค่ตัวเลขที่ต้องใช้ NCAC
 */
export function ServicesGrid({ openCaseCount }: { openCaseCount: number }) {
  const [query, setQuery] = useState("");
  const services = useMemo(() => buildServices(openCaseCount), [openCaseCount]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) =>
      `${s.label} ${s.hint}`.toLowerCase().includes(q),
    );
  }, [query, services]);

  return (
    <div className="flex flex-col gap-4">
      <SearchField
        value={query}
        onChange={setQuery}
        label="ค้นหาบริการ"
        placeholder="ค้นหาบริการ"
        tone="filled"
      />

      {visible.length ? (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((s) => (
            <ServiceTile
              key={s.href}
              href={s.href}
              label={s.label}
              hint={s.hint}
              hintTone={s.hintTone}
              icon={s.icon}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-box border border-dashed border-line px-4 py-8 text-center text-[13px] text-mut">
          ไม่พบบริการที่ตรงกับ “{query}”
        </p>
      )}
    </div>
  );
}
