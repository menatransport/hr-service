"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { LogoutTile } from "@/components/auth/logout-button";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggleTile } from "@/components/ui/theme-toggle";
import { MODULES } from "@/lib/modules";

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
 * - ในกล่อง: ทุกเมนูของทุกกลุ่มเป็นไอคอนเรียงสามคอลัมน์ต่อกลุ่ม → บัตรผู้ใช้ (รหัส · ชื่อ ·
 *   แผนก) → ปุ่มเต็มสองปุ่ม (สลับธีม แทน “ตั้งค่า” ของ menaIT · ออกจากระบบ)
 *
 * เมนูมาจาก `lib/modules.ts` ชุดเดียวกับหน้า Home และแถบข้าง — เพิ่มเมนูที่นั่นที่เดียว
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
          aria-label="เมนูทั้งหมด"
          className="max-h-[80dvh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-base-100 p-2 text-ink shadow-2xl sm:w-[min(calc(100vw-2rem),780px)]"
        >
          <div className="flex flex-col gap-2 p-2 sm:flex-row">
            {MODULES.map((group, gi) => (
              <Fragment key={group.id}>
                {gi > 0 ? <div aria-hidden className="mx-2 h-px bg-line sm:mx-0 sm:my-2 sm:h-auto sm:w-px" /> : null}
                {/* กว้างตามจำนวนเมนู (สูงสุดสามคอลัมน์) — กลุ่มเมนูน้อยไม่ต้องกินที่เท่ากลุ่มใหญ่ */}
                <div
                  className={`tone-${group.id} min-w-0`}
                  style={{ flex: `${Math.min(group.items.length, 3)} 1 0%` }}
                >
                  <h3 className="mb-2 px-2 text-12 font-semibold text-mut">{group.label}</h3>
                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${Math.min(group.items.length, 3)}, minmax(0, 1fr))` }}
                  >
                    {group.items.map((item) => {
                      const tile = (
                        <>
                          <span className="grid size-10 place-items-center rounded-xl bg-base-200 text-mut transition-colors duration-200 group-hover/item:bg-(--tone) group-hover/item:text-white">
                            <item.icon size={20} strokeWidth={1.8} aria-hidden />
                          </span>
                          <span className="text-center text-11 leading-tight font-medium text-pretty text-mut transition-colors duration-200 group-hover/item:text-(--tone-ink)">
                            {item.label}
                          </span>
                        </>
                      );
                      return item.soon ? (
                        <span
                          key={item.id}
                          title="เร็ว ๆ นี้"
                          className="flex cursor-not-allowed flex-col items-center gap-2 rounded-xl p-2 opacity-50"
                        >
                          {tile}
                        </span>
                      ) : (
                        <Link
                          key={item.id}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setOpen(false)}
                          className="group/item flex flex-col items-center gap-2 rounded-xl p-2 transition-all duration-200 hover:bg-(--tone-soft)"
                        >
                          {tile}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>

          <div className="border-t border-line p-2">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-linear-to-r from-primary/5 to-[#f8b545]/12 p-3">
              <Avatar name={user.name} src={user.imageUrl} size="md" className="shadow-md" />
              <div className="min-w-0 flex-1">
                <p className="text-15 font-bold">ID: {user.employeeId}</p>
                <p className="truncate text-12 text-mut">{user.name}</p>
                <p className="truncate text-12 text-mut">{user.role}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ThemeToggleTile />
              <LogoutTile />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
