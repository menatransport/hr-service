import type { Metadata } from "next";

import { DataError } from "@/components/ui/data-error";
import { DashboardView } from "@/app/recruitment/_components/admin/dashboard/dashboard-view";
import { getManpowerBoard, type ManpowerBoard } from "@/app/recruitment/_lib/dashboard/manpower";

/**
 * แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ (`dashboard-view.tsx`) · ข้อมูลของทุกหมวดโหลดที่นี่
 * · `force-dynamic` เพราะขั้นฝึกงานคิดจาก “วันนี้”
 */

export const metadata: Metadata = { title: "แดชบอร์ด" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let manpower: ManpowerBoard | null = null;
  let error: string | null = null;

  try {
    manpower = await getManpowerBoard();
  } catch (err) {
    error = err instanceof Error ? err.message : "เชื่อมต่อฐานข้อมูลไม่สำเร็จ";
  }

  if (!manpower)
    return (
      <div className="mx-auto max-w-xl py-6">
        <DataError title="โหลดแดชบอร์ดไม่สำเร็จ" envKey="MONGO_URI" message={error ?? ""} />
      </div>
    );

  return <DashboardView manpower={manpower} />;
}
