import { AppShell } from "@/components/shell/app-shell";
import { getDeskIdentity } from "@/lib/auth/session";
import { getHiddenMenuIds } from "@/lib/menu-permissions";

import { ManualNav } from "./_components/manual-nav";

/**
 * คู่มือการใช้งาน (`/desk/manual`) — เชลล์เดียวกับหน้าใน แต่แถบข้างเป็นสารบัญคู่มือ
 * (หน้านี้ไม่อยู่ในกลุ่มงานใด `AppShell` จึงใช้ `fallback`) · เข้าจากปุ่ม “คู่มือ” บนหน้า Home
 */
export default async function ManualLayout({ children }: LayoutProps<"/desk/manual">) {
  const [identity, hidden] = await Promise.all([getDeskIdentity(), getHiddenMenuIds()]);

  return (
    <AppShell
      user={{
        name: identity.name,
        role: identity.role,
        department: identity.department,
        employeeId: identity.employeeId,
        imageUrl: identity.imageUrl,
      }}
      systemLabel="คู่มือการใช้งาน"
      fallback={<ManualNav hidden={hidden} />}
    >
      {children}
    </AppShell>
  );
}
