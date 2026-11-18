"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { useFilterGroup } from "@/components/auth/menu-access-provider";
import { moduleSections, type ModuleMatch } from "@/lib/modules";

/**
 * ชื่อหน้าบนแถบบน + เมนูสลับหน้า — แทนแถบข้างที่เอาออก (18 พ.ย. 2569 · Bew “เข้าไปแล้วไม่ต้องมี sidebar”)
 *
 * กดชื่อหน้าแล้วกางรายการเมนูของกลุ่มเดียวกัน จัดหมวดเหมือนการ์ดบนหน้า Home (`moduleSections`)
 * เฉพาะเมนูที่ผู้ใช้มีสิทธิ์ · ไม่ต้องย้อนกลับ Home เพื่อไปหน้าข้าง ๆ
 * กล่องกางใต้ปุ่ม (absolute) จึงต้องตั้ง `text-ink` เอง เพราะแถบบนเป็นตัวหนังสือขาว
 */
export function PageSwitcher({ match }: { match: ModuleMatch }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const group = useFilterGroup()(match.group);
  const sections = moduleSections(group);
  const current = match.child ?? match.item;

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
    <div ref={wrap} className="relative min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-current="page"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-[10px] py-1 pr-1.5 pl-2 text-15 font-semibold transition-colors hover:bg-white/12"
      >
        <span className="truncate">{current.label}</span>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className={`flex-none text-white/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={`เมนูใน ${group.label}`}
          // กดลิงก์ไหนก็ปิดกล่อง — ฟังที่ตัวห่อชั้นเดียวแทนการไล่ใส่ทุกลิงก์
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={`tone-${group.id} absolute top-full left-0 z-50 mt-1.5 flex max-h-[calc(100dvh-var(--shell-header-h)-1rem)] w-[min(92vw,340px)] animate-fade-in flex-col gap-2 overflow-y-auto rounded-2xl border border-line bg-base-100 p-2 text-ink shadow-2xl`}
        >
          {sections.map((sec) => (
            <div key={sec.id} className="flex flex-col">
              {sec.label ? (
                <p className="px-2.5 pt-1.5 pb-1 text-12 font-semibold text-mut">{sec.label}</p>
              ) : null}
              {sec.apps.map(({ item }) => {
                const active = item.id === current.id;
                if (item.soon) {
                  return (
                    <span
                      key={item.id}
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-3 rounded-[12px] px-2.5 py-2 text-mut"
                    >
                      <item.icon size={18} strokeWidth={1.8} aria-hidden className="flex-none" />
                      <span className="min-w-0 flex-1 truncate text-14">{item.label}</span>
                      <span className="text-11 font-semibold">เร็ว ๆ นี้</span>
                    </span>
                  );
                }
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-[12px] px-2.5 py-2 transition-colors ${
                      active ? "tone-soft font-semibold" : "hover:bg-base-200"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-8 flex-none place-items-center rounded-[10px] ${active ? "tone-app" : "tone-soft"}`}
                    >
                      <item.icon size={16} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-14">{item.label}</span>
                      <span className="block truncate text-12 font-normal text-mut">{item.desc}</span>
                    </span>
                    {active ? <Check size={16} strokeWidth={2} aria-hidden className="flex-none" /> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
