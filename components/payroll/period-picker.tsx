"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  CURRENT_PERIOD,
  isFuture,
  isLocked,
  periodLabel,
  TH_MONTHS,
  type PeriodRef,
} from "@/lib/payroll/period";

/**
 * ตัวเลือกรอบจ่าย — ปี พ.ศ. หนึ่งแถว เดือน 12 ปุ่ม
 *
 * เป็นปุ่มเดือนเรียงให้เห็นทั้งปี **ไม่ใช่ดรอปดาวน์** — คนทำเงินเดือนสลับไปดูรอบเก่า
 * บ่อยกว่าที่คิด ปุ่มที่เห็นทั้งปีกดครั้งเดียวถึง ส่วนดรอปดาวน์ต้องกดเปิดแล้วค่อยเลือก
 * และซ่อนสถานะของเดือนอื่นไปหมด
 *
 * รอบที่ปิดแล้วกับรอบที่ยังมาไม่ถึงขึ้นเป็นปุ่มจาง ๆ ที่กดไม่ได้ **ไม่ใช่ซ่อนทิ้ง** —
 * การเห็นว่าเดือนไหนปิดไปแล้วคือข้อมูลที่คนใช้ต้องการ ไม่ใช่สิ่งที่ต้องปกปิด
 */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodRef;
  onChange: (next: PeriodRef) => void;
}) {
  /* ปีที่กำลังเปิดดู แยกจากปีของรอบที่เลือกไว้ — เลื่อนดูปีอื่นได้โดยไม่เสียรอบที่เลือก */
  const [viewYear, setViewYear] = useState(value.year);
  const locked = isLocked(value);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="ปีก่อนหน้า"
          onClick={() => setViewYear((y) => y - 1)}
          className="flex size-8 items-center justify-center rounded-selector border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ChevronLeft size={16} strokeWidth={1.8} aria-hidden />
        </button>

        <span className="min-w-[4ch] text-center font-mono text-15 font-semibold tabular-nums">
          {viewYear}
        </span>

        <button
          type="button"
          aria-label="ปีถัดไป"
          onClick={() => setViewYear((y) => y + 1)}
          className="flex size-8 items-center justify-center rounded-selector border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary"
        >
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
        </button>

        <span className="text-11-5 text-mut">พ.ศ.</span>

        {viewYear !== CURRENT_PERIOD.year ? (
          <button
            type="button"
            onClick={() => setViewYear(CURRENT_PERIOD.year)}
            className="ml-1 text-12 text-mut transition-colors hover:text-primary"
          >
            กลับปีปัจจุบัน
          </button>
        ) : null}
      </div>

      <div
        role="group"
        aria-label="เลือกเดือน"
        className="grid max-w-[34rem] grid-cols-4 gap-1.5 sm:grid-cols-6"
      >
        {TH_MONTHS.map((name, index) => {
          const candidate: PeriodRef = { year: viewYear, month: index };
          const closed = isLocked(candidate);
          const future = isFuture(candidate);
          const disabled = closed || future;
          const active = value.year === viewYear && value.month === index;

          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              title={
                closed
                  ? "รอบนี้ปิดแล้ว อัปโหลดทับไม่ได้"
                  : future
                    ? "ยังไม่ถึงรอบนี้"
                    : undefined
              }
              onClick={() => onChange(candidate)}
              className={`rounded-field border px-2 py-2 text-13 transition-colors ${
                active
                  ? "border-primary bg-primary font-medium text-primary-content"
                  : disabled
                    ? "cursor-not-allowed border-line bg-base-100 text-mut/45"
                    : "border-line bg-base-100 text-ink hover:border-primary/40 hover:text-primary"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <p className="text-12 text-mut text-pretty">
        {locked ? (
          <>
            รอบ <span className="font-medium text-ink">{periodLabel(value)}</span>{" "}
            ปิดแล้ว — เปิดดูข้อมูลได้ แต่อัปโหลดทับไม่ได้
          </>
        ) : (
          <>
            กำลังนำข้อมูลเข้ารอบ{" "}
            <span className="font-medium text-ink">{periodLabel(value)}</span> ·
            ไฟล์ที่อัปโหลดจะผูกกับรอบนี้เท่านั้น
          </>
        )}
      </p>
    </div>
  );
}
