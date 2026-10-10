"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { ADMIN_ROOT, adminNav, type AdminNavItem } from "@/app/recruitment/_lib/admin-nav";

/**
 * แถบเมนูของศูนย์กลางสรรหา
 *
 * โครงเดียวกับ `components/desk/sidebar.tsx` · เมนูตื้นระดับเดียว **ยกเว้นรายการที่มี
 * `children`** (ตอนนี้มีแค่ “ตั้งค่าระบบ”) ซึ่งพับเก็บกลุ่มย่อยไว้ใต้ตัวเอง — กางเอง
 * เมื่ออยู่ในหน้าตั้งค่า เพื่อให้แถบข้างไม่ยาวขึ้นตามจำนวนของที่ตั้งค่าได้
 *
 * รายการที่ยังไม่มีหน้าจริง (`ready: false`) เรนเดอร์เป็น `<span>` ไม่ใช่ `<a>` —
 * ลิงก์ที่กดแล้วได้ 404 แย่กว่าลิงก์ที่บอกตรง ๆ ว่ายังไม่เปิด
 */

const ROW =
  "group flex min-h-10 w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-13-5 transition-colors";

function isActive(pathname: string, href: string): boolean {
  return href === ADMIN_ROOT ? pathname === ADMIN_ROOT : pathname.startsWith(href);
}

/** รายการเดียวกัน ใช้ซ้ำในดรอปดาวน์ของ topbar เมื่อจอแคบกว่า `lg` */
export function AdminNavList() {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูศูนย์กลางสรรหา" className="flex flex-col gap-5 p-3">
      {adminNav.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-11 font-semibold tracking-[0.08em] text-mut">
            {group.section}
          </p>
          {group.items.map((item) =>
            item.children ? (
              <NavBranch key={item.href} item={item} pathname={pathname} />
            ) : (
              <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} />
            ),
          )}
        </div>
      ))}
    </nav>
  );
}

function NavRow({ item, active }: { item: AdminNavItem; active: boolean }) {
  const Icon = item.icon;

  if (!item.ready) {
    return (
      <span
        className={`${ROW} cursor-default text-mut/65`}
        title="โมดูลนี้ยังไม่เปิดใช้งาน"
      >
        <Icon size={17} strokeWidth={1.6} className="flex-none" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="flex-none rounded-selector bg-base-200 px-1.5 py-0.5 text-10 font-medium">
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

/**
 * รายการที่มีเมนูย่อย — กดแถวแม่ = พับ/กาง (ไม่ได้พาไปไหน) · เมนูย่อยเป็นแบบเรียบ:
 * ตัวเล็ก เยื้องเข้าพร้อมเส้นนำทางซ้าย หัวกลุ่มย่อยเป็นตัวจางเล็ก และรายการที่ยังไม่เปิด
 * แค่จางลง ไม่มีป้าย “เร็ว ๆ นี้” ให้รก (ขึ้นเป็น tooltip แทน)
 */
function NavBranch({ item, pathname }: { item: AdminNavItem; pathname: string }) {
  const inside = pathname.startsWith(item.href);
  const [open, setOpen] = useState(inside);
  const expanded = open || inside;
  const Icon = item.icon;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className={`${ROW} cursor-pointer ${inside ? "font-medium text-primary" : "text-ink"} hover:bg-base-200`}
      >
        <Icon
          size={17}
          strokeWidth={1.6}
          aria-hidden
          className="flex-none transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-8"
        />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronRight
          size={14}
          strokeWidth={2}
          aria-hidden
          className={`flex-none text-mut transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>

      {expanded ? (
        <div className="ml-[1.3rem] mt-0.5 flex flex-col gap-2 border-l border-line pb-1 pl-2.5">
          {item.children!.map((group) => (
            <div key={group.section} className="flex flex-col">
              {group.section ? (
                <p className="px-2 pt-1 pb-0.5 text-10-5 tracking-[0.06em] text-mut/80">
                  {group.section}
                </p>
              ) : null}
              {group.items.map((sub) => {
                const active = pathname.startsWith(sub.href);
                return sub.ready ? (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative rounded-field px-2 py-1.5 text-12-5 transition-colors ${
                      active
                        ? "bg-soft font-medium text-primary before:absolute before:top-1.5 before:bottom-1.5 before:-left-[11px] before:w-0.5 before:rounded-full before:bg-primary"
                        : "text-ink hover:bg-base-200"
                    }`}
                  >
                    {sub.label}
                  </Link>
                ) : (
                  <span
                    key={sub.href}
                    title="เร็ว ๆ นี้"
                    className="cursor-default px-2 py-1.5 text-12-5 text-mut/55"
                  >
                    {sub.label}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
