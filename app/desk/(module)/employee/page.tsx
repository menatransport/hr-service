import { EmployeeDirectoryView } from "@/components/desk/employee-directory-view";

export const metadata = { title: "ค้นหาข้อมูลพนักงาน" };

/** สมุดรายชื่อมาจาก NCAC API ทุกครั้งที่เปิดหน้า — ห้าม prerender ทิ้งไว้ */
export const dynamic = "force-dynamic";

export default function DeskEmployeePage() {
  return <EmployeeDirectoryView />;
}
