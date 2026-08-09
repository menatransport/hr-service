"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { deskNav, type DeskNavItem } from "@/lib/data";

function isActive(pathname: string, href: string) {
  return href === "/desk" ? pathname === "/desk" : pathname.startsWith(href);
}

const ROW =
  "group flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[13.5px] transition-colors";

export function DeskSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[248px] flex-none border-r border-line bg-base-100 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
      <NavList pathname={pathname} />
    </aside>
  );
}

/** Same list, rendered inside the top-bar dropdown below `lg`. */
export function DeskNavList() {
  const pathname = usePathname();
  return <NavList pathname={pathname} />;
}

function NavList({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="เมนู HR" className="flex flex-col gap-5 p-3">
      {deskNav.map((group) => (
        <div key={group.section} className="flex flex-col gap-1">
          <p className="px-2.5 pb-1 text-[11px] tracking-[0.08em] text-mut">
            {group.section}
          </p>
          {group.items.map((item) =>
            item.children ? (
              <NavGroup key={item.href} item={item} pathname={pathname} />
            ) : (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`${ROW} ${
                  isActive(pathname, item.href)
                    ? "bg-primary font-medium text-primary-content"
                    : "text-ink hover:bg-base-200"
                }`}
              >
                <item.icon
                  size={17}
                  strokeWidth={1.6}
                  className="flex-none transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-8"
                  aria-hidden
                />
                <span className="flex-1 truncate">{item.label}</span>
              </Link>
            ),
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * เมนูที่มีรายการย่อย — พับเก็บได้
 *
 * หัวกลุ่มเป็นปุ่ม ไม่ใช่ลิงก์ (ยังไม่มีหน้าภาพรวมของทะเบียน) หน้าที่เดียวของมันคือ
 * เปิด/ปิดรายการย่อย · เริ่มกางไว้ถ้าหน้าที่เปิดอยู่อยู่ในกลุ่มนี้ ไม่งั้นเริ่มแบบพับ
 *
 * ตอนพับใช้ `inert` ปิดทั้งก้อน ไม่ใช่แค่ `overflow-hidden` — ถ้าซ่อนด้วยความสูง
 * อย่างเดียว ลิงก์ข้างในยังโดน Tab เข้าไปได้และ screen reader ยังอ่านเจอ
 */
function NavGroup({ item, pathname }: { item: DeskNavItem; pathname: string }) {
  const panelId = useId();
  const inGroup = pathname.startsWith(item.href);
  const [open, setOpen] = useState(inGroup);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className={`${ROW} hover:bg-base-200 ${
          inGroup ? "font-medium text-primary" : "text-ink"
        }`}
      >
        <item.icon size={17} strokeWidth={1.6} className="flex-none" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.8}
          aria-hidden
          className={`flex-none text-mut transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* grid-rows 0fr → 1fr ยืดตามความสูงจริงได้โดยไม่ต้องรู้ความสูงล่วงหน้า */}
      <div
        id={panelId}
        inert={!open}
        className={`grid transition-[grid-template-rows,margin-top] duration-200 ease-out ${
          open ? "mt-1 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]"
        }`}
      >
        {/* `overflow-hidden` ที่ตัวลูกของ grid คือสิ่งที่ทำให้ยุบเหลือ 0 ได้จริง */}
        <ul className="ml-4.75 flex flex-col gap-1 overflow-hidden border-l border-line pl-2.5">
          {item.children?.map((child) => {
            const active = isActive(pathname, child.href);

            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  className={`${ROW} ${
                    active
                      ? "bg-primary font-medium text-primary-content"
                      : "text-mut hover:bg-base-200 hover:text-ink"
                  }`}
                >
                  <span className="flex-1 truncate">{child.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
