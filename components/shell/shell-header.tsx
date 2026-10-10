"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Menu, X } from "lucide-react";

import { ModuleNav } from "@/components/module/module-nav";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { findModule } from "@/lib/modules";

/**
 * แถบบนของหน้าใน — โครงเดียวกับ `NavbarHeader` ของ menaIT V.2:
 * ซ้าย ← (กลับหน้าหลัก) + ที่อยู่ของหน้า `กลุ่ม / เมนู` ชิดซ้าย · ขวา เมนูผู้ใช้แบบเตี้ย (app launcher)
 * สูง 56px (`--shell-header-h`) · ไม่มีกระดิ่งตามที่สั่ง (9 ต.ค. 2569)
 *
 * ติดหัวจอ (`sticky`) และใช้พื้นไล่สีแบบ `fixed` ชุดเดียวกับตัวเชลล์ เนื้อหาที่เลื่อนผ่าน
 * ข้างใต้จึงถูกบังด้วยพื้นที่ต่อกันสนิท · **ห้ามใส่ `backdrop-filter` ที่แถบนี้** —
 * มันจะกลายเป็น containing block ของลูกที่เป็น `fixed` (ลิ้นชักเมนูบนมือถือจึงใช้ portal อยู่ดี)
 */
export function ShellHeader({
  user,
  actions,
  fallback,
  systemLabel,
}: {
  user: ShellUser;
  actions?: React.ReactNode;
  fallback: React.ReactNode;
  /** ชื่อบนแถบบนของหน้าที่ไม่อยู่ในกลุ่มงานใด */
  systemLabel?: string;
}) {
  const pathname = usePathname();
  const match = findModule(pathname);
  const [drawer, setDrawer] = useState(false);

  return (
    <header className="app-shell-fixed sticky top-0 z-30 text-white">
      <div className="flex h-(--shell-header-h) items-center gap-2 px-2 sm:px-3">
        <button
          type="button"
          aria-label="เปิดเมนู"
          onClick={() => setDrawer(true)}
          className="glass-btn grid size-9 flex-none place-items-center rounded-[10px] lg:hidden"
        >
          <Menu size={18} strokeWidth={1.8} aria-hidden />
        </button>
        <Link
          href={match ? `/home?m=${match.group.id}` : "/home"}
          transitionTypes={["nav-back"]}
          aria-label="กลับหน้าหลัก"
          title="กลับหน้าหลัก"
          className="glass-btn grid size-9 flex-none place-items-center rounded-[10px]"
        >
          <ArrowLeft size={17} strokeWidth={1.8} aria-hidden />
        </Link>

        {/* ที่อยู่ของหน้า ชิดซ้ายแนวเดียวกับแถบข้าง — กลุ่ม (และหัวข้อ subgroup) จาง · ชื่อหน้าเด่น */}
        <nav aria-label="ตำแหน่งของหน้า" className="flex min-w-0 flex-1 items-center gap-1.5 pl-1 sm:pl-2">
          {match ? (
            <>
              <span className="hidden truncate text-13 text-white/65 sm:inline">{match.group.label}</span>
              {match.child ? (
                <>
                  <Slash className="md:inline" />
                  <span className="hidden truncate text-13 text-white/65 md:inline">{match.item.label}</span>
                </>
              ) : null}
              <Slash className="sm:inline" />
              <span aria-current="page" className="truncate text-15 font-semibold">
                {(match.child ?? match.item).label}
              </span>
            </>
          ) : (
            <span className="truncate text-15 font-semibold">{systemLabel ?? "HR Service"}</span>
          )}
        </nav>

        {actions}
        <UserMenu user={user} compact />
      </div>

      {drawer
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
              <button
                type="button"
                aria-label="ปิดเมนู"
                onClick={() => setDrawer(false)}
                className="absolute inset-0 bg-ink/45 animate-fade-in"
              />
              {/* กดลิงก์ไหนในลิ้นชักก็ปิดลิ้นชัก — ฟังที่ตัวห่อชั้นเดียวแทนการไล่ใส่ทุกลิงก์ */}
              <div
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setDrawer(false);
                }}
                className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col overflow-y-auto rounded-r-[28px] bg-base-100 text-ink shadow-2xl animate-sheet-in"
              >
                <div className="flex items-center justify-between px-4 pt-4">
                  <span className="text-14 font-semibold">เมนู</span>
                  <button
                    type="button"
                    aria-label="ปิดเมนู"
                    onClick={() => setDrawer(false)}
                    className="grid size-10 place-items-center rounded-full text-mut hover:bg-base-200"
                  >
                    <X size={18} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
                {/* ไม่ส่ง `morph` — ชื่อ view transition มีได้ชุดเดียวต่อหน้า (ของแถบข้างเดสก์ท็อป) */}
                <ModuleNav fallback={fallback} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}

/** ตัวคั่นที่อยู่ — ซ่อนพร้อมชิ้นที่มันนำหน้า (`className` บอกว่าโผล่ที่จอไหน) */
function Slash({ className }: { className: string }) {
  return (
    <span aria-hidden className={`hidden flex-none text-13 text-white/35 ${className}`}>
      /
    </span>
  );
}
