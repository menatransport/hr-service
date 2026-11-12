"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { THAI_MONTHS_FULL, THAI_WEEKDAYS, dayPickerClassNames } from "@/components/ui/field";

/**
 * วันเวลาที่ลงนาม (12 พ.ย. 2569) — ค่าตั้งต้น = ตอนนี้ · เลือกย้อนหลังด้วยปฏิทิน + ชั่วโมง/นาทีแบบ 24 ชม.
 *
 * - `value === null` = “ตอนนี้” — คิดเวลาจริงตอนกดบันทึก ไม่ใช่ตอนเปิดกล่อง
 * - คิดเป็นเวลาไทย (UTC+7) เสมอ เหมือน `thaiShortDateTime` / วันที่ใต้ลายเซ็นบนกระดาษ
 * - ลงนามล่วงหน้าไม่ได้ — วันหลังวันนี้กดไม่ได้ ชั่วโมง/นาทีที่ยังไม่ถึงของวันนี้ก็กดไม่ได้
 */

const BKK = 7 * 3_600_000;
const pad2 = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

type Parts = { y: number; m: number; d: number; h: number; min: number };

function toParts(iso: string): Parts {
  const t = new Date(Date.parse(iso) + BKK);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
  };
}

const fromParts = (p: Parts) => new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - BKK).toISOString();

const sameDay = (a: Parts, b: Parts) => a.y === b.y && a.m === b.m && a.d === b.d;

/** `12 พฤศจิกายน 2569 · 14:35 น.` */
export function signedAtLabel(iso: string): string {
  const p = toParts(iso);
  return `${p.d} ${THAI_MONTHS_FULL[p.m - 1]} ${p.y + 543} · ${pad2(p.h)}:${pad2(p.min)} น.`;
}

/** ค่าที่จะบันทึกจริง — `null` (ตอนนี้) ถึงตรงนี้ค่อยอ่านนาฬิกา */
export const resolveSignedAt = (value: string | null) => value ?? new Date().toISOString();

