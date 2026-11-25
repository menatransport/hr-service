import type { Metadata } from "next";

import { canAccessMenu, canAccessMenuStrict } from "@/lib/menu-permissions";
import { DashboardView } from "@/app/recruitment/_components/admin/dashboard/dashboard-view";
import { getManpowerDaily } from "@/app/recruitment/_lib/dashboard/manpower-daily";
import { getTurnoverBoard } from "@/app/recruitment/_lib/dashboard/turnover";
import { EXIT_INTERVIEW_MENU } from "@/app/recruitment/_lib/exit-interview/types";

/** แดชบอร์ด พนักงานจัดส่ง — หน้ากราฟ (`dashboard-view.tsx`) · ข้อมูลของแต่ละหมวดโหลดที่นี่ */

export const metadata: Metadata = { title: "แดชบอร์ด" };
/* ตัวเลขสดทุกครั้งที่เปิด + บันทึกยอดรายวัน (`getManpowerDaily`) — ห้าม cache */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  /* TurnOver: คำตอบสัมภาษณ์อ่านเฉพาะผู้มีสิทธิ์ `exit-interview` (fail-closed) */
  const [manpower, canEditTargets, turnover] = await Promise.all([
    getManpowerDaily(),
    canAccessMenu("dashboard-targets"),
    canAccessMenuStrict(EXIT_INTERVIEW_MENU).then(getTurnoverBoard),
  ]);
  return <DashboardView manpower={manpower} canEditTargets={canEditTargets} turnover={turnover} />;
}
