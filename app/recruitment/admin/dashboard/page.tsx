import type { Metadata } from "next";

import { DashboardView } from "@/app/recruitment/_components/admin/dashboard/dashboard-view";

/** แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ (`dashboard-view.tsx`) · ข้อมูลของแต่ละหมวดโหลดที่นี่ */

export const metadata: Metadata = { title: "แดชบอร์ด" };

export default function DashboardPage() {
  return <DashboardView />;
}