export function SignedAtPicker({
  value,
  onChange,
  defaultOpen = false,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  /* นาฬิกาเดินทุก 20 วิ — ป้าย “ตอนนี้” กับขอบเขตลงนามล่วงหน้าไม่ค้างอยู่ที่ตอนเปิดกล่อง */
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  const now = toParts(nowIso);
  const cur = toParts(value ?? nowIso);
  const isToday = sameDay(cur, now);

  /** แก้ทีละชิ้น · เลยเวลาปัจจุบันเมื่อไหร่ถอยมาที่ตอนนี้ */
  function pick(patch: Partial<Parts>) {
    const next = { ...cur, ...patch };
    const iso = fromParts(next);
    onChange(Date.parse(iso) > Date.parse(nowIso) ? fromParts(now) : iso);
  }

  return (
    <div className="flex flex-col rounded-field border border-line">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <span className="flex items-center gap-1.5 text-12-5 font-medium">
          <CalendarClock size={14} strokeWidth={2} aria-hidden className="text-mut" />
          วันเวลาที่ลงนาม
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto flex items-center gap-1.5 rounded-selector px-2 py-1 text-12-5 tabular-nums transition-colors hover:bg-base-200 hover:text-primary"
        >
          {value === null ? (
            <span className="rounded-selector bg-primary/10 px-1.5 py-px text-11 font-medium text-primary">
              ตอนนี้
            </span>
          ) : null}
          {signedAtLabel(value ?? nowIso)}
          <ChevronDown
            size={13}
            strokeWidth={2}
            aria-hidden
            className={`text-mut transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-2 border-t border-line px-3 pt-2.5 pb-2">
          <div className="flex flex-wrap justify-center gap-3">
            <DayPicker
              mode="single"
              selected={new Date(cur.y, cur.m - 1, cur.d)}
              defaultMonth={new Date(cur.y, cur.m - 1, 1)}
              endMonth={new Date(now.y, now.m - 1, 1)}
              disabled={{ after: new Date(now.y, now.m - 1, now.d) }}
              onSelect={(d) => d && pick({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })}
              showOutsideDays
              classNames={dayPickerClassNames}
              formatters={{
                formatCaption: (month) => `${THAI_MONTHS_FULL[month.getMonth()]} ${month.getFullYear() + 543}`,
                formatWeekdayName: (day) => THAI_WEEKDAYS[day.getDay()],
              }}
              labels={{
                labelDayButton: (day) =>
                  `${day.getDate()} ${THAI_MONTHS_FULL[day.getMonth()]} ${day.getFullYear() + 543}`,
                labelPrevious: () => "เดือนก่อนหน้า",
                labelNext: () => "เดือนถัดไป",
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left" ? (
                    <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
                  ) : (
                    <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
                  ),
              }}
            />

            {/* ชั่วโมง : นาที — 24 ชม. ล้วน ไม่มี AM/PM · เลือกนาทีได้ทีละ 1 ให้ตรงกับ “ตอนนี้” */}
            <div className="flex gap-1 border-line sm:border-l sm:pl-3">
              <TimeColumn
                label="ชั่วโมง"
                items={HOURS}
                value={cur.h}
                disabled={(h) => isToday && h > now.h}
                onPick={(h) => pick({ h })}
              />
              <span className="pt-7 font-mono text-13 text-mut">:</span>
              <TimeColumn
                label="นาที"
                items={MINUTES}
                value={cur.min}
                disabled={(min) => isToday && cur.h === now.h && min > now.min}
                onPick={(min) => pick({ min })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-11 text-mut">ลงนามล่วงหน้าไม่ได้ · เวลาไทย 24 ชั่วโมง</span>
            <button
              type="button"
              disabled={value === null}
              onClick={() => onChange(null)}
              className="flex items-center gap-1 rounded-selector px-2 py-1 text-11-5 text-mut transition-colors hover:bg-base-200 hover:text-primary disabled:opacity-45"
            >
              <RotateCcw size={12} strokeWidth={2} aria-hidden />
              ใช้เวลาปัจจุบัน
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimeColumn({
  label,
  items,
  value,
  disabled,
  onPick,
}: {
  label: string;
  items: number[];
  value: number;
  disabled: (n: number) => boolean;
  onPick: (n: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  /* เลื่อนมาหยุดที่ค่าที่เลือกตอนกางครั้งแรกเท่านั้น — เลื่อนเฉพาะในรายการ ไม่ใช้
     scrollIntoView ซึ่งลากตัวโมดัลทั้งกล่องเลื่อนตามไปด้วย */
  useEffect(() => {
    const el = list.current;
    const on = el?.querySelector<HTMLElement>("[data-on]");
    if (el && on) el.scrollTop = on.offsetTop - el.clientHeight / 2 + on.clientHeight / 2;
  }, []);

  return (
    <div className="flex w-12 flex-none flex-col">
      <span className="pb-1 text-center text-11 text-mut">{label}</span>
      <div ref={list} className="relative flex max-h-[232px] flex-col gap-0.5 overflow-y-auto pr-0.5">
        {items.map((n) => {
          const on = n === value;
          return (
            <button
              key={n}
              type="button"
              data-on={on ? "" : undefined}
              disabled={disabled(n)}
              onClick={() => onPick(n)}
              className={`flex-none rounded-selector py-1 text-center font-mono text-12 tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                on ? "bg-primary font-semibold text-primary-content" : "text-mut hover:bg-base-200 hover:text-ink"
              }`}
            >
              {pad2(n)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** แก้วันเวลาของลายเซ็นที่ลงไปแล้ว (เช่น กด “ใช้ลายเซ็นของฉัน” ซึ่งลงทันทีด้วยเวลาปัจจุบัน) */
export function SignedAtModal({
  title,
  subtitle,
  value,
  onSave,
  onClose,
}: {
  title: string;
  subtitle?: string;
  value: string;
  onSave: (signedAt: string) => void;
  onClose: () => void;
}) {
  const [next, setNext] = useState<string | null>(value);

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width="480px"
      tone="plain"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2.5 text-13 transition-colors hover:border-primary/40"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onSave(resolveSignedAt(next))}
            className="btn-pri px-4 py-2.5 text-13 font-medium"
          >
            บันทึกวันเวลา
          </button>
        </div>
      }
    >
      <SignedAtPicker value={next} onChange={setNext} defaultOpen />
    </ModalShell>
  );
}
