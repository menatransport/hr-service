"use client";

import { useState } from "react";

import "@/components/dashboard/dashboard.css";
import { DashTabs } from "@/components/dashboard/card";
import type { MpBoard } from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

import { ManpowerDailySection } from "./manpower-daily-section";

/**
 * แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ **โทนของตัวเอง ไม่ใช้ธีมระบบ** (`.dash` ใน `dashboard.css`)
 *
 * โครง: หัวหน้า → แท็บหมวด → เนื้อหมวด
 * · **เพิ่มหมวดใหม่** = เพิ่มรายการใน `DASH_SECTIONS` + คอมโพเนนต์หมวดในโฟลเดอร์นี้
 *   (ใช้ `DashCard`/`StatTile`/`ChartFrame` จาก `components/dashboard/`) · ข้อมูลของหมวดเพิ่มที่ `page.tsx`
 * · Manpower = รายงาน Manpower พจส. รายวัน/สัปดาห์/เดือน แทนชีต “[HR] Manpower Daily Report” (15 พ.ย. 2569)
 */

const DASH_SECTIONS = [{ id: "manpower", label: "Manpower" }] as const;
type SectionId = (typeof DASH_SECTIONS)[number]["id"];

export function DashboardView({ manpower, canEditTargets }: { manpower: MpBoard; canEditTargets: boolean }) {
  const [section, setSection] = useState<SectionId>("manpower");

  return (
    <div className="dash -m-(--sheet-px) min-h-full rounded-[inherit] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 animate-rise">
      <header className="mb-5">
        <h1 className="text-24 font-semibold tracking-tight">แดชบอร์ด พนักงานจัดส่ง</h1>
        <p className="mt-0.5 text-13 text-(--dash-mut)">กำลังคน พจส. เทียบเป้า · ท่อสรรหา · แนวโน้มรายวัน / สัปดาห์ / เดือน</p>
      </header>

      <div className="mb-5 border-b border-(--dash-grid)">
        <div className="-mb-px">
          <DashTabs tabs={[...DASH_SECTIONS]} value={section} onChange={setSection} />
        </div>
      </div>

      {section === "manpower" ? <ManpowerDailySection board={manpower} canEditTargets={canEditTargets} /> : null}
    </div>
  );
}
