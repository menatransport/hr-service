"use client";

import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

/**
 * กรอบหน้าจอของฟอร์มสมัคร — แถบบน · แถบความคืบหน้า · แถบปุ่มล่าง
 *
 * แยกออกมาจาก `apply-flow.tsx` เพราะสามชิ้นนี้เป็นเรื่องของ **รูปหน้าจอ** ล้วน ๆ
 * ไม่มีตรรกะของฟอร์มอยู่เลย · `apply-flow.tsx` ยาวพอแล้วและส่วนที่คนแก้บ่อยที่สุด
 * คือตรรกะการตรวจคำตอบ ไม่ใช่ระยะขอบของปุ่ม
 *
 * **ปุ่มหลักอยู่ติดขอบล่างเสมอ ไม่ใช่ท้ายหน้าที่เลื่อนหนี** — หน้ากรอกบนมือถือที่
 * ปุ่มไปต่ออยู่ท้ายสุดของ scroll ทำให้ผู้ใช้ต้องปัดลงทุกครั้งที่ตอบเสร็จ
 * และยิ่งหมวดไหนมีคำถามเยอะยิ่งเจ็บ · `pb-safe` กันไม่ให้ปุ่มไปซ้อนแถบ
 * home indicator ของ iPhone
 */

/* ------------------------------------------------------------------ แถบบน */

export function FlowTopBar({
  onBack,
  saved,
}: {
  /** `null` = อยู่ขั้นแรก ปุ่มย้อนกลับจะพากลับหน้าแรกของการรับสมัครแทน */
  onBack: (() => void) | null;
  /** แสดงจุดเขียว “บันทึกร่างแล้ว” — ปิดไว้ตอนส่งเสร็จ */
  saved: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 flex-none items-center gap-2 border-b border-line bg-base-100/92 px-3 backdrop-blur-md">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="ย้อนกลับ"
          className="group flex size-10 flex-none items-center justify-center rounded-full text-ink transition-colors hover:bg-base-200 active:bg-base-300"
        >
          <ArrowLeft
            size={19}
            strokeWidth={1.9}
            aria-hidden
            className="transition-transform duration-200 group-active:-translate-x-0.5"
          />
        </button>
      ) : (
        <Link
          href="/recruitment"
          aria-label="กลับหน้าแรก"
          className="group flex size-10 flex-none items-center justify-center rounded-full text-ink transition-colors hover:bg-base-200 active:bg-base-300"
        >
          <ArrowLeft
            size={19}
            strokeWidth={1.9}
            aria-hidden
            className="transition-transform duration-200 group-active:-translate-x-0.5"
          />
        </Link>
      )}

      <span className="truncate text-14 font-semibold">ใบสมัครพนักงานขับรถ</span>

      {saved ? (
        <span className="ms-auto flex flex-none items-center gap-1.5 rounded-full bg-soft px-2.5 py-1 text-11 text-primary">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          บันทึกร่างแล้ว
        </span>
      ) : null}
    </header>
  );
}

/* --------------------------------------------------------- แถบความคืบหน้า */

export function StepRail({
  stage,
  total,
  title,
}: {
  stage: number;
  total: number;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-12-5 font-medium text-mut">{title}</span>
        <span className="flex-none font-mono text-11 text-mut tabular-nums">
          {stage + 1}/{total}
        </span>
      </div>

      {/* หนึ่งขีดต่อหนึ่งขั้น — เห็นทั้งเส้นทางในแวบเดียวว่าเหลืออีกกี่หน้าจอ
          ต่างจากแถบยาวเส้นเดียวที่บอกได้แค่ “ประมาณครึ่งทาง” */}
      <div
        role="progressbar"
        aria-valuenow={stage + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`ขั้นที่ ${stage + 1} จาก ${total}`}
        className="flex gap-1.5"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i < stage
                ? "bg-primary"
                : i === stage
                  ? // ขั้นปัจจุบันมีวงแหวนจาง ๆ รอบขีด — บอกว่า “อยู่ตรงนี้” โดยไม่ต้อง
                    // ขยับอะไร · แอนิเมชันวิ่งวนบนแถบความคืบหน้าจะกวนสายตาคนที่
                    // กำลังอ่านคำถามอยู่ ซึ่งเป็นงานหลักของหน้านี้
                    "bg-primary ring-[3px] ring-primary/20"
                  : "bg-line"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- แถบปุ่มล่าง */

export function ActionBar({
  onBack,
  onNext,
  nextLabel,
  busy,
  note,
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  nextLabel: string;
  busy: boolean;
  note?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 flex-none border-t border-line bg-base-100/92 px-5 pt-3 backdrop-blur-md pb-safe">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
        <div className="flex gap-2.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={busy}
              aria-label="ย้อนกลับ"
              className="flex size-13 flex-none items-center justify-center rounded-box border border-line text-ink transition-colors hover:border-primary/40 active:bg-base-200 disabled:opacity-40"
            >
              <ArrowLeft size={18} strokeWidth={1.9} aria-hidden />
            </button>
          ) : null}

          <button
            type="button"
            onClick={onNext}
            disabled={busy}
            className="btn-pri flex h-13 flex-1 items-center justify-center gap-2 text-15 font-semibold transition-all duration-150 active:scale-[0.985] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={16} strokeWidth={2.2} aria-hidden className="animate-spin" />
            ) : null}
            {nextLabel}
          </button>
        </div>

        {note ? (
          <span className="flex items-center justify-center gap-1.5 text-center text-11 text-mut">
            <Check size={11} strokeWidth={2.4} aria-hidden className="text-primary" />
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
