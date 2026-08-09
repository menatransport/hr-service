import { CaseListView } from "@/components/desk/case-list-view";

export const metadata = { title: "ข้อร้องเรียน" };

/** คิวเคสมาจาก NCAC API ทุกครั้งที่เปิดหน้า — ห้าม prerender ทิ้งไว้ */
export const dynamic = "force-dynamic";

export default function DeskCasesPage() {
  return <CaseListView />;
}
