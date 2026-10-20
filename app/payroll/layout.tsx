import { IdentityProvider } from "@/components/auth/identity-provider";
import { PayrollNavList } from "@/components/payroll/payroll-nav";
import { AppShell } from "@/components/shell/app-shell";
import { getDeskIdentity } from "@/lib/auth/session";
import { SOON } from "@/lib/modules";
import { notFound } from "next/navigation";

/**
 * กรอบของโมดูลค่าจ้างและสวัสดิการ — `AppShell` ชุดเดียวกับ `/desk` (สไตล์ menaIT V.2 โทน teal)
 *
 * ทั้ง `/payroll` คือเมนู “ค่าจ้างและสวัสดิการ” ของกลุ่ม HR MASTER — เมนูของระบบค่าจ้างเอง
 * (ภาพรวมรอบจ่าย · รับข้อมูล) เป็น subgroup ใต้ ค่าจ้างและสวัสดิการ ในแถบข้าง (`children` ใน `lib/modules.ts`)
 * กางเองเมื่ออยู่ในหน้าเหล่านี้ จึงไม่ต้องมีหัวข้อพับ “เมนูทั้งหมดของระบบค่าจ้าง” ซ้ำอีก
 * · หน้าใหม่ใต้ `/payroll` ที่ยังไม่ลงทะเบียนนับเป็น “ภาพรวมรอบจ่าย” (จับด้วย path ขึ้นต้น) ไม่ตกไป `fallback`
 *
 * ไม่มีกระดิ่งแจ้งเตือน — กระดิ่งอ่านคำร้องของ พจส. จาก NCAC ซึ่งคนทำเงินเดือนไม่ได้ยุ่งด้วย
 *
 * `proxy.ts` ต้องครอบ `/payroll/:path*` ไว้ (เพิ่มแล้วใน matcher) — หน้านี้เห็นเงินเดือน
 * ของพนักงานทุกคน เป็นข้อมูลที่อ่อนไหวที่สุดในระบบ ห้ามมีหน้าไหนใต้กรอบนี้เปิดสาธารณะ
 */
export default async function PayrollLayout({ children }: LayoutProps<"/payroll">) {
  // เมนูนี้ยัง “เร็ว ๆ นี้” — เปิดเฉพาะตอน dev (ดู `SOON` ใน lib/modules.ts)
  if (SOON) notFound();

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
        fallback={<PayrollNavList />}
      >
        {children}
      </AppShell>
    </IdentityProvider>
  );
}
