import { IdentityProvider } from "@/components/auth/identity-provider";
import { PayrollSidebar } from "@/components/payroll/payroll-nav";
import { PayrollTopBar } from "@/components/payroll/payroll-topbar";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * กรอบของโมดูลค่าจ้างและสวัสดิการ — แถบบน + แถบข้าง คนละเมนูกับ `/desk`
 *
 * **แยกจาก `/desk` โดยตั้งใจ** ด้วยเหตุผลเดียวกับศูนย์กลางสรรหา: คนที่ทำเงินเดือน
 * อยู่ทั้งสัปดาห์ไม่ได้ยุ่งกับคิวคำร้องของ พจส. เอาสองเมนูมารวมกันจะยาวขึ้นทั้งคู่
 * โดยไม่มีใครได้ประโยชน์ · เข้าจากเมนู “ฝ่ายค่าจ้างและสวัสดิการ” ในแถบข้างของ `/desk`
 *
 * `proxy.ts` ต้องครอบ `/payroll/:path*` ไว้ (เพิ่มแล้วใน matcher) — หน้านี้เห็นเงินเดือน
 * ของพนักงานทุกคน เป็นข้อมูลที่อ่อนไหวที่สุดในระบบ ห้ามมีหน้าไหนใต้กรอบนี้เปิดสาธารณะ
 */
export default async function PayrollLayout({
  children,
}: LayoutProps<"/payroll">) {
  const identity = await getDeskIdentity();

  return (
    <IdentityProvider identity={identity}>
      <div className="page-canvas flex min-h-dvh flex-col">
        <PayrollTopBar identity={identity} />
        <div className="flex min-h-0 flex-1">
          <PayrollSidebar />
          {/*
            ห้ามใส่ transform/animation ที่ <main> — จะกลายเป็น containing block
            ของ `position: fixed` ทำให้กล่องแจ้งเตือนหลุดตำแหน่ง
            (บทเรียนเดียวกับ `app/desk/layout.tsx`)
          */}
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </IdentityProvider>
  );
}
