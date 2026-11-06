"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";

import { manualEntries } from "../_lib/menu";

const ROW =
  "group flex min-h-10 w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-13-5 transition-colors";

/**
 * แถบข้างของคู่มือ — เมนูชุดเดียวกับ Home **หักเมนูที่ผู้ใช้มองไม่เห็น** (`hidden` จาก `getHiddenMenuIds`)
 * ใครไม่เห็นเมนูไหนก็ไม่เห็นคู่มือของเมนูนั้น
 */
export function ManualNav({ hidden }: { hidden: string[] }) {
  const pathname = usePathname();
  const entries = manualEntries(new Set(hidden));
  const groups = [...new Map(entries.map((e) => [e.group.id, e.group])).values()];

  const row = (href: string, active: boolean, Icon: typeof BookOpen, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${active ? "nav-on font-medium" : "text-ink hover:bg-soft hover:text-primary"}`}
    >
      <Icon size={17} strokeWidth={1.6} className="flex-none" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );

  return (
    <nav aria-label="คู่มือการใช้งาน" className="flex flex-col gap-5 p-3">
      <div className="flex flex-col gap-1">{row("/desk/manual", pathname === "/desk/manual", BookOpen, "ภาพรวมคู่มือ")}</div>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-11 font-semibold tracking-[0.08em] text-mut">{group.label}</p>
          {entries
            .filter((e) => e.group.id === group.id)
            .map((e) => {
              const href = `/desk/manual/${e.item.id}`;
              return row(href, pathname === href, e.item.icon, e.item.label);
            })}
        </div>
      ))}
    </nav>
  );
}
