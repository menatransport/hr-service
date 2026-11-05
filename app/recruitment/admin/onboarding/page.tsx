import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import { getHub, type Hub } from "@/app/recruitment/_lib/requisitions/onboarding-store";
import { OnboardingView } from "@/app/recruitment/_components/admin/onboarding-view";
import { TABS, type Tab } from "@/app/recruitment/_lib/requisitions/onboarding";

/**
 * ติดตามพนักงานใหม่ — หน้าเดียวของ ขออัตรา → ฝึกงาน → รับรถ (`?tab=` = ขั้นที่เปิด)
 * · คำขอ/ATMS/บอร์ดซ่อม ยิงพร้อมกัน · อ่านไม่ได้ = `DataError`
 * · ตัวเลือกของฟอร์มขออัตรา (ทะเบียน พจส./รถ/ผู้สมัคร ~360 KB) โหลดตอนกด “ขออัตรา” ครั้งแรก ไม่ลากมาทุกครั้งที่เปิดหน้า
 */
export const metadata: Metadata = { title: "ติดตามพนักงานใหม่" };
export const dynamic = "force-dynamic";

/** ส่งเฉพาะใบที่ผูกคำขอ — คอลัมน์แท็บรอฝึกงานอ่านจากนี่ ไม่ต้องลากใบทั้งหมดลงจอ */
function linkedApplications(hub: Hub) {
  const ids = new Set(hub.records.map((r) => r.match?.applicationId).filter(Boolean));
  return hub.applications.filter((a) => ids.has(a.id));
}

export default async function OnboardingPage({ searchParams }: PageProps<"/recruitment/admin/onboarding">) {
  const { tab, open } = await searchParams;
  const stage = (TABS as readonly string[]).includes(String(tab)) ? (tab as Tab) : "training";

  let hub: Hub | null = null;
  let error: string | null = null;
  try {
    hub = await getHub();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  return (
    <div className="animate-rise">
      {hub ? (
        <OnboardingView
          records={hub.records}
          repairs={hub.repairs}
          applications={linkedApplications(hub)}
          initialStage={stage}
          initialOpen={typeof open === "string" ? open : ""}
        />
      ) : (
        <div className="mx-auto max-w-xl py-6">
          <DataError title="โหลดข้อมูลพนักงานใหม่ไม่สำเร็จ" envKey="MONGO_URI" message={error ?? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ"} />
        </div>
      )}
    </div>
  );
}
