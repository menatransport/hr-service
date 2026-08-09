import { notFound } from "next/navigation";

import { EmployeeProfile } from "@/components/desk/employee-profile";
import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import {
  employeeErrorMessage,
  getEmployee,
  getTeammates,
} from "@/lib/employees";

/**
 * ข้อมูลพนักงานรายคน — `id` คือ **รหัสพนักงาน** ตรง ๆ (`/desk/employee/10234`)
 *
 * สมุดรายชื่อมาจาก NCAC API จึงเป็นหน้า dynamic ไม่มี `generateStaticParams`
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/desk/employee/[id]">) {
  const { id } = await props.params;
  try {
    const employee = await getEmployee(id);
    return { title: employee ? employee.name : "ไม่พบพนักงาน" };
  } catch {
    // API ล่ม — หน้ายังขึ้น `DataError` ได้ ชื่อแท็บจึงไม่ควรพาลพังไปด้วย
    return { title: "ข้อมูลพนักงาน" };
  }
}

export default async function DeskEmployeeDetailPage(
  props: PageProps<"/desk/employee/[id]">,
) {
  const { id } = await props.params;

  let employee;
  try {
    employee = await getEmployee(id);
  } catch (err) {
    return (
      <div className="flex flex-col gap-5 animate-rise">
        <PageHead title="ข้อมูลพนักงาน" />
        <DataError
          title="โหลดข้อมูลพนักงานไม่สำเร็จ"
          message={employeeErrorMessage(err)}
        />
      </div>
    );
  }

  // ยิงผ่านแล้วแต่ไม่มีรหัสนี้ในสมุดรายชื่อ = 404 จริง ไม่ใช่ความผิดพลาดของ API
  if (!employee) notFound();

  const teammates = await getTeammates(employee);

  return <EmployeeProfile employee={employee} teammates={teammates} />;
}
