"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { isDropdownOpen } from "@/components/ui/field";

/**
 * โครงกล่องลอยที่ใช้ร่วมกันของหน้าบันทึกเคส (ฟอร์มบันทึก + รายละเอียดเคส)
 *
 * ทำท่าเดียวกับ `case-modal.tsx` ทุกอย่าง — Esc ปิด, ล็อกไม่ให้หน้าหลังเลื่อน,
 * โฟกัสเข้ากล่อง, คลิกฉากหลังปิด — แต่แยกออกมาเป็นชิ้นใช้ซ้ำเพราะที่นี่มีสองกล่อง
 * (`case-modal.tsx` เป็นกล่องเดียวที่ผูกกับ route จึงยังคุมของตัวเองต่อไป)
 *
 * โครงเป็น flex 3 ชั้นเหมือนกัน: หัวคงที่ · กลางเลื่อนได้ · ท้ายคงที่
 */
export function ModalShell({
  title,
  subtitle,
  onClose,
  footer,
  width = "760px",
  tone = "sections",
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: string;
  /**
   * `sections` = เนื้อในเป็นการ์ดหลายใบวางบนพื้น `canvas` (หน้ารายละเอียด) ·
   * `plain` = เนื้อในเป็นฟอร์มชุดเดียว วางบนพื้น `base-100` ตรง ๆ ·
   * `form` = ฟอร์มที่แบ่งส่วนเอง **ไม่มี padding/ช่องไฟจากกล่อง** แถบหัวข้อจึงกินเต็ม
   *   ความกว้าง (ทรงแบบฟอร์มราชการ — ดู `record-case-form.tsx`)
   *
   * แยกไว้เพราะฟอร์มชุดเดียวที่ใส่การ์ดครอบอีกชั้นจะได้กรอบซ้อนกรอบ
   * ซึ่งไม่ได้แบ่งอะไรเพิ่ม มีแต่ทำให้กล่องดูแคบลง
   */
  tone?: "sections" | "plain" | "form";
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // dropdown กางอยู่ → Esc ครั้งนี้เป็นของ dropdown เท่านั้น
      if (e.key !== "Escape" || isDropdownOpen()) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="ปิดหน้าต่าง"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className={`relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-[18px] border border-line shadow-[0_32px_80px_-24px_rgba(21,32,29,0.45)] outline-none animate-rise ${
          tone === "sections" ? "bg-canvas" : "bg-base-100"
        }`}
      >
        <header className="flex flex-none items-start gap-4 border-b border-line bg-base-100 px-5 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-[17px] leading-snug font-semibold text-pretty">{title}</h2>
            {subtitle ? (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-mut">
                {subtitle}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex size-9 flex-none items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
          >
            <X size={19} strokeWidth={1.9} aria-hidden />
          </button>
        </header>

        <div
          className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${
            tone === "form" ? "" : tone === "plain" ? "gap-4 p-5" : "gap-3.5 p-5"
          }`}
        >
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-none flex-wrap items-center justify-end gap-2.5 border-t border-line bg-base-100 px-5 py-3.5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
