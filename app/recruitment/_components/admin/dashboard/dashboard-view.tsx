"use client";

import { useState } from "react";

import "@/components/dashboard/dashboard.css";
import { DashTabs } from "@/components/dashboard/card";

/**
 * แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ **โทนของตัวเอง ไม่ใช้ธีมระบบ** (`.dash` ใน `dashboard.css`)
 *
 * โครง: หัวหน้า → แท็บหมวด → เนื้อหมวด
 * · **เพิ่มหมวดใหม่** = เพิ่มรายการใน `DASH_SECTIONS` + คอมโพเนนต์หมวดในโฟลเดอร์นี้
 *   (ใช้ `DashCard`/`StatTile`/`ChartFrame` จาก `components/dashboard/`) · ข้อมูลของหมวดเพิ่มที่ `page.tsx`
 */

const DASH_SECTIONS = [{ id: "manpower", label: "Manpower" }] as const;
type SectionId = (typeof DASH_SECTIONS)[number]["id"];

export function DashboardView() {
  const [section, setSection] = useState<SectionId>("manpower");

  return (
    <div className="dash -m-(--sheet-px) min-h-full rounded-[inherit] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 animate-rise">
      <header className="mb-5">
        <h1 className="text-24 font-semibold tracking-tight">แดชบอร์ด พนักงานจัดส่ง</h1>
      </header>

      <div className="mb-5 border-b border-(--dash-grid)">
        <div className="-mb-px">
          <DashTabs tabs={[...DASH_SECTIONS]} value={section} onChange={setSection} />
        </div>
      </div>
    </div>
  );
}
