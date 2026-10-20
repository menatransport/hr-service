"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { LogoutMenuItem } from "@/components/auth/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggleMenuItem } from "@/components/ui/theme-toggle";

export interface ShellUser {
  name: string;
  /** `หน่วยงาน · ตำแหน่ง` — ใช้ในบัตรผู้ใช้ในกล่อง */
  role: string;
  /** บรรทัดรองบนปุ่ม (สั้นกว่า `role` — แบบ menaIT ที่โชว์แค่แผนก) */
  department: string;
  employeeId: string;
  imageUrl: string | null;
}

/**
 * เมนูผู้ใช้บนแถบบน — ท่าเดียวกับ `NavbarHeader` ของ menaIT V.2 ทุกอย่าง:
 *
 * - ปุ่มกระจก (รูป · ชื่อ · แผนก · ลูกศร) ขยายนิดตอนชี้
 * - **เดสก์ท็อปกางเองตอนชี้ (hover)** มือถือกดเพื่อกาง · กดซ้ำ / คลิกนอก / Esc เพื่อปิด
 * - ในกล่อง: แค่เรื่องบัญชี — ชื่อ · หน่วยงาน · รหัส → สลับธีม · ออกจากระบบ
 *   (20 ต.ค. 2569 · Bew เอากริดเมนูทุกกลุ่มออก — ซ้ำกับหน้า Home และแถบข้าง)
 *
 * กล่องกางใต้ปุ่ม (absolute) จึงต้องตั้ง `text-ink` เอง เพราะแถบบนเป็นตัวหนังสือขาว
 */
export function UserMenu({ user, compact = false }: { user: ShellUser; /** ปุ่มเตี้ยสำหรับแถบบนของหน้าใน (56px) */ compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrap} className="group/um relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`เมนูผู้ใช้ ${user.name}`}
        onClick={() => setOpen((v) => !v)}
        className={`flex cursor-pointer items-center rounded-xl bg-white/10 text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/20 ${
          compact
            ? "gap-2 p-1 sm:pr-2.5"
            : "gap-2 p-1.5 hover:scale-105 sm:gap-3 sm:px-4 sm:py-2"
        }`}
      >
        <Avatar
          name={user.name}
          src={user.imageUrl}
          size={compact ? "sm" : "nav"}
          className={compact ? "ring-2 ring-white/25" : "ring-2 ring-white/30 sm:size-10!"}
        />
        <span className="hidden min-w-0 text-left sm:block">
          <span className={`block max-w-48 truncate font-semibold ${compact ? "text-13 leading-tight" : "text-14"}`}>
            {user.name}
          </span>
          <span className={`block max-w-48 truncate text-white/70 ${compact ? "text-11 leading-tight" : "text-12"}`}>
            {user.department}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className={`text-white/70 transition-transform duration-300 sm:group-hover/um:rotate-180 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* เดสก์ท็อปกางตอนชี้ (เหมือน menaIT) · `pt-2` เป็นสะพานให้เมาส์เลื่อนจากปุ่มลงกล่องได้โดยไม่หลุด */}
      <div
        className={`absolute top-full right-0 z-50 pt-2 transition-all duration-300 ${
          open
            ? "visible translate-y-0 opacity-100"
            : "invisible translate-y-2 opacity-0 sm:group-hover/um:visible sm:group-hover/um:translate-y-0 sm:group-hover/um:opacity-100"
        }`}
      >
        <div
          role="menu"
          aria-label="เมนูผู้ใช้"
          className="w-64 rounded-2xl border border-line bg-base-100 p-1.5 text-ink shadow-2xl"
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <Avatar name={user.name} src={user.imageUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 font-semibold">{user.name}</p>
              <p className="truncate text-12 text-mut">{user.role}</p>
              <p className="text-11 text-mut tabular-nums">ID {user.employeeId}</p>
            </div>
          </div>
          <div className="border-t border-line pt-1.5">
            <ThemeToggleMenuItem />
            <LogoutMenuItem />
          </div>
        </div>
      </div>
    </div>
  );
}
