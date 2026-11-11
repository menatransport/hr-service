"use client";

import { MapPin } from "lucide-react";

import { SummaryTabs } from "@/components/ui/summary-panel";
import { RECRUIT_SITES, type RecruitSite } from "@/app/recruitment/_lib/sites";

/**
 * แถบสาขาบนสุดของหน้าผู้สมัคร — ลาดกระบัง | สระบุรี+บางปะกง (Bew 11 พ.ย. 2569)
 * · แท็บขีดเส้นใต้เต็มแถว เพราะฝ่ายบุคคลแต่ละคนดูสาขาเดียวทั้งวัน ไม่ใช่ตัวกรองที่สลับไปมา
 * · ตัวเลข = ใบสมัครทั้งหมดของสาขานั้น (ทุกสถานะ)
 */
export function SiteNav({
  value,
  sites,
  counts,
  onChange,
}: {
  value: RecruitSite;
  /** แท็บที่ผู้ใช้เห็นได้ — ลาดกระบัง/สระบุรี+บางปะกงเห็นแค่สาขาตัวเอง (`visibleRecruitSites`) */
  sites: readonly RecruitSite[];
  counts: Record<RecruitSite, number>;
  onChange: (v: RecruitSite) => void;
}) {
  return (
    <div className="flex-none border-b border-line px-3">
      <SummaryTabs
        label="เลือกสาขา"
        value={value}
        onChange={onChange}
        tabs={RECRUIT_SITES.filter((s) => sites.includes(s.key)).map((s) => ({
          id: s.key,
          label: s.label,
          icon: MapPin,
          count: counts[s.key],
          countTitle: `ใบสมัครทั้งหมดของ${s.label}`,
        }))}
      />
    </div>
  );
}
