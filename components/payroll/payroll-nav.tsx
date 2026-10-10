"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PAYROLL_ROOT, payrollNav, type PayrollNavItem } from "@/lib/payroll/nav";

/**
 * แถบเมนูของโมดูลค่าจ้างและสวัสดิการ
 *
 * โครงเดียวกับ `components/recruitment/admin/admin-nav.tsx` — ตื้นระดับเดียว ไม่มีเมนูพับ
 * เมนูที่ยังไม่มีหน้าจริงเรนเดอร์เป็น `<span>` ไม่ใช่ `<a>` เพราะลิงก์ที่กดแล้วได้ 404
 * แย่กว่าลิงก์ที่บอกตรง ๆ ว่ายังไม่เปิด
 */

const ROW =
  "group flex min-h-10 w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-13-5 transition-colors";

function isActive(pathname: string, href: string): boolean {
  return href === PAYROLL_ROOT ? pathname === PAYROLL_ROOT : pathname.startsWith(href);
}

/** รายการเดียวกัน ใช้ซ้ำในดรอปดาวน์ของ topbar เมื่อจอแคบกว่า `lg` */
export function PayrollNavList() {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูค่าจ้างและสวัสดิการ" className="flex flex-col gap-5 p-3">
      {payrollNav.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-11 font-semibold tracking-[0.08em] text-mut">
            {group.section}
          </p>
          {group.items.map((item) => (
            <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavRow({ item, active }: { item: PayrollNavItem; active: boolean }) {
  const Icon = item.icon;

  if (!item.ready) {
    return (
      <span
        className={`${ROW} cursor-default text-mut/65`}
        title="ยังไม่เปิดใช้งาน"
        aria-disabled
      >
        <Icon size={17} strokeWidth={1.6} className="flex-none" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="flex-none rounded-selector bg-base-200 px-1.5 py-0.5 text-10 font-medium text-mut">
          เร็ว ๆ นี้
        </span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${
        active
          ? "nav-on font-medium"
          : "text-ink hover:bg-soft hover:text-primary"
      }`}
    >
      <Icon
        size={17}
        strokeWidth={1.6}
        aria-hidden
        className="flex-none transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-8"
      />
      <span className="flex-1 truncate">{item.label}</span>
    </Link>
  );
}
