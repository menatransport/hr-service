"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { ModuleNav } from "@/components/module/module-nav";
import { findModule } from "@/lib/modules";

/** คุกกี้จำว่าย่อแถบข้างไว้ไหม — เซิร์ฟเวอร์อ่านตอนวาดหน้า (`AppShell`) หน้าจึงไม่กระพริบจากกว้างเป็นแคบ */
export const SIDEBAR_COOKIE = "hrs.sidebar";

/**
 * แถบข้างเดสก์ท็อปของ `AppShell` — กว้าง 200px หรือย่อเหลือแถบไอคอน 56px (ปุ่มบนหัวแถบ ข้างชื่อกลุ่ม)
 * ให้เนื้อหาได้ที่มากที่สุด · จำค่าไว้ในคุกกี้ (ค่าความสะดวกต่อเครื่อง ไม่ใช่ข้อมูลระบบ)
 *
 * หน้าที่ไม่อยู่ในกลุ่มใดใช้ `fallback` (เมนูเดิมของระบบ ซึ่งไม่มีโหมดไอคอน) — กางเต็มเสมอ
 */
export function ShellSidebar({
  fallback,
  initialRail,
}: {
  fallback: React.ReactNode;
  initialRail: boolean;
}) {
  const pathname = usePathname();
  const [railPref, setRailPref] = useState(initialRail);
  const rail = railPref && Boolean(findModule(pathname));

  const toggle = () => {
    const next = !railPref;
    setRailPref(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "rail" : "full"}; path=/; max-age=31536000; samesite=lax`;
  };

  const label = rail ? "ขยายแถบข้าง" : "ย่อแถบข้าง";
  const Icon = rail ? PanelLeftOpen : PanelLeftClose;
  const toggleButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`grid flex-none cursor-pointer place-items-center rounded-[8px] text-mut transition-colors hover:bg-base-200 hover:text-ink ${
        rail ? "size-10" : "size-7"
      }`}
    >
      <Icon size={16} strokeWidth={1.8} aria-hidden />
    </button>
  );

  return (
    <aside
      data-rail={rail || undefined}
      /* สูงเต็มจอใต้แถบบนเสมอ (14 ต.ค. 2026 · Bew) — เท่ากับ min-h ของแผ่นเนื้อหาใน `AppShell`
         ขอบล่างของสองแผ่นจึงตรงกัน · เมนูยาวเกินจอเมื่อไหร่ เลื่อนในแถบเอง */
      className={`app-shell-side sticky top-[calc(var(--shell-header-h)+2px)] hidden h-[calc(100dvh-var(--shell-header-h)-0.875rem)] flex-none flex-col overflow-x-hidden overflow-y-auto overscroll-contain rounded-[16px] transition-[width] duration-300 ease-out lg:flex ${
        rail ? "w-14" : "w-[200px]"
      }`}
    >
      <ModuleNav morph rail={rail} fallback={fallback} headAction={toggleButton} />
    </aside>
  );
}
