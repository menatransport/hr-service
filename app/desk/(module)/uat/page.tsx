import { countUatApplications } from "@/app/recruitment/_lib/applications";
import { DataError } from "@/components/ui/data-error";
import { listDepartments, listUsers } from "@/lib/ncac/client";
import { getUatBoard } from "@/lib/uat-store";

import { UatView, type UatPerson } from "./_components/uat-view";

export const metadata = { title: "จัดการ UAT" };

/** ผลทดสอบเปลี่ยนตลอด — อ่านสดทุกครั้ง */
export const dynamic = "force-dynamic";

/**
 * จัดการ UAT (`/desk/uat`) — ระบบชั่วคราวสำหรับทดสอบทะเบียนประวัติ พจส. ลาดกระบัง
 * ผู้ทดสอบรายฝ่าย + ผลทุกข้อ · รายการทดสอบอยู่ที่ `lib/uat.ts` · ข้อมูลอยู่ที่ `lib/uat-store.ts`
 */
export default async function UatPage() {
  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (err) {
    const message = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
    return <DataError title="โหลดข้อมูล UAT ไม่สำเร็จ" message={message} envKey="API_NCAC_URL / MONGO_URI" />;
  }
  return <UatView board={data.board} people={data.people} applicants={data.applicants} />;
}

async function load() {
  const [board, users, departments, applicants] = await Promise.all([
    getUatBoard(),
    listUsers(),
    listDepartments(),
    countUatApplications(),
  ]);
  const divisionOf = new Map(departments.map((d) => [d.department_id, d.division_id ?? null]));
  const people: UatPerson[] = users
    .filter((u) => (u.employee_status ?? "").toLowerCase() === "active" && u.employee_id)
    .map((u) => ({
      employeeId: u.employee_id,
      name: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.employee_id,
      position: u.position ?? "",
      department: u.department ?? "",
      divisionId: u.department_id != null ? (divisionOf.get(u.department_id) ?? null) : null,
      imageUrl: u.image_url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));

  return { board, people, applicants };
}
