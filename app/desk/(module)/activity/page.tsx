import { ActivityView } from "@/components/desk/activity-view";

export const metadata = { title: "Log" };

/** ประวัติมาจาก NCAC API ทุกครั้งที่เปิดหน้า — ห้าม prerender ทิ้งไว้ */
export const dynamic = "force-dynamic";

export default function DeskActivityPage() {
  return <ActivityView />;
}
