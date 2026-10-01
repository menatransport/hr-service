import { IdentityProvider } from "@/components/auth/identity-provider";
import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { AdminNavList, AdminSidebar } from "@/app/recruitment/_components/admin/admin-nav";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ADMIN_ROOT } from "@/app/recruitment/_lib/admin-nav";
import type { DeskIdentity } from "@/lib/auth/identity";
import { getDeskIdentity } from "@/lib/auth/session";

/**
 * กรอบของศูนย์กลางสรรหา — แถบบน + แถบข้าง เหมือนโครงของ `/desk` แต่คนละเมนู
 *
 * **แยกจาก `/desk` โดยตั้งใจ** ตามที่หน้าผู้สมัครเดิมตั้งข้อสังเกตไว้: คนที่ทำงาน
 * สรรหาอยู่ทั้งวันไม่ได้ยุ่งกับคิวคำร้องของ พจส. การเอาสองเมนูมารวมกันจะทำให้ทั้งคู่
 * ยาวขึ้นโดยที่ไม่มีใครได้ประโยชน์
 *
 * `proxy.ts` ครอบ `/recruitment/admin/:path*` ไว้แล้ว ทุกหน้าใต้กรอบนี้จึงมี session
 * แน่นอน — `getDeskIdentity()` ที่นี่อ่านครั้งเดียวแล้วส่งลงไปทั้งฝั่ง server (topbar)
 * และฝั่ง client (`IdentityProvider`) ท่าเดียวกับ `app/desk/layout.tsx`
 */
/**
 * แถบบนของศูนย์กลางสรรหา
 *
 * ต่างจาก `DeskTopBar` ตรงที่**ไม่มีกระดิ่งแจ้งเตือน** — กระดิ่งนั้นอ่านคำร้องของ พจส.
 * จาก NCAC ซึ่งเป็นคนละสายงานกับการสรรหาโดยสิ้นเชิง เอามาแขวนที่นี่จะได้ตัวเลข
 * ที่คนใช้หน้านี้ไม่มีวันต้องสนใจ และยังทำให้ทุกหน้าต้องรอ API ของ NCAC ก่อนวาด topbar
 *
 * ปุ่ม “ดูหน้าสมัครงาน” พาไปหน้าที่ผู้สมัครเห็นจริง — ฝ่ายบุคคลที่เพิ่งแก้คำถามเสร็จ
 * ต้องการเช็คของจริงบ่อยกว่าที่คิด และมันคือทางออกจากหลังบ้านไปหน้าบ้านทางเดียวที่มี
 *
 * ลูกศรย้อนกลับซ้ายสุดพากลับ `/desk` — ศูนย์กลางสรรหาเข้ามาจากเมนู “ฝ่ายสรรหา” ของ
 * แถบข้างฝั่ง desk แต่พอเข้ามาแล้วเมนูนั้นหายไปทั้งแถบ ถ้าไม่มีปุ่มนี้ทางกลับทางเดียว
 * คือกดปุ่ม back ของเบราว์เซอร์ · เป็นลิงก์จริง (ไม่ใช่ `router.back()`) ปลายทางจึง
 * แน่นอนเสมอ ไม่ขึ้นกับว่าเปิดหน้านี้มาจากไหน
 */
function AdminTopBar({ identity }: { identity: DeskIdentity }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-line bg-base-100 px-4">
      <Link
        href="/desk"
        aria-label="กลับหน้าหลัก HR"
        title="กลับหน้าหลัก HR"
        className="group flex size-9 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
      >
        <ArrowLeft
          size={19}
          strokeWidth={1.7}
          aria-hidden
          className="transition-transform duration-300 group-hover:-translate-x-0.5"
        />
      </Link>

      {/* ต่ำกว่า lg แถบข้างยุบมาเป็นดรอปดาวน์ตัวนี้ */}
      <div className="dropdown lg:hidden">
        <button
          tabIndex={0}
          aria-label="เปิดเมนู"
          className="group flex size-9 items-center justify-center rounded-selector hover:bg-base-200"
        >
          <Menu
            size={20}
            strokeWidth={1.7}
            aria-hidden
            className="transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-6"
          />
        </button>
        <div className="dropdown-content z-40 mt-2 w-[260px] rounded-box border border-line bg-base-100 shadow-lg">
          <AdminNavList />
        </div>
      </div>

      <Link href={ADMIN_ROOT} className="group flex items-center gap-2.5">

        <span className="text-16-5 font-semibold whitespace-nowrap">
          Mass Recruitment
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/recruitment"
          className="mr-1 hidden rounded-field border border-line px-3 py-1.5 text-12-5 text-mut transition-colors hover:border-primary/40 hover:text-ink sm:inline-block"
        >
          ดูหน้าสมัครงาน
        </Link>

        <ThemeToggle />
        <LogoutButton />

        <div className="ml-1.5 flex items-center gap-2.5 border-l border-line pl-3">
          <div className="hidden flex-col text-right md:flex">
            <span className="text-13 leading-tight font-medium">
              {identity.name}
            </span>
            <span className="text-11 leading-tight text-mut">{identity.role}</span>
          </div>
          <Avatar name={identity.name} src={identity.imageUrl} size="nav" />
        </div>
      </div>
    </header>
  );
}

export default async function RecruitmentAdminLayout({
  children,
}: LayoutProps<"/recruitment/admin">) {
  const identity = await getDeskIdentity();

  return (
    <IdentityProvider identity={identity}>
      <div className="page-canvas flex min-h-dvh flex-col">
        <AdminTopBar identity={identity} />
        <div className="flex min-h-0 flex-1">
          <AdminSidebar />
          {/*
            ห้ามใส่ transform/animation ที่ <main> — จะกลายเป็น containing block
            ของ `position: fixed` ทำให้ modal ในหน้าผู้สมัครหลุดตำแหน่ง
            (บทเรียนเดียวกับ `app/desk/layout.tsx`)
          */}
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </IdentityProvider>
  );
}
