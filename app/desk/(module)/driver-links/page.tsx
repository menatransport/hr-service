import { DriverLinksView } from "./driver-links-view";

export const metadata = { title: "จับคู่คนขับรถร่วม" };

/** ข้อมูลสองฝั่งอ่านสดทุกครั้งผ่าน `/api/driver-links` — ห้าม prerender */
export const dynamic = "force-dynamic";

export default function DeskDriverLinksPage() {
  return <DriverLinksView />;
}
