import Link from "next/link";
import { Headset, Menu, Smartphone } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NotificationBell } from "@/components/desk/notification-bell";
import { DeskNavList } from "@/components/desk/sidebar";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { DeskIdentity } from "@/lib/auth/identity";
import { getCases } from "@/lib/cases";
import { buildNotifications } from "@/lib/notifications";

export async function DeskTopBar({ identity }: { identity: DeskIdentity }) {
  // แจ้งเตือนคำนวณจากเคสจริง — API ล่มก็ยังต้องเห็น topbar ได้
  const cases = await getCases().catch(() => []);
  // “รอคุณอนุมัติ” หมายถึงคนที่ล็อกอินอยู่จริง ไม่ใช่บัญชีตายตัวอีกต่อไป
  const notifications = buildNotifications(cases, identity.employeeId);

  return (
    <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-line bg-base-100 px-4">
      {/* below lg the sidebar collapses into this dropdown */}
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
          <DeskNavList />
        </div>
      </div>

      <Link href="/desk" className="group flex items-center gap-2.5">
        <span className="flex size-8 flex-none items-center justify-center rounded-[9px] bg-primary text-primary-content transition-transform duration-300 group-hover:scale-105">
          <Headset
            size={17}
            strokeWidth={1.7}
            aria-hidden
            className="transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-8"
          />
        </span>
        <span className="text-[14.5px] font-semibold whitespace-nowrap">
          HR Service 
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/m"
          title="มุมมองพนักงาน (มือถือ)"
          className="group flex size-9 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
        >
          <Smartphone
            size={18}
            strokeWidth={1.6}
            aria-hidden
            className="transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-8"
          />
          <span className="sr-only">มุมมองพนักงาน</span>
        </Link>

        <ThemeToggle />
        {/* ทางเข้า `/desk/activity` (ประวัติการทำงาน) อยู่ท้ายดรอปดาวน์ของกระดิ่งนี้ */}
        <NotificationBell items={notifications} />

        <LogoutButton />

        <div className="ml-1.5 flex items-center gap-2.5 border-l border-line pl-3">
          <div className="hidden flex-col text-right md:flex">
            <span className="text-[13px] leading-tight font-medium">
              {identity.name}
            </span>
            <span className="text-[11px] leading-tight text-mut">
              {identity.role}
            </span>
          </div>
          {/* รูปจาก `image_url` ของบัญชี NCAC — ส่วนใหญ่คือรูป Google จากตอนล็อกอิน */}
          <Avatar name={identity.name} src={identity.imageUrl} size="nav" />
        </div>
      </div>
    </header>
  );
}
