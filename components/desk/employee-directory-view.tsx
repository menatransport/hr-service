import { EmployeeDirectory } from "@/components/desk/employee-directory";
import { PageHead } from "@/components/desk/page-head";
import { DataError } from "@/components/ui/data-error";
import { employeeErrorMessage, getEmployees } from "@/lib/employees";

/**
 * หน้าค้นหาข้อมูลพนักงาน — ดึงสมุดรายชื่อทั้งบริษัทจาก `GET /users` ครั้งเดียว
 * แล้วส่งลงไปให้ตัวกรองฝั่ง client ทำงานต่อ (ดู `EmployeeDirectory`)
 *
 * `getEmployees()` ตัดคนที่ **พ้นสภาพแล้วออกไปก่อน** — ทุกตัวเลขในหน้านี้จึงเป็น
 * จำนวนพนักงานที่ยังปฏิบัติงานอยู่เท่านั้น
 *
 * รายชื่อนี้คือ **พนักงานออฟฟิศ** เท่านั้น — พจส. ไม่ได้อยู่ใน `/users`
 * ดู `RegistryView` สำหรับทะเบียนประวัติ พจส. ซึ่งยังไม่มี endpoint
 */
export async function EmployeeDirectoryView() {
  let employees;
  try {
    employees = await getEmployees();
  } catch (err) {
    return (
      <div className="flex flex-col gap-6 animate-rise">
        <PageHead title="ค้นหาข้อมูลพนักงาน" subtitle="สมุดรายชื่อพนักงานทั้งบริษัท" />
        <DataError
          title="โหลดสมุดรายชื่อพนักงานไม่สำเร็จ"
          message={employeeErrorMessage(err)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-rise">
      <PageHead
        title="ค้นหาข้อมูลพนักงาน"
        subtitle="พิมพ์ชื่อ รหัสพนักงาน หรือตำแหน่งเพื่อค้นหา แล้วคลิกที่บัตรเพื่อดูข้อมูลเต็ม"
      />
      <EmployeeDirectory employees={employees} />
    </div>
  );
}
