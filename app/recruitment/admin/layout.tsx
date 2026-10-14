import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { AdminNavList } from "@/app/recruitment/_components/admin/admin-nav";
import { IdentityProvider } from "@/components/auth/identity-provider";
import { AppShell } from "@/components/shell/app-shell";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * กรอบของศูนย์กลางสรรหา — `AppShell` ชุดเดียวกับ `/desk` (สไตล์ menaIT V.2 โทน teal)
 *
 * หน้าที่อยู่ในกลุ่มงานของ Home (ผู้สมัคร · ฝึกงาน · เอกสาร · ขอสรรหา · ตั้งค่า…) ใช้แถบข้าง
 * ของกลุ่มนั้น · หน้าที่เหลือ (ภาพรวม · พนักงานขับรถ) ใช้เมนูเดิมของศูนย์สรรหา ซึ่งยังเปิดดูได้
 * จากหัวข้อพับ “เมนูทั้งหมดของศูนย์กลางสรรหา” ในแถบข้างเสมอ
 *
 * **ไม่มีกระดิ่งแจ้งเตือนโดยตั้งใจ** — กระดิ่งอ่านคำร้องของ พจส. จาก NCAC ซึ่งเป็นคนละสายงาน
 * เอามาแขวนที่นี่จะได้ตัวเลขที่คนใช้หน้านี้ไม่ต้องสนใจ และทุกหน้าต้องรอ NCAC ก่อนวาดแถบบน
 *
 * ปุ่ม “ดูหน้าสมัครงาน” พาไปหน้าที่ผู้สมัครเห็นจริง — ฝ่ายบุคคลที่เพิ่งแก้คำถามเสร็จต้องการ
 * เช็คของจริงบ่อยกว่าที่คิด
 *
 * `proxy.ts` ครอบ `/recruitment/admin/:path*` ไว้แล้ว ทุกหน้าใต้กรอบนี้จึงมี session แน่นอน
 */
export default async function RecruitmentAdminLayout({
  children,
}: LayoutProps<"/recruitment/admin">) {
  const identity = await getDeskIdentity();

  return (
    <IdentityProvider identity={identity}>
      <AppShell
        user={{
          name: identity.name,
          role: identity.role,
          department: identity.department,
          employeeId: identity.employeeId,
          imageUrl: identity.imageUrl,
        }}
        systemLabel="ศูนย์กลางสรรหา"
        fallback={<AdminNavList />}
        actions={
          <Link
            href="/recruitment"
            className="glass-btn hidden h-10 flex-none items-center gap-1.5 rounded-xl px-3.5 text-12-5 font-medium md:flex"
          >
            <ExternalLink size={15} strokeWidth={1.8} aria-hidden />
            ดูหน้าสมัครงาน
          </Link>
        }
      >
        {children}
      </AppShell>
    </IdentityProvider>
  );
}
