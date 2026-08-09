"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, House, LayoutGrid, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const tabs: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] =
  [
    { href: "/m", label: "หน้าแรก", icon: House, exact: true },
    { href: "/m/cases", label: "คำร้องของฉัน", icon: ClipboardList },
    { href: "/m/services", label: "บริการ", icon: LayoutGrid },
    { href: "/m/me", label: "ฉัน", icon: UserRound },
  ];

/** Pushed screens (the report wizard, a case detail) own their bottom bar. */
const hideOn = /^\/m\/cases\/.+/;

export function BottomTabs() {
  const pathname = usePathname();

  if (hideOn.test(pathname)) return null;

  return (
    <nav
      aria-label="เมนูหลัก"
      className="flex flex-none border-t border-line bg-base-100 px-2 pt-2 pb-safe md:pb-4"
    >
      {tabs.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1.5 rounded-selector py-2 text-[11.5px] transition-colors ${
              active ? "font-medium text-primary" : "text-mut hover:text-ink"
            }`}
          >
            <Icon size={21} strokeWidth={active ? 1.9 : 1.6} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
