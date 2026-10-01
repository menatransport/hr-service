import Link from "next/link";
import { ArrowLeft, Menu } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { PayrollNavList } from "@/components/payroll/payroll-nav";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PAYROLL_ROOT } from "@/lib/payroll/nav";
import type { DeskIdentity } from "@/lib/auth/identity";

/**
 * แถบบนของโมดูลค่าจ้างและสวัสดิการ
 *
 * ไม่มีกระดิ่งแจ้งเตือนด้วยเหตุผลเดียวกับ `AdminTopBar` — กระดิ่งอ่านคำร้องของ พจส.
 * จาก NCAC ซึ่งคนที่ทำเงินเดือนอยู่ไม่ได้ยุ่งด้วย
 *
 * ลูกศรซ้ายสุดพากลับ `/desk` เป็นลิงก์จริง ไม่ใช่ `router.back()` ปลายทางจึงแน่นอน
 * ไม่ว่าจะเข้ามาจากไหน
 */
export function PayrollTopBar({ identity }: { identity: DeskIdentity }) {
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
          <PayrollNavList />
        </div>
      </div>

      <Link href={PAYROLL_ROOT} className="flex items-center gap-2.5">
        <span className="text-16-5 font-semibold whitespace-nowrap">
          ค่าจ้างและสวัสดิการ
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
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
