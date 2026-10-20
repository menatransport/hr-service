"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, Clock } from "lucide-react";

import "@/components/dashboard/dashboard.css";
import { DashSelect, DashTabs } from "@/components/dashboard/card";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type { ManpowerBoard } from "@/app/recruitment/_lib/dashboard/manpower";
import { ManpowerSection, baseCustomer } from "./manpower-section";

/**
 * แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ **โทนของตัวเอง ไม่ใช้ธีมระบบ** (`.dash` ใน `dashboard.css`)
 *
 * โครง: หัวหน้า (ชื่อ · เวลาข้อมูล · ตัวกรองลูกค้าที่ใช้ทุกหมวด) → แท็บหมวด → เนื้อหมวด
 * · **เพิ่มหมวดใหม่** = เพิ่มรายการใน `DASH_SECTIONS` + คอมโพเนนต์หมวดในโฟลเดอร์นี้
 *   (ใช้ `DashCard`/`StatTile`/`ChartFrame` จาก `components/dashboard/`) · ข้อมูลของหมวดเพิ่มที่ `page.tsx`
 */

const DASH_SECTIONS = [{ id: "manpower", label: "Manpower" }] as const;
type SectionId = (typeof DASH_SECTIONS)[number]["id"];

const ALL = "all";

export function DashboardView({ manpower }: { manpower: ManpowerBoard }) {
  const [section, setSection] = useState<SectionId>("manpower");
  const [customer, setCustomer] = useState(ALL);

  const customers = useMemo(() => {
    const n = new Map<string, number>();
    /* ลูกค้าหลัก — "Scco MS" รวมอยู่ใน "Scco" (ตำแหน่ง L/S เป็นอีกมิติในกราฟ) */
    for (const r of manpower.rows) {
      const c = baseCustomer(r.customer);
      n.set(c, (n.get(c) ?? 0) + r.working);
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  }, [manpower.rows]);
  const rows = useMemo(
    () => (customer === ALL ? manpower.rows : manpower.rows.filter((r) => baseCustomer(r.customer) === customer)),
    [manpower.rows, customer],
  );

  return (
    <div className="dash -m-(--sheet-px) min-h-full rounded-[inherit] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 animate-rise">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-24 font-semibold tracking-tight">แดชบอร์ด พนักงานจัดส่ง</h1>
          <p className="mt-1 flex items-center gap-1.5 text-12-5 text-(--dash-mut)">
            <Clock size={13} aria-hidden />
            ทะเบียน พจส. ล่าสุด {manpower.registrySyncedAt ? formatThaiDateTime(manpower.registrySyncedAt) : "—"} · คำขอสรรหาอ่านสด
          </p>
        </div>
        <DashSelect
          label="ลูกค้า"
          value={customer}
          onChange={setCustomer}
          options={[
            { value: ALL, label: "ทั้งหมด", hint: manpower.rows.reduce((n, r) => n + r.working, 0).toLocaleString("th-TH") },
            ...customers.map(([c, n]) => ({ value: c, label: c, hint: n.toLocaleString("th-TH") })),
          ]}
        />
      </header>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-(--dash-grid)">
        <div className="-mb-px">
          <DashTabs tabs={[...DASH_SECTIONS]} value={section} onChange={setSection} />
        </div>
        {customer !== ALL ? (
          <button
            type="button"
            onClick={() => setCustomer(ALL)}
            className="mb-2 inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-12-5 text-(--dash-ink-2) hover:bg-(--dash-hover)"
          >
            <ChevronLeft size={14} aria-hidden />
            ทุกลูกค้า <span className="text-(--dash-mut)">/ {customer}</span>
          </button>
        ) : null}
      </div>

      {section === "manpower" ? (
        <ManpowerSection
          board={manpower}
          rows={rows}
          customer={customer === ALL ? "" : customer}
          onCustomer={(c) => setCustomer(c || ALL)}
        />
      ) : null}
    </div>
  );
}
