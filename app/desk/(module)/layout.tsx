import { DeskNavList } from "@/components/desk/sidebar";
import { AppShell } from "@/components/shell/app-shell";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * เชลล์ของหน้าในทุกหน้าใต้ `/desk` (ยกเว้น Home) — `AppShell` สไตล์ menaIT V.2
 * แถบข้างแสดง menulist ของกลุ่มงานที่หน้านี้สังกัด (เมนูบน Home บินมาเป็นแถวในแถบนี้)
 *
 * `getDeskIdentity()` แค่อ่านคุกกี้ session — เรียกซ้ำกับ layout ชั้นนอกได้โดยไม่ต้องห่วงต้นทุน
 */
export default async function DeskModuleLayout({ children }: { children: React.ReactNode }) {
  const identity = await getDeskIdentity();

  return (
    <AppShell
      user={{
        name: identity.name,
        role: identity.role,
        department: identity.department,
        employeeId: identity.employeeId,
        imageUrl: identity.imageUrl,
      }}
      fallback={<DeskNavList />}
    >
      {children}
    </AppShell>
  );
}
