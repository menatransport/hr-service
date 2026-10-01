"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
 *
 * ⚠️ **ทั้งก้อนถูก `createPortal` ไป `document.body` เสมอ** — กฎเดียวกับ
 * `new-case-modal.tsx`, `master-modal.tsx` และ `survey-table.tsx`
 *
 * หน้าที่เรียกโมดัลเกือบทุกหน้าห่อเนื้อหาด้วย `animate-rise` ซึ่งจบแอนิเมชันแล้ว
 * เหลือ `transform: matrix(1,0,0,1,0,0)` — **ไม่ใช่ `none`** — กล่องนั้นจึงกลายเป็น
 * containing block ของลูกที่เป็น `position: fixed` · ผลคือ `fixed inset-0` ไปยึด
 * ขอบคอลัมน์เนื้อหาแทนขอบจอ: ฉากหลังไม่คลุมแถบข้างกับแถบบน และกล่องจัดกลาง
 * เทียบ `<main>` จนเบี้ยวไปทางขวาบนจอที่มีแถบข้าง (บนมือถือไม่มีแถบข้าง
 * จึงเกือบไม่เห็นความต่าง ซึ่งเป็นเหตุผลที่บั๊กนี้รอดมาถึงตอนทดสอบบนเดสก์ท็อป)
 *
 * แก้ที่นี่ที่เดียวแทนการไล่ถอด `animate-rise` ออกทีละหน้า เพราะ portal ตัด
 * ความเกี่ยวข้องกับ containing block ของหน้าแม่ทิ้งทั้งหมด หน้าไหนจะใส่
 * แอนิเมชันอะไรทีหลังก็ไม่กระทบโมดัลอีก
 */
/**
 * กองโมดัลที่ซ้อนกันอยู่ — **Esc เป็นของใบบนสุดใบเดียว**
 *
 * ทุกใบฟัง `keydown` ที่ `document` เหมือนกัน การกด Esc ครั้งเดียวจึงเคยปิดทั้งกอง
 * พร้อมกัน (เปิดพรีวิวซ้อนบนกล่องแก้คำถามแล้วกด Esc = ปิดทั้งสองใบ งานที่พิมพ์
 * ค้างไว้หายไปด้วย) · เก็บลำดับไว้เองแทนการเดาจาก DOM เพราะใบบนสุดคือใบที่
 * `mount` ทีหลัง ไม่ใช่ใบที่อยู่ท้าย `body` เสมอไป
 */
const modalStack: object[] = [];

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

  /* อ่านตัวล่าสุดผ่าน ref — เอฟเฟกต์ข้างล่างต้องผูกครั้งเดียวตอน mount ถ้าใส่
     `onClose` ไว้ใน deps ทุกครั้งที่หน้าแม่ render ใหม่ใบนี้จะถูกถอดแล้วดันกลับ
     ขึ้นหัวกอง ลำดับ “ใบบนสุด” ก็เพี้ยนทันที */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const token = {};
    modalStack.push(token);

    const onKey = (e: KeyboardEvent) => {
      // dropdown กางอยู่ → Esc ครั้งนี้เป็นของ dropdown เท่านั้น
      if (e.key !== "Escape" || isDropdownOpen()) return;
      // มีใบซ้อนอยู่ข้างบน → Esc เป็นของใบนั้น ใบนี้ยังไม่ปิด
      if (modalStack[modalStack.length - 1] !== token) return;
      close.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      modalStack.splice(modalStack.indexOf(token), 1);
    };
  }, []);

  /* เช็ค `document` ตรง ๆ ไม่ใช้ธง `mounted` จาก effect — ธงนั้นจะทำให้โมดัลว่าง
     หนึ่งเฟรมทุกครั้งที่เปิด และไปตัดจังหวะเริ่มของ `animate-rise` พอดี
     ฝั่งเซิร์ฟเวอร์คืน `null` ซึ่งตรงกับฝั่ง client เพราะ portal ไม่ทิ้ง markup
     ไว้ที่ตำแหน่งเดิมในต้นไม้อยู่แล้ว จึงไม่มี hydration mismatch */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      /* กติกาการพิมพ์ใน `globals.css` ใช้ตัวนี้หาว่ากล่องลอยอยู่ตรงไหน */
      data-modal-layer
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
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
        <header
          data-print-hide
          className="flex flex-none items-start gap-4 border-b border-line bg-base-100 px-5 py-3.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-17 leading-snug font-semibold text-pretty">{title}</h2>
            {subtitle ? (
              <div className="flex flex-wrap items-center gap-2 text-12-5 text-mut">
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
          <footer
            data-print-hide
            className="flex flex-none flex-wrap items-center justify-end gap-2.5 border-t border-line bg-base-100 px-5 py-3.5"
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
