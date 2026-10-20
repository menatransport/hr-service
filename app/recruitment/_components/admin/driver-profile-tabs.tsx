"use client";

import { useState } from "react";
import { CalendarDays, FileText, User } from "lucide-react";

import { SummaryTabs, type SummaryTab } from "@/components/ui/summary-panel";
import {
  DRIVER_PROFILE_TABS,
  type DriverProfileTab,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * แท็บของหน้าประวัติคนขับ — ข้อมูลทั่วไป / เอกสาร / ปฏิทินการทำงาน
 *
 * เนื้อหาทุกแท็บเรนเดอร์จากเซิร์ฟเวอร์มาครบแล้ว ที่นี่แค่ซ่อน/แสดง — สลับแท็บไม่ยิงเซิร์ฟเวอร์ซ้ำ
 * และของที่กรอกค้างในแท็บอื่น (เช่น ช่องวันหมดอายุบัตร) ไม่หาย · แท็บที่เปิดอยู่จดลง `?tab=`
 * ด้วย `replaceState` ส่งลิงก์ต่อหรือรีโหลดแล้วยังอยู่แท็บเดิม
 */
export function DriverProfileTabs({
  initial,
  missingDocs,
  info,
  docs,
  work,
}: {
  initial: DriverProfileTab;
  /** เอกสารที่ต้องมีแต่ยังไม่แนบ — ขึ้นเป็นตัวเลขแดงบนแท็บ “เอกสาร” */
  missingDocs: number;
  info: React.ReactNode;
  docs: React.ReactNode;
  work: React.ReactNode;
}) {
  const [tab, setTab] = useState<DriverProfileTab>(initial);

  const tabs: SummaryTab<DriverProfileTab>[] = [
    { id: "info", label: "ข้อมูลทั่วไป", icon: User },
    {
      id: "docs",
      label: "เอกสาร",
      icon: FileText,
      count: missingDocs,
      countTitle: `ยังขาดเอกสารที่ต้องมี ${missingDocs} รายการ`,
      tone: missingDocs ? "alert" : "primary",
    },
    { id: "work", label: "ปฏิทินการทำงาน", icon: CalendarDays },
  ];

  function change(next: DriverProfileTab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "info") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", url);
  }

  const panels: Record<DriverProfileTab, React.ReactNode> = { info, docs, work };

  return (
    <div className="flex flex-col gap-6">
      <div className="sheet-bleed border-b border-line px-(--sheet-px)">
        <SummaryTabs label="หัวข้อประวัติ" value={tab} tabs={tabs} onChange={change} />
      </div>
      {DRIVER_PROFILE_TABS.map((id) => (
        <div key={id} role="tabpanel" hidden={tab !== id} className="animate-rise">
          {panels[id]}
        </div>
      ))}
    </div>
  );
}
