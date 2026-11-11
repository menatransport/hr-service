import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import { CandidatesScreen } from "@/app/recruitment/_components/admin/recruitment-screens";
import { getHub, type Hub } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { listBlacklist, listContactOwners } from "@/app/recruitment/_lib/applications";
import { listDocSlots } from "@/app/recruitment/_lib/doc-slots";
import type { DocSlot } from "@/app/recruitment/_lib/form";
import type { BlacklistEntry } from "@/app/recruitment/_lib/types";
import { pickRecruitSite, visibleRecruitSites } from "@/app/recruitment/_lib/sites";
import { readSessionUser } from "@/lib/auth/session";
import { canAccessMenu } from "@/lib/menu-permissions";

/**
 * ผู้สมัคร — แยกออกจากหน้าขอสรรหามาเป็นหน้าของตัวเองอีกครั้ง (14 ต.ค. 2026)
 *
 * `?ref=` คือเลขที่ใบสมัครที่คิวงานหรือตารางคำขอส่งมา เพื่อเปิดตรงแถวนั้นเลย ·
 * คำขอสรรหายังต้องโหลดมาด้วย เพราะกล่องทำเอกสารผูก/ปลด RQ ได้จากหน้านี้
 * · โหลดผ่าน `getHub()` ตัวเดียวกับหน้าติดตามพนักงานใหม่ — การ์ดรอสรรหา/รับรถแล้ว (`?view=open|working`)
 *   จึงเป็นแถวชุดเดียวกับแท็บอัตราว่าง/รับรถแล้วของหน้านั้น (3 พ.ย. 2569) · `?view=handover` (การ์ดรอรับรถเดิม)
 *   = มุมมองฝึกงานที่รวมรอรับรถไว้ตารางเดียวกันแล้ว (9 พ.ย. 2569)
 */

export const metadata: Metadata = {
  title: "ผู้สมัคร",
};

export const dynamic = "force-dynamic";

export default async function CandidatesPage({
  searchParams,
}: PageProps<"/recruitment/admin/candidates">) {
  const params = await searchParams;
  const ref = typeof params.ref === "string" ? params.ref : "";
  const view = params.view === "open" || params.view === "working" ? params.view : null;
  /* แท็บสาขา: เห็นเฉพาะสาขาของตัวเอง (สิทธิ์ “ดูทุกสาขา” / site อื่นเห็นทั้งหมด) · `?site=` ชนะถ้าเห็นได้ · ไม่งั้นสาขาของตัวเอง */
  const [user, allSites] = await Promise.all([readSessionUser(), canAccessMenu("recruit-all-sites")]);
  const sites = visibleRecruitSites(user, allSites);
  const site = pickRecruitSite(user, allSites, typeof params.site === "string" ? params.site : null);

  let hub: Hub | null = null;
  let contactOptions: string[] = [];
  let docSlots: DocSlot[] = [];
  let blacklist: BlacklistEntry[] = [];
  let error: string | null = null;

  try {
    [hub, contactOptions, docSlots, blacklist] = await Promise.all([
      getHub(),
      listContactOwners(),
      listDocSlots(),
      listBlacklist(),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="animate-rise">
      {hub ? (
        <CandidatesScreen
          hub={hub}
          initialView={view}
          initialTraining={params.view === "handover"}
          contactOptions={contactOptions}
          docSlots={docSlots}
          blacklist={blacklist}
          initialRef={ref}
          initialRc={params.rc === "1"}
          initialSite={site}
          sites={sites}
        />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError
            title="โหลดข้อมูลผู้สมัครไม่สำเร็จ"
            envKey="MONGO_URI"
            message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"}
          />
        </div>
      )}
    </div>
  );
}
