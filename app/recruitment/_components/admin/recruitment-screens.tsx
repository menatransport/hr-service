"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CandidatesView, type HubView } from "@/app/recruitment/_components/admin/candidates-view";
import { RequisitionsView } from "@/app/recruitment/_components/admin/requisitions-view";
import { SiteNav } from "@/app/recruitment/_components/admin/site-nav";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import type { RequisitionOptions } from "@/app/recruitment/_lib/requisitions/options";
import type { Requisition } from "@/app/recruitment/_lib/requisitions/types";
import type { Hub } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { ApplicationSummary, BlacklistEntry } from "@/app/recruitment/_lib/types";
import { recruitSiteOf, type RecruitSite } from "@/app/recruitment/_lib/sites";

/**
 * ขอสรรหา กับ ผู้สมัคร — **สองหน้าแยกกัน** (14 ต.ค. 2026) เป็นเมนูย่อยใต้ “พนักงานใหม่”
 *
 * เดิมเป็นหน้าเดียวสองแท็บ (`?tab=`) ตั้งแต่ 22 ก.ย. 2026 — ตอนนี้แต่ละหน้าถือ state
 * ของตัวเอง · สะพานระหว่างสองหน้าคงไว้: กดชื่อผู้สมัครในตารางคำขอแล้วไปหน้าผู้สมัคร
 * พร้อม `?ref=` · ฝั่งผู้สมัครยังผูก/ปลด RQ ได้เอง จึงต้องได้รายการคำขอไปด้วย
 */

export function RequisitionsScreen({
  initialRequisitions,
  options,
}: {
  initialRequisitions: Requisition[];
  options: RequisitionOptions;
}) {
  const router = useRouter();
  const [requisitions, setRequisitions] = useState(initialRequisitions);

  return (
    <RequisitionsView
      title="ขออัตราสรรหาพนักงาน"
      tabs={null}
      rows={requisitions}
      setRows={setRequisitions}
      options={options}
      onOpenCandidate={(ref) =>
        router.push(`${ADMIN_ROOT}/candidates?${new URLSearchParams({ ref })}`)
      }
    />
  );
}

export function CandidatesScreen({
  hub,
  initialView = null,
  initialTraining = false,
  contactOptions,
  docSlots,
  blacklist,
  initialRef = "",
  initialRc = false,
  initialSite,
  sites,
}: {
  /** คำขอ + ใบสมัคร + ATMS ชุดเดียวกับหน้าติดตามพนักงานใหม่ (`getHub()`) */
  hub: Hub;
  /** `?view=` — เปิดมาที่การ์ดรอสรรหา/รับรถแล้ว */
  initialView?: HubView | null;
  /** `?view=handover` — มุมมองฝึกงาน + รอรับรถ */
  initialTraining?: boolean;
  contactOptions: string[];
  /** ช่องเอกสารพร้อมค่าแสดง/บังคับจาก Section 4 ของคลังคำถาม */
  docSlots: DocSlot[];
  /** ทุกใบที่ติด Blacklist — ตารางผู้สมัครใช้จับชื่อ/เบอร์ของใบที่รอการติดต่อ */
  blacklist: BlacklistEntry[];
  /** เลขที่ใบสมัครจาก `?ref=` — คิวงานหรือตารางคำขอส่งมาเพื่อเปิดตรงที่แถวนั้นเลย */
  initialRef?: string;
  /** `?rc=1` — เปิดกล่องข้อมูล RC ของใบ `initialRef` ทันที */
  initialRc?: boolean;
  /** แท็บสาขาตั้งต้น — `?site=` หรือ site ของผู้ใช้ที่ล็อกอิน */
  initialSite: RecruitSite;
  /** แท็บที่ผู้ใช้เห็นได้ (`visibleRecruitSites`) */
  sites: RecruitSite[];
}) {
  /* แถวผู้สมัครที่ยกเลิก (`applicant`) ไม่ใช่คำขอ — เหลือแต่คำขอจริงให้กล่อง RC/ทำเอกสาร */
  const [requisitions, setRequisitions] = useState<Requisition[]>(() => hub.records.filter((r) => !r.applicant));
  const [applications, setApplications] = useState(hub.applications);

  /**
   * สาขาของใบสมัคร — ผูก RQ แล้ว = สาขาของ RQ · ยังไม่ผูก = `site` ที่ย้ายไว้ (ดู `sites.ts`)
   * · ใบยกเลิกที่เคยผูก RQ ไว้ = สาขาของคำขอเดิม (แถว `applicant` ของ `getHub()`)
   */
  const siteOfApp = useMemo(() => {
    const byApp = new Map<string, RecruitSite>();
    for (const r of hub.records) if (r.applicant && r.branch) byApp.set(r.applicant.applicationId, recruitSiteOf(r.branch));
    for (const r of requisitions) if (r.match) byApp.set(r.match.applicationId, recruitSiteOf(r.branch));
    return (a: ApplicationSummary) => byApp.get(a.id) ?? a.site;
  }, [hub.records, requisitions]);

  /* `?ref=` ของใบในอีกสาขา = เปิดแท็บของใบนั้น ไม่ใช่ตารางว่าง */
  const [site, setSite] = useState<RecruitSite>(() => {
    const ref = initialRef.trim().toUpperCase();
    const hit = ref ? hub.applications.find((a) => a.ref.toUpperCase() === ref) : undefined;
    const hitSite = hit ? siteOfApp(hit) : null;
    return hitSite && sites.includes(hitSite) ? hitSite : initialSite;
  });

  function pickSite(next: RecruitSite) {
    setSite(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("site", next);
      window.history.replaceState(null, "", url);
    } catch {}
  }

  const counts = useMemo(() => {
    const n: Record<RecruitSite, number> = { latkrabang: 0, "saraburi-bangpakong": 0 };
    for (const a of applications) n[siteOfApp(a)] += 1;
    return n;
  }, [applications, siteOfApp]);

  /* ทั้งหน้าเห็นเฉพาะสาขาที่เลือก — ตาราง การ์ดสรุป รอสรรหา/รับรถแล้ว และ RQ ที่ผูกได้ในกล่อง RC
     · ตัวแก้ (`setApplications` / `setRequisitions`) ยังเป็นของชุดเต็ม แก้แถวไหนก็ไม่หลุดจากอีกสาขา */
  const siteApplications = useMemo(
    () => applications.filter((a) => siteOfApp(a) === site),
    [applications, siteOfApp, site],
  );
  const siteRequisitions = useMemo(
    () => requisitions.filter((r) => recruitSiteOf(r.branch) === site),
    [requisitions, site],
  );
  const siteHub = useMemo<Hub>(() => {
    const appSite = new Map(applications.map((a) => [a.id, siteOfApp(a)]));
    return {
      ...hub,
      records: hub.records.filter((r) =>
        r.applicant ? (appSite.get(r.applicant.applicationId) ?? recruitSiteOf(r.branch)) === site : recruitSiteOf(r.branch) === site,
      ),
      applications: siteApplications,
    };
  }, [hub, applications, siteOfApp, siteApplications, site]);

  return (
    <CandidatesView
      siteNav={<SiteNav value={site} sites={sites} counts={counts} onChange={pickSite} />}
      site={site}
      hub={siteHub}
      initialView={initialView}
      initialTraining={initialTraining}
      title="ผู้สมัคร"
      rows={siteApplications}
      setRows={setApplications}
      initialTerm={initialRef}
      initialRc={initialRc}
      contactOptions={contactOptions}
      docSlots={docSlots}
      blacklist={blacklist}
      requisitions={siteRequisitions}
      setRequisitions={setRequisitions}
    />
  );
}
