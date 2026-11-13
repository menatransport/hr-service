import { DataError } from "@/components/ui/data-error";
import { EmptyState } from "@/components/ui/empty-state";
import { getDeskIdentity } from "@/lib/auth/session";
import { canAccessMenu, getMenuScopes, getOrgTree } from "@/lib/menu-permissions";

import { PermissionsView } from "./_components/permissions-view";

export const metadata = { title: "กำหนดสิทธิ์" };

/** กฎกับโครงสร้างองค์กรอ่านสดทุกครั้ง — แก้แล้วกดรีเฟรชต้องเห็นของใหม่ */
export const dynamic = "force-dynamic";

/**
 * กำหนดสิทธิ์การมองเห็นเมนู (`/desk/permissions`) — ค่าเริ่มต้น → ฝ่าย → แผนก (หน้าตาตาม mena-wms `/admin/users`)
 * ฝ่าย/แผนกมาจาก NCAC · สิทธิ์เก็บใน MongoDB `menu_permissions` (ดู `lib/menu-permissions.ts`)
 */
export default async function PermissionsPage() {
  const [identity, allowed] = await Promise.all([getDeskIdentity(), canAccessMenu("permissions")]);
  // ถูกซ่อนเมนูนี้ = เข้าหน้านี้ไม่ได้ (เซิร์ฟเวอร์ก็ปฏิเสธการบันทึกอยู่แล้ว)
  if (!allowed) return <EmptyState title="ไม่มีสิทธิ์เข้าหน้านี้" className="py-24" />;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (err) {
    const message = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
    return <DataError title="โหลดการตั้งค่าสิทธิ์ไม่สำเร็จ" message={message} envKey="API_NCAC_URL / MONGO_URI" />;
  }

  const myDepartment = identity.departmentId ? Number(identity.departmentId) : null;
  const myDivision =
    data.org.find((d) => d.departments.some((dep) => dep.id === myDepartment))?.id ?? null;

  return (
    <PermissionsView
      org={data.org}
      scopes={data.scopes}
      me={{ departmentId: myDepartment, divisionId: myDivision || null }}
    />
  );
}

async function load() {
  const [org, scopes] = await Promise.all([getOrgTree(), getMenuScopes()]);
  return { org, scopes };
}
