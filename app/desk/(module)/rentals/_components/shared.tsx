"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { isDropdownOpen } from "@/components/ui/field";
import type { BoardRoomState } from "@/lib/rentals/types";

/** `2500` → `2,500` · ทศนิยมเฉพาะเมื่อมี */
export const baht = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** สีป้ายสถานะห้อง — ใช้ `chip-*` ชุดเดียวกับทั้งระบบ */
export const STATE_CHIP: Record<BoardRoomState, string> = {
  occupied: "chip-live",
  partial: "chip-live",
  vacant: "chip-done",
  "moving-out": "chip-sla",
  cancelled: "chip-alert",
};

/**
 * แผงขวาของหน้าห้องเช่า — ท่าเดียวกับ `AccessDrawer` ของหน้ากำหนดสิทธิ์ (ทับจอทางขวา · Esc/คลิกพื้นหลังปิด)
 * · เนื้อในเลื่อนเอง · ท้ายแผงเป็นแถบปุ่มติดขอบล่าง
 */
export function Drawer({
  eyebrow,
  title,
  sub,
  badge,
  onClose,
  footer,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // ดรอปดาวน์/ปฏิทินที่กางอยู่ในแผงกิน Esc ก่อน
      if (e.key === "Escape" && !isDropdownOpen()) onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} aria-hidden className="fixed inset-0 z-50 animate-fade-in bg-ink/30" />
      <aside
        role="dialog"
        aria-label={title}
        className="elev-pop fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] animate-fade-in flex-col bg-base-100 text-ink"
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-11-5 font-medium text-mut">{eyebrow}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-17 font-semibold text-pretty">{title}</h2>
              {badge}
            </div>
            {sub ? <div className="mt-0.5 text-12 text-mut">{sub}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="grid size-9 flex-none place-items-center rounded-full text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>
        ) : null}
      </aside>
    </>
  );
}

/** หัวข้อของแต่ละส่วนในแผง — คั่นด้วยเส้นบาง ไม่มีการ์ด */
export function DrawerSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-13-5 font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
