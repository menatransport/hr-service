import type { Metadata } from "next";

import { canAccessMenu } from "@/lib/menu-permissions";
import { DashboardView } from "@/app/recruitment/_components/admin/dashboard/dashboard-view";
import { getManpowerDaily } from "@/app/recruitment/_lib/dashboard/manpower-daily";

/** แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ (`dashboard-view.tsx`) · ข้อมูลของแต่ละหมวดโหลดที่นี่ */

export const metadata: Metadata = { title: "แดชบอร์ด" };
/* ตัวเลขสดทุกครั้งที่เปิด + บันทึกยอดรายวัน (`getManpowerDaily`) — ห้าม cache */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [manpower, canEditTargets] = await Promise.all([getManpowerDaily(), canAccessMenu("dashboard-targets")]);
  return <DashboardView manpower={manpower} canEditTargets={canEditTargets} />;
}
