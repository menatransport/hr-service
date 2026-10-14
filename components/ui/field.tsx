"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Popover as RPopover, Select as RSelect } from "radix-ui";
import { DayPicker } from "react-day-picker";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * ฟอร์มคอนโทรลกลางของระบบ — ทุกหน้าดึงจากไฟล์นี้ไฟล์เดียว
 *
 * dropdown สร้างบน **Radix Select** (headless ไม่มีสไตล์ติดมา) แทน `<select>`
 * ของเบราว์เซอร์ จึงจัดสไตล์ด้วย token ของธีม `hrs` ได้ทุกจุด — รวมถึงรายการ
 * ที่กางออก ซึ่ง `<select>` ทำไม่ได้ — โดยยังได้ portal / คีย์บอร์ด / typeahead /
 * a11y มาครบ
 *
 * responsive สองแกน:
 * - จอ ≥sm รายการเป็น popover เกาะ trigger กว้างเท่า trigger
 *   สูงไม่เกินที่วิวพอร์ตเหลือ
 * - จอ <sm ตกลงเป็น bottom sheet เต็มความกว้าง แตะง่ายขึ้น (ตัวอักษร/ระยะโตขึ้น)
 *   — กฎอยู่ที่ `[data-hrs-dropdown]` ใน `app/globals.css`
 *
 * dropdown ที่ตัวเลือกเยอะ (≥ `SEARCH_THRESHOLD`) จะมีช่องค้นหาให้เองโดยอัตโนมัติ
 * บังคับเปิด/ปิดได้ด้วย prop `searchable`
 *
 * ทุกฟิลด์รับ `hint` เพื่อบอกว่า “ให้กรอกอะไร” ใต้ช่อง และรับ `size`:
 * `md` = ฟอร์มฝั่ง desk (ค่าเริ่มต้น) · `lg` = ฟอร์มบนมือถือที่ช่องใหญ่กว่า
 */

/* ------------------------------------------------------------------ ชิ้นร่วม */

export type FieldSize = "md" | "lg";

const box = "w-full border bg-base-100 outline-none transition-colors";
const boxSize: Record<FieldSize, string> = {
  md: "rounded-field px-3.5 py-2.5 text-13-5",
  lg: "rounded-box px-3.5 py-3 text-13-5",
};
const enabled =
  "field-ring border-line hover:border-primary/40 focus:border-primary/60 data-[state=open]:border-primary/60 placeholder:text-mut";
// พื้นสีเทาบอกว่าแก้ไม่ได้อยู่แล้ว ตัวอักษรจึงคงสี ink ไว้ให้อ่านง่าย
const disabledBox =
  "border-line bg-base-200 text-ink cursor-not-allowed placeholder:text-mut";

interface FieldBase {
  id: string;
  label: string;
  /** ซ่อน label ไว้ให้ screen reader อย่างเดียว (ช่องที่บริบทชัดอยู่แล้ว) */
  srLabel?: boolean;
  /** เนื้อหาชิดขวาแถวเดียวกับ label เช่นชื่อกลุ่มเรื่องที่เลือกไว้ */
  labelRight?: React.ReactNode;
  hint?: string;
  /** ไม่บังคับกรอก — ตัดดอกจันแดงกับ `aria-required` ออก (ค่าเริ่มต้นคือบังคับ) */
  optional?: boolean;
  readOnly?: boolean;
  size?: FieldSize;
  className?: string;
}

/**
 * ป้ายชื่อฟิลด์ — ทำเครื่องหมายทางเดียวคือ “บังคับ” เท่านั้น
 * บังคับ → ดอกจันแดง · ไม่บังคับ → ไม่มีอะไร (ไม่ต้องเขียนบอก ให้ป้ายสะอาด)
 *
 * ดอกจันเป็น `aria-hidden` เพราะ screen reader อ่านจาก `aria-required` ของตัวคอนโทรลแทน
 * ถ้าอ่านทั้งสองทางจะได้ยินซ้ำ
 */
function Label({
  htmlFor,
  children,
  required,
  size = "md",
  right,
  sr,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  size?: FieldSize;
  right?: React.ReactNode;
  sr?: boolean;
}) {
  const text = (
    <label
      htmlFor={htmlFor}
      className={
        sr
          ? "sr-only"
          : // label เป็น mut ให้ต่างจากค่าที่กรอก (ink) — อ่านแยกออกว่าอันไหนหัวข้อ อันไหนคำตอบ
            `text-mut ${size === "lg" ? "text-sm font-semibold" : "text-12-5 font-medium"}`
      }
    >
      {children}
      {required && !sr ? (
        <span aria-hidden className="font-normal text-alert">
          {" "}
          *
        </span>
      ) : null}
    </label>
  );

  if (sr || !right) return text;
  return (
    <div className="flex items-baseline justify-between gap-3">
      {text}
      {right}
    </div>
  );
}

function Hint({ children }: { children?: string }) {
  if (!children) return null;
  return <p className="text-11-5 text-mut text-pretty">{children}</p>;
}

/** โครงเดียวกันทุกฟิลด์: label → hint → ตัวคอนโทรล */
function Frame({
  id,
  label,
  srLabel,
  labelRight,
  hint,
  optional,
  size = "md",
  className = "",
  children,
}: FieldBase & { children: React.ReactNode }) {
  return (
    <div
      className={`flex flex-col ${size === "lg" ? "gap-2.5" : "gap-1.5"} ${className}`}
    >
      <Label
        htmlFor={id}
        required={!optional}
        size={size}
        right={labelRight}
        sr={srLabel}
      >
        {label}
      </Label>
      <Hint>{hint}</Hint>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ ช่องพิมพ์ */

export function TextField({
  value,
  onChange,
  placeholder,
  type = "text",
  ...frame
}: FieldBase & {
  /** ไม่ส่ง value/onChange = ปล่อยให้เป็น uncontrolled (ช่องที่ยังไม่ต่อ state) */
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  /** ไม่มี `date` โดยตั้งใจ — ช่องวันที่ต้องใช้ `DateField` ท้ายไฟล์นี้ (ดูเหตุผลที่นั่น) */
  type?: "text" | "email" | "tel";
}) {
  const { id, readOnly, optional, size = "md" } = frame;
  return (
    <Frame {...frame}>
      <input
        id={id}
        type={type}
        value={value}
        defaultValue={value === undefined ? "" : undefined}
        aria-required={optional ? undefined : true}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`${box} ${boxSize[size]} ${readOnly ? disabledBox : enabled}`}
      />
    </Frame>
  );
}

export function TextareaField({
  value,
  onChange,
  placeholder,
  rows = 3,
  resize = true,
  mono = false,
  ...frame
}: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  resize?: boolean;
  /** ตัวอักษรความกว้างเท่ากัน — สำหรับช่องที่พิมพ์โค้ด/JSON (คอนโซล API Docs) */
  mono?: boolean;
}) {
  const { id, readOnly, optional, size = "md" } = frame;
  return (
    <Frame {...frame}>
      <textarea
        id={id}
        rows={rows}
        value={value}
        aria-required={optional ? undefined : true}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={mono ? false : undefined}
        className={`${box} ${boxSize[size]} leading-relaxed ${
          resize ? "resize-y" : "resize-none"
        } ${mono ? "font-mono text-12" : ""} ${readOnly ? disabledBox : enabled}`}
      />
    </Frame>
  );
}

/**
 * ช่องใส่ “ชื่อหลายชื่อ” เป็นชิป — พิมพ์แล้วกด Enter หรือจุลภาคเพื่อเพิ่มทีละชื่อ
 *
 * ใช้กับรายการสั้น ๆ ที่**ไม่มีชุดตัวเลือกตายตัว** (เช่นผู้เกี่ยวข้องกับเคส ซึ่งอาจเป็น
 * คนนอกบริษัท) — ถ้าเลือกจากรายการที่รู้ล่วงหน้าได้ ให้ใช้ `SelectField` แทน
 *
 * ที่ต้องระวัง:
 * - **`Enter` ต้อง `preventDefault`** ไม่งั้นฟอร์มที่ครอบอยู่จะถูก submit ตั้งแต่ชื่อแรก
 * - ข้อความที่ค้างในช่องตอนคลิกออก **ถูกเพิ่มให้เลย** — ผู้ใช้ที่ไม่ได้กด Enter
 *   จะได้ไม่เสียสิ่งที่พิมพ์ไปเงียบ ๆ
 * - วางข้อความที่มีจุลภาค/ขึ้นบรรทัดใหม่ = เพิ่มทีเดียวหลายชื่อ
 */
export function TagsField({
  value,
  onChange,
  placeholder,
  max,
  ...frame
}: FieldBase & {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** เพิ่มได้สูงสุดกี่ชิป — ถึงเพดานแล้วช่องพิมพ์จะถูกซ่อน */
  max?: number;
}) {
  const { id, readOnly, optional, size = "md" } = frame;
  const [draft, setDraft] = useState("");

  const full = max !== undefined && value.length >= max;

  function add(raw: string) {
    const next = [...value];
    for (const piece of raw.split(/[,\n]/)) {
      const name = piece.trim();
      if (!name) continue;
      if (max !== undefined && next.length >= max) break;
      // กันชื่อซ้ำแบบไม่สนตัวพิมพ์ — เซิร์ฟเวอร์ก็ตัดซ้ำอีกชั้น
      if (next.some((v) => v.toLowerCase() === name.toLowerCase())) continue;
      next.push(name);
    }
    setDraft("");
    if (next.length !== value.length) onChange(next);
  }

  return (
    <Frame {...frame}>
      <div
        className={`${box} ${boxSize[size]} ${
          readOnly ? disabledBox : `${enabled} focus-within:border-primary/60`
        } flex flex-wrap items-center gap-1.5`}
      >
        {value.map((name) => (
          <span
            key={name}
            className="flex max-w-full items-center gap-1 rounded-full bg-soft py-1 pr-1.5 pl-2.5 text-12 text-primary"
          >
            <span className="truncate">{name}</span>
            {readOnly ? null : (
              <button
                type="button"
                aria-label={`นำ ${name} ออก`}
                onClick={() => onChange(value.filter((v) => v !== name))}
                className="flex size-4 flex-none items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/15 hover:text-primary"
              >
                <X size={11} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </span>
        ))}

        {readOnly || full ? null : (
          <input
            id={id}
            type="text"
            value={draft}
            aria-required={optional ? undefined : true}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => add(draft)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add(draft);
                return;
              }
              // ช่องว่างเปล่า + Backspace = ถอนชิปล่าสุด (พฤติกรรมมาตรฐานของช่องแบบนี้)
              if (e.key === "Backspace" && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={value.length ? "" : placeholder}
            className="min-w-[10ch] flex-1 bg-transparent outline-none placeholder:text-mut"
          />
        )}
      </div>
    </Frame>
  );
}

/**
 * กลุ่ม checkbox — ติ๊กได้หลายข้อ ทั้งช่องเป็นปุ่มกด (ไม่ใช่แค่กล่องสี่เหลี่ยมเล็ก ๆ)
 *
 * `<input type="checkbox">` จริงถูกซ่อนด้วย `sr-only` แล้ววาดกล่องเองด้วย token ของธีม
 * — ได้คีย์บอร์ด/screen reader ครบโดยไม่ต้องพึ่งหน้าตาเริ่มต้นของเบราว์เซอร์ซึ่งคุมสีไม่ได้
 *
 * **กฎว่าข้อไหนอยู่ด้วยกันได้ไม่ใช่เรื่องของคอมโพเนนต์นี้** — ส่ง `onToggle(id)` ออกไป
 * ให้ฝั่งกฎธุรกิจตัดสิน (เช่น `toggleWarning()` ที่บังคับว่า “ไม่ได้รับ” อยู่ลำพัง)
 */
export function CheckboxGroupField({
  value,
  onToggle,
  options,
  ...frame
}: FieldBase & {
  value: string[];
  onToggle: (id: string) => void;
  options: { value: string; label: string }[];
}) {
  const { id, readOnly, size = "md" } = frame;

  return (
    <Frame {...frame}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = value.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-2 rounded-field border transition-colors ${
                size === "lg" ? "px-3.5 py-2.5" : "px-3 py-2"
              } text-13 ${
                readOnly
                  ? "cursor-not-allowed border-line bg-base-200 text-mut"
                  : on
                    ? "border-primary/50 bg-soft text-ink"
                    : "border-line hover:border-primary/40"
              }`}
            >
              <input
                type="checkbox"
                id={`${id}-${opt.value}`}
                className="sr-only"
                checked={on}
                disabled={readOnly}
                onChange={() => onToggle(opt.value)}
              />
              <span
                aria-hidden
                className={`flex size-4 flex-none items-center justify-center rounded-[5px] border transition-colors ${
                  on ? "border-primary bg-primary text-primary-content" : "border-line"
                }`}
              >
                {on ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              {opt.label}
            </label>
          );
        })}
      </div>
    </Frame>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  ...frame
}: FieldBase & {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const { id, readOnly, optional, size = "md" } = frame;
  return (
    <Frame {...frame}>
      <input
        id={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={value ?? ""}
        aria-required={optional ? undefined : true}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        placeholder={placeholder}
        className={`${box} ${boxSize[size]} ${readOnly ? disabledBox : enabled}`}
      />
    </Frame>
  );
}

/**
 * ช่องค้นหาแบบมีไอคอนและปุ่มล้าง — ใช้ทั้งฝั่งมือถือและฝั่ง desk
 *
 * มีขนาดเดียว สูง 40px เท่ากับ `Select` ทุกตัว จึงวางเรียงเป็นแถบเครื่องมือ
 * แถวเดียวได้พอดี · เคยมี `size="lg"` ทรงแคปซูลมีเงาสำหรับหน้าค้นหาพนักงาน
 * แต่ถอดออกแล้ว (เจ้าของงานสั่งเอาเงาวาว ๆ ออก 7 ส.ค. 2026)
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  tone = "plain",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** ใช้เป็น aria-label เพราะช่องค้นหาไม่มี label ที่มองเห็น */
  label: string;
  tone?: "plain" | "filled";
  className?: string;
}) {
  return (
    <label
      className={`flex items-center gap-2.5 rounded-field border border-line px-3.5 py-2.5 transition-colors focus-within:border-primary/50 ${
        tone === "filled" ? "bg-base-200" : "bg-base-100"
      } ${className}`}
    >
      <Search size={16} strokeWidth={1.6} className="flex-none text-mut" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-13-5 text-ink outline-none placeholder:text-mut [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="ล้างคำค้นหา"
          className="flex-none text-mut hover:text-ink"
        >
          <X size={15} strokeWidth={1.9} aria-hidden />
        </button>
      ) : null}
    </label>
  );
}

/**
 * แถบเลื่อนค่าต่อเนื่อง — ตอนนี้มีที่เดียวคือซูมรูปใน `AvatarCropper`
 *
 * `accent-primary` คือทางเดียวที่ย้อมหัวจับกับรางของ `<input type="range">`
 * ได้ครบทุกเบราว์เซอร์โดยไม่ต้องเขียน `::-webkit-slider-thumb` เอง และมันอ่าน
 * ค่าจาก token `--color-primary` จึงเปลี่ยนตามธีมมืดให้เอง
 */
export function RangeField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  className = "",
}: {
  id?: string;
  /** aria-label — แถบเลื่อนไม่มีป้ายที่มองเห็น */
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-primary ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ dropdown */

export interface SelectOption {
  value: string;
  label: string;
  /**
   * ไอคอนนำหน้าป้าย **ในรายการที่กางออกเท่านั้น** ไม่ขึ้นบน trigger
   *
   * ตั้งใจให้ไม่ขึ้นบน trigger เพราะป้ายบนปุ่มถูกป้อนเป็นข้อความล้วน
   * (ดูเหตุผลที่ `selectedLabel`) การใส่ไอคอนตรงนั้นต้องรื้อทั้งก้อน
   * และปุ่มที่มีไอคอนของตัวเองอยู่แล้ว (`icon` ของ `Select`) จะชนกัน
   *
   * ตัวเลือกที่ไม่ส่งมาก็เว้นว่าง — ไม่ต้องมีครบทุกตัวในรายการเดียวกัน
   */
  icon?: LucideIcon;
}

export interface SelectGroupOption {
  label: string;
  options: SelectOption[];
}

/**
 * หน้าตาของ trigger — เนื้อในรายการเหมือนกันหมด เปลี่ยนแค่ปุ่มที่กด
 *
 * `field`  ช่องเต็มความกว้างในฟอร์ม
 * `ghost`  ในตาราง: ไร้ขอบ เห็นขอบตอน hover/เปิด
 * `dashed` ชิปเส้นประ “+ มอบหมาย” สำหรับค่าที่ยังว่าง
 * `bare`   ไม่มีกรอบเลย ใช้เมื่อห่ออยู่ในกล่องอื่นแล้ว (เช่นแถบกรอง)
 * `sign`   ตัวใหญ่ไม่มีกรอบ วางบน “เส้นเซ็นชื่อ” ที่กล่องนอกเป็นคนตี (ผู้อนุมัติ)
 */
export type SelectVariant = "field" | "ghost" | "dashed" | "bare" | "sign";

const triggerVariant: Record<SelectVariant, string> = {
  field: "",
  ghost:
    "-mx-1.5 rounded-field border border-transparent bg-transparent px-1.5 py-1 text-13 hover:border-line hover:bg-base-100 data-[state=open]:border-line data-[state=open]:bg-base-100",
  dashed:
    "rounded-full border border-dashed border-line bg-base-100 py-1 pr-2.5 pl-2.5 text-12 text-mut hover:border-primary/50 hover:text-primary data-[state=open]:border-primary/50 data-[state=open]:text-primary",
  bare: "bg-transparent text-13",
  sign: "w-full min-w-0 flex-1 bg-transparent py-1 text-15-5 font-medium data-placeholder:font-normal",
};

/**
 * ตัวเลือกตั้งแต่จำนวนนี้ขึ้นไป ถือว่าไล่หาด้วยตาไม่ไหวแล้ว → ใส่ช่องค้นหาให้
 * (10 = สูงกว่าจำนวนหน่วยงาน 7–8 ตัวในแถบกรอง ซึ่งกวาดตาเจอได้อยู่แล้ว
 * แต่ต่ำกว่าสาเหตุหลัก 34 รายการและรายชื่อผู้อนุมัติ)
 */
const SEARCH_THRESHOLD = 10;

/**
 * วาดตัวเลือกสูงสุดเท่านี้ต่อครั้ง — ที่เหลือหาด้วยการพิมพ์ค้น
 *
 * Radix วาด `Item` ทุกตัวที่ส่งเข้าไป · ช่อง พจส. (2,377 คน) กับรถ (1,409 คัน) ในฟอร์ม
 * ขอสรรหาจึงค้างทุกครั้งที่กด (วัด 14 ต.ค. 2026) · ไม่มีใครเลื่อนหาคนที่ 1,800 ด้วยตาอยู่แล้ว
 * — กรองยังทำกับรายการเต็ม แค่ตัดตอนวาด และค่าที่เลือกไว้ขึ้นเสมอแม้อยู่นอกช่วง
 */
const RENDER_LIMIT = 50;

function capOptions(
  matched: SelectOption[] | undefined,
  value: string,
): SelectOption[] | undefined {
  if (!matched || matched.length <= RENDER_LIMIT) return matched;
  const head = matched.slice(0, RENDER_LIMIT);
  /* ค่าที่เลือกไว้อยู่นอกช่วง → ยกขึ้นบนสุด ให้เห็นเครื่องหมายถูกและ Radix เลื่อนไปหาได้ */
  if (!value || head.some((o) => o.value === value)) return head;
  const picked = matched.find((o) => o.value === value);
  return picked ? [picked, ...head.slice(0, -1)] : head;
}

/**
 * มี dropdown กางอยู่ไหม — ให้ modal ถามก่อนจะปิดตัวเองด้วย Esc
 * (Esc ครั้งเดียวควรปิดแค่ dropdown)
 *
 * ต้องนับเอง ถาม DOM ไม่ได้ เพราะ Radix ฟัง Esc ในเฟส capture แล้ว React 19
 * ถอด dropdown ออกทันทีในการ dispatch เดียวกัน — กว่าตัวฟังของ modal จะได้ทำงาน
 * ก็ไม่เหลืออะไรใน DOM ให้เห็นแล้ว · ค่าจึงค้างต่ออีก 1 tick หลังปิด
 */
let openDropdowns = 0;
export const isDropdownOpen = () => openDropdowns > 0;

/**
 * ลงทะเบียน overlay ที่กางอยู่ให้ `isDropdownOpen()` เห็น
 *
 * แชร์กับ popover ตัวอื่นที่ต้องกิน Esc ก่อน modal เหมือนกัน (เช่น `InfoTip`)
 * — ตัวนับค้างต่ออีก 1 tick หลังปิดด้วยเหตุผลข้างบน
 */
export function useOverlayCount(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openDropdowns += 1;
    return () => {
      setTimeout(() => {
        openDropdowns -= 1;
      }, 0);
    };
  }, [open]);
}

/**
 * ช่องค้นหาหัวรายการ — mount พร้อม `Content` จึงล้างคำค้นเองทุกครั้งที่ปิด
 *
 * Radix Select ไม่ได้ออกแบบมาให้มีช่องพิมพ์ข้างใน จึงต้องกัน 2 อย่าง:
 * 1. **typeahead** ของ Radix อ่านทุกปุ่มที่กดแล้วกระโดดไปหารายการ → ต้อง
 *    `stopPropagation` ทุกคีย์ ยกเว้นคีย์ที่อยากให้ Radix จัดการต่อ (ลูกศร/Esc/Tab)
 * 2. **โฟกัส** ตอนเปิด Radix ยิงโฟกัสไปที่รายการที่เลือกไว้ (ใน layout effect)
 *    → แย่งกลับมาที่ช่องค้นหาใน `requestAnimationFrame` ซึ่งทำงานทีหลัง
 */
function SearchBox({
  value,
  onChange,
  placeholder,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Enter = เลือกรายการแรกที่ค้นเจอ — ไม่ส่งมาแปลว่าไม่มีรายการให้เลือก */
  onPick?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // จอสัมผัสไม่ต้องโฟกัสเอง ไม่งั้นคีย์บอร์ดเด้งทับ bottom sheet ทันทีที่เปิด
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const id = requestAnimationFrame(() =>
      ref.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="flex flex-none items-center gap-2 border-b border-line px-3 py-2 max-sm:px-4 max-sm:py-2.5">
      <Search size={15} strokeWidth={1.6} className="flex-none text-mut" aria-hidden />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onPick?.();
            return;
          }
          // ปล่อยลูกศร/Esc/Tab ให้ Radix เลื่อนรายการและปิดกล่องตามปกติ
          if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(e.key)) {
            e.stopPropagation();
          }
        }}
        placeholder={placeholder}
        aria-label="ค้นหาในรายการ"
        autoComplete="off"
        /* จอเล็กใช้ 16px เพราะ iOS จะซูมหน้าจอเองถ้าตัวอักษรเล็กกว่านี้ */
        className="min-w-0 flex-1 bg-transparent text-13 text-ink outline-none placeholder:text-mut max-sm:text-16"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label="ล้างคำค้นหา"
          className="flex-none text-mut hover:text-ink"
        >
          <X size={14} strokeWidth={1.9} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/**
 * dropdown เดี่ยว ๆ ไม่มี label — ใช้ตรง ๆ เมื่ออยู่ในตารางหรือแถบกรอง
 * ฟอร์มปกติให้ใช้ `SelectField` ซึ่งห่อตัวนี้ไว้อีกที
 */
export function Select({
  id,
  value,
  onChange,
  options,
  groups,
  placeholder = "เลือก…",
  label,
  disabled,
  variant = "field",
  size = "md",
  icon,
  searchable,
  searchPlaceholder = "ค้นหา…",
  required,
  clearable,
  trigger,
  defaultOpen,
  onOpenChange,
  className = "",
  contentClassName = "",
}: {
  id?: string;
  /** ค่าว่าง = ยังไม่เลือก แล้วจะขึ้น placeholder */
  value: string;
  onChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroupOption[];
  placeholder?: string;
  /** aria-label — ใส่เมื่อไม่มี label ที่มองเห็น */
  label?: string;
  disabled?: boolean;
  variant?: SelectVariant;
  size?: FieldSize;
  /** ไอคอนนำหน้าค่า เช่น + ของชิป “มอบหมาย” */
  icon?: React.ReactNode;
  /** ไม่ส่ง = เปิดช่องค้นหาเองเมื่อตัวเลือกเยอะกว่า `SEARCH_THRESHOLD` */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** บังคับเลือก — `SelectField` ส่งมาให้ตรงกับดอกจันบน label */
  required?: boolean;
  /**
   * มีปุ่ม × ล้างค่าที่เลือกไว้ ให้กลับไปเป็น `""` (placeholder)
   *
   * **ใส่เฉพาะช่องที่ปลายทางลบค่าได้จริง** — ผู้อนุมัติเป็นตัวอย่างที่ใส่ไม่ได้
   * เพราะ NCAC มีแต่ `define-reviewer` ไม่มีทางถอนออก กดล้างแล้วบันทึกจะเงียบหาย
   */
  clearable?: boolean;
  /**
   * ปุ่มของตัวเอง — ใช้เมื่อสิ่งที่กดไม่ใช่กล่องข้อความ (เช่นช่องสามเหลี่ยมในตาราง
   * ติดตามฝึกงาน ที่ตัวช่องเองคือทั้งตัวแสดงผลและตัวเปิดรายการ)
   *
   * ส่งมาแล้ว `variant` / `icon` / `placeholder` / `className` บน trigger ถูกข้ามทั้งหมด
   * — ปุ่มเป็นของผู้เรียกเต็มตัว · ต้องเป็นอิลิเมนต์เดียวที่ส่งต่อ ref ได้ (`<button>`)
   * เพราะถูกวางผ่าน `asChild` ของ Radix · ส่วนกล่องรายการ ช่องค้นหา และ
   * bottom sheet บนจอเล็กยังเหมือนดรอปดาวน์ตัวอื่นทั้งหมด
   */
  trigger?: React.ReactNode;
  /**
   * กางรายการทันทีที่ถูก mount — คู่กับ `onOpenChange` เพื่อ **สร้างดรอปดาวน์
   * ต่อเมื่อมีคนกดจริง**
   *
   * มีไว้ให้ที่ที่ปุ่มมีเป็นพัน ๆ ตัวในหน้าเดียว (ตารางติดตามฝึกงานมีช่องละหนึ่งปุ่ม
   * ~4,800 ช่อง) — การมี `Select` ประจำทุกปุ่มคือ Radix Root พันกว่าตัวพร้อมกัน
   * ซึ่งหนักพอจะทำให้เบราว์เซอร์ค้างตั้งแต่ตอนวาดหน้า · ปุ่มเปล่าถูกอย่างมาก
   * แล้วค่อยสลับมาเป็นตัวจริงตอนกด
   */
  defaultOpen?: boolean;
  /** รู้ว่ากล่องปิดแล้ว — ผู้เรียกจะได้ถอดตัวเองออกเมื่อใช้คู่กับ `defaultOpen` */
  onOpenChange?: (open: boolean) => void;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [query, setQuery] = useState("");

  useOverlayCount(open);

  const flat = useMemo(
    () => [...(options ?? []), ...(groups?.flatMap((g) => g.options) ?? [])],
    [options, groups],
  );
  const withSearch = searchable ?? flat.length >= SEARCH_THRESHOLD;

  const q = withSearch ? query.trim().toLowerCase() : "";
  const hit = (o: SelectOption) => o.label.toLowerCase().includes(q);
  /**
   * **เรนเดอร์ตัวเลือกเฉพาะตอนเปิดอยู่** — Radix Select วาด `Item` ทุกตัวลง
   * DocumentFragment ที่มองไม่เห็นแม้ตอนปิด ในตารางที่มี `Select` ทุกแถวจึงกลายเป็น
   * แถว × ตัวเลือก (ช่องครูฝึกในตารางคำขอ: 15 แถว × พจส. 588 คน ≈ 8,800 item)
   * ทุกครั้งที่ตารางเมานต์ — สลับแท็บจากผู้สมัครกลับมาจึงหน่วงเป็นวินาที
   *
   * ปิดไว้แล้วไม่เสียอะไร: ป้ายบน trigger ป้อนเองจาก `selectedLabel` อยู่แล้ว
   * (ดูข้างล่าง) และ `Select` ตัวนี้ไม่ได้ส่ง `name` ให้ native `<select>` ของ Radix
   * จึงไม่มีฟอร์มไหนอ่านค่าจากตัวเลือกที่ถูกซ่อน
   */
  const matched = !open ? undefined : q ? options?.filter(hit) : options;
  const shownOptions = capOptions(matched, value);
  const hiddenCount = (matched?.length ?? 0) - (shownOptions?.length ?? 0);
  const shownGroups = !open
    ? undefined
    : q
      ? groups
          ?.map((g) => ({ ...g, options: g.options.filter(hit) }))
          .filter((g) => g.options.length > 0)
      : groups;
  const firstHit = shownOptions?.[0] ?? shownGroups?.[0]?.options[0];

  /**
   * ป้อนป้ายให้ trigger เองเสมอ — ปล่อยให้ Radix ดึงจาก `Item` ที่เลือกไว้ไม่ได้
   * ด้วยสองเหตุผล:
   *
   * 1. `Item` อยู่ใน portal ที่ยัง **ไม่ถูก render ตอน SSR** ปุ่มจึงว่างเปล่า
   *    จนกว่า hydrate เสร็จ (เห็นเป็นดรอปดาวน์เปล่าแวบหนึ่งตอนโหลดหน้า)
   * 2. ในกล่องที่มีช่องค้นหา ค่าจะหายทันทีที่คำค้นกรองรายการนั้นออกไป
   *
   * `undefined` เมื่อยังไม่เลือก (หรือค่าไม่อยู่ในรายการ) → Radix ขึ้น placeholder
   */
  const selectedLabel = flat.find((o) => o.value === value)?.label;

  const shell =
    variant === "field"
      ? `${box} ${boxSize[size]} ${disabled ? disabledBox : enabled} text-left`
      : `${triggerVariant[variant]} transition-colors ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
        }`;

  const showClear = Boolean(clearable && value && !disabled);

  return (
    <RSelect.Root
      /* ส่ง `""` ตรง ๆ ห้ามแปลงเป็น `undefined` — Radix ถือว่า `undefined` คือ
         “ไม่ควบคุม” แล้วกลับไปใช้ค่าที่จำไว้ข้างใน ป้ายบนปุ่มจึงค้างค่าเก่าตอนกดล้าง
         (ตัว Radix เองมองว่า `""` = ยังไม่เลือก จึงขึ้น placeholder ให้ถูกต้อง) */
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setQuery("");
        onOpenChange?.(o);
      }}
    >
      {trigger ? (
        <RSelect.Trigger id={id} aria-label={label} asChild>
          {trigger}
        </RSelect.Trigger>
      ) : (
      <RSelect.Trigger
        id={id}
        aria-label={label}
        aria-required={required || undefined}
        /* ทางลัดคีย์บอร์ดของช่องที่ล้างได้ — ปุ่มล้างจริงอยู่ท้ายรายการซึ่งเดินไปด้วย
           คีย์บอร์ดไม่ได้ (Radix ให้ Tab ปิด dropdown) ตรงนี้จึงเป็นทางเดียวที่เหลือ */
        onKeyDown={(e) => {
          if (!showClear) return;
          if (e.key !== "Backspace" && e.key !== "Delete") return;
          e.preventDefault();
          onChange("");
        }}
        className={`group flex items-center justify-between gap-1.5 outline-none data-placeholder:text-mut ${shell} ${className}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon}
          {/* ต้อง truncate ที่ตัวห่อ — `RSelect.Value` ไม่รับคลาส ป้ายยาว ๆ อย่าง
              “Safety Standards [Compliance] (7)” จะดัน chevron ตกขอบกล่อง */}
          <span className="min-w-0 truncate">
            <RSelect.Value placeholder={placeholder}>{selectedLabel}</RSelect.Value>
          </span>
        </span>
        <RSelect.Icon asChild>
          <ChevronDown
            size={variant === "field" ? 16 : 14}
            strokeWidth={1.8}
            aria-hidden
            className="flex-none text-mut transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </RSelect.Icon>
      </RSelect.Trigger>
      )}

      <RSelect.Portal>
        <RSelect.Content
          data-hrs-dropdown=""
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          /* z-60 ต้องอยู่ตรงนี้ ไม่ใช่ใน CSS — Radix อ่าน z-index ของ content
             แล้วไปใส่เป็น inline style ให้กล่องนอกที่ครอบอยู่ (ต้องชนะ modal z-50) */
          className={`z-60 flex flex-col overflow-hidden border border-line bg-base-100 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] max-h-[min(340px,var(--radix-select-content-available-height))] rounded-box max-sm:max-h-[68dvh] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-[18px] ${
            /* ช่องค้นหาต้องการที่กว้างกว่ารายการเปล่า — เขียนคลาสเต็มทั้งสองแบบ
               เพราะ Tailwind สแกนหาสตริงตรง ๆ ต่อคลาสไม่ได้ */
            withSearch
              ? "min-w-[max(var(--radix-select-trigger-width),240px)]"
              : "min-w-[max(var(--radix-select-trigger-width),190px)]"
          } ${contentClassName}`}
        >
          {/* ที่จับของ bottom sheet — โผล่เฉพาะจอเล็ก */}
          <span
            aria-hidden
            className="mx-auto mt-2.5 mb-0.5 hidden h-1 w-9 flex-none rounded-full bg-line max-sm:block"
          />

          {withSearch ? (
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder={searchPlaceholder}
              onPick={
                firstHit
                  ? () => {
                      onChange(firstHit.value);
                      setOpen(false);
                    }
                  : undefined
              }
            />
          ) : null}

          <RSelect.ScrollUpButton className="flex h-6 flex-none items-center justify-center text-mut">
            <ChevronUp size={14} strokeWidth={1.8} aria-hidden />
          </RSelect.ScrollUpButton>

          <RSelect.Viewport className="min-h-0 flex-1 p-1.5 max-sm:p-2 max-sm:pb-safe">
            {shownOptions?.map((o) => (
              <Item key={o.value} option={o} />
            ))}
            {shownGroups?.map((g) => (
              <RSelect.Group key={g.label}>
                <RSelect.Label className="px-2.5 pt-2.5 pb-1 text-11-5 font-medium text-mut">
                  {g.label}
                </RSelect.Label>
                {g.options.map((o) => (
                  <Item key={o.value} option={o} />
                ))}
              </RSelect.Group>
            ))}

            {hiddenCount > 0 ? (
              <p
                role="status"
                className="px-2.5 pt-2 pb-1.5 text-center text-12 text-mut max-sm:text-13"
              >
                แสดง {shownOptions?.length} จาก {matched?.length.toLocaleString("th-TH")} รายการ
                {withSearch ? " — พิมพ์เพื่อค้นหาเพิ่ม" : ""}
              </p>
            ) : null}

            {q && !firstHit ? (
              <p
                role="status"
                className="px-2.5 py-6 text-center text-13 text-mut max-sm:text-14"
              >
                ไม่พบตัวเลือกที่ตรงกับ “{query.trim()}”
              </p>
            ) : null}
          </RSelect.Viewport>

          <RSelect.ScrollDownButton className="flex h-6 flex-none items-center justify-center text-mut">
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
          </RSelect.ScrollDownButton>

          {/*
           * ปุ่มล้างค่า — อยู่ท้ายรายการ ไม่ใช่ในช่องกรอก เพราะ × บน trigger เบียด
           * ข้อความและกดพลาดง่ายเวลาที่ตั้งใจจะเปิดรายการ
           *
           * เป็น `<button>` ธรรมดา ไม่ใช่ `RSelect.Item` — Radix ห้ามตัวเลือกที่
           * `value=""` และไม่ควรให้ลูกศรวิ่งมาหยุดที่นี่ปนกับตัวเลือกจริง
           */}
          {showClear ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex flex-none items-center gap-2 border-t border-line px-3 py-2.5 text-12-5 text-mut transition-colors hover:bg-base-200 hover:text-alert max-sm:px-4 max-sm:py-3.5 max-sm:pb-safe max-sm:text-15"
            >
              <X size={14} strokeWidth={1.9} aria-hidden className="flex-none" />
              ล้างค่าที่เลือก
            </button>
          ) : null}
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

function Item({ option }: { option: SelectOption }) {
  return (
    <RSelect.Item
      value={option.value}
      className="relative flex cursor-pointer items-center rounded-field py-2 pr-2.5 pl-8 text-13-5 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-40 data-highlighted:bg-base-200 data-[state=checked]:font-medium data-[state=checked]:text-primary max-sm:py-3 max-sm:text-15"
    >
      <RSelect.ItemIndicator className="absolute left-2.5 flex items-center text-primary">
        <Check size={15} strokeWidth={2.4} aria-hidden />
      </RSelect.ItemIndicator>
      {option.icon ? (
        <option.icon
          size={14}
          strokeWidth={1.7}
          aria-hidden
          className="mr-2 flex-none text-mut group-data-[state=checked]:text-primary"
        />
      ) : null}
      <RSelect.ItemText>{option.label}</RSelect.ItemText>
    </RSelect.Item>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  groups,
  placeholder,
  searchable,
  searchPlaceholder,
  clearable,
  ...frame
}: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  options?: SelectOption[];
  groups?: SelectGroupOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** ดูเงื่อนไขการใส่ที่ `Select` — ปลายทางต้องลบค่าได้จริง */
  clearable?: boolean;
}) {
  const { id, readOnly, optional, size = "md" } = frame;
  return (
    <Frame {...frame}>
      <Select
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        groups={groups}
        placeholder={placeholder}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        required={!optional}
        clearable={clearable}
        disabled={readOnly}
        size={size}
      />
    </Frame>
  );
}

/* ------------------------------------------------------- dropdown ของเบราว์เซอร์ */

/**
 * `<select>` ของเบราว์เซอร์แท้ ๆ — **สำหรับหน้าที่กรอกบนมือถือเป็นหลัก**
 *
 * ต่างจาก `SelectField` ข้างบนที่วาดรายการเองด้วย Radix: ตัวนี้ปล่อยให้ระบบ
 * ปฏิบัติการเป็นคนกางรายการ ผู้สมัครจึงได้ตัวเลือกหน้าตาเดียวกับทุกแอปในเครื่อง
 * — วงล้อของ iOS หรือกล่องของ Android — ที่คนขับคุ้นมืออยู่แล้ว ไม่ใช่แผ่นเลื่อน
 * ที่เราออกแบบเอง · ได้ของแถมคือรายการไม่มีทางถูกอะไรบัง ไม่ต้องคำนวณตำแหน่ง
 * และใช้ได้แม้ JS ยังโหลดไม่เสร็จ
 *
 * ฝั่ง `/desk` ยังใช้ `SelectField` ต่อไป เพราะทำงานบนเดสก์ท็อปและต้องการ
 * ช่องค้นหา / กลุ่มตัวเลือก / ไอคอน ซึ่ง `<select>` ทำไม่ได้
 *
 * จัดสไตล์ได้แค่ **ตอนหุบ** — `appearance-none` ถอดลูกศรของระบบออกแล้ววาด
 * chevron เองให้เข้าชุดกับช่องอื่น ส่วนรายการที่กางออกเป็นของระบบ แต่งไม่ได้
 * และไม่ควรแต่ง
 */
export function NativeSelectField({
  value,
  onChange,
  options,
  placeholder,
  ...frame
}: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  /** `icon` ของ `SelectOption` ถูกมองข้าม — `<option>` แสดงได้แต่ข้อความ */
  options: SelectOption[];
  /** บรรทัดที่เห็นตอนยังไม่เลือก · เป็น `<option value="">` ที่เลือกกลับมาไม่ได้ */
  placeholder?: string;
}) {
  const { id, readOnly, optional, size = "md" } = frame;

  return (
    <Frame {...frame}>
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-required={optional ? undefined : true}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          /* ยังไม่เลือก → ตัวอักษรสี mut เท่ากับ placeholder ของช่องพิมพ์
             ไม่งั้นช่องที่ยังว่างจะดูเข้มเท่าช่องที่ตอบแล้ว */
          className={`${box} ${boxSize[size]} appearance-none pr-10 ${
            value ? "" : "text-mut"
          } ${readOnly ? disabledBox : enabled}`}
        >
          {/* `disabled` เมื่อบังคับตอบ — กันไม่ให้เลื่อนกลับมาที่ค่าว่างหลังเลือกแล้ว
              ข้อที่ไม่บังคับยังต้องถอยกลับมาเป็น “ไม่ตอบ” ได้ จึงปล่อยไว้ */}
          <option value="" disabled={!optional}>
            {placeholder ?? "เลือกคำตอบ"}
          </option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-mut"
        />
      </div>
    </Frame>
  );
}

/** ค่าที่อ่านได้อย่างเดียว จัดรูปให้เข้าชุดกับฟิลด์อื่น */
export function ReadOnlyValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <p className="rounded-field border border-line bg-base-200 px-3.5 py-2.5 text-13-5 text-pretty">
        {value}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ ช่องวันที่ */

/**
 * ช่องวันที่แบบ **วว/ดด/ปปปป (พ.ศ.)** พร้อมปฏิทินให้เลือก
 *
 * ไม่ใช้ `<input type="date">` ของเบราว์เซอร์ เพราะรูปแบบที่แสดง**ขึ้นกับภาษาของเครื่อง
 * ผู้ใช้** — เครื่องที่ตั้งภาษาไทยขึ้นปีพุทธศักราช เครื่องอื่นขึ้น ค.ศ. และสลับ
 * วัน/เดือน คนละแบบ ทั้งที่ค่าที่ส่งออกเป็น `YYYY-MM-DD` เหมือนกันหมด
 * ผู้ใช้จึงอ่านวันเดียวกันไม่ตรงกันในแต่ละเครื่อง
 *
 * ตัวปฏิทินใช้ `react-day-picker` (คีย์บอร์ด / a11y / เดินเดือน มาให้ครบ) แต่ **ไม่ได้ใช้
 * สไตล์ของไลบรารี** — ส่ง `classNames` เป็นคลาสของธีมเราเองทุกชิ้น ธีมมืดจึงตามไปเอง
 * และไม่ต้อง import CSS ของไลบรารีมาชนกับ Tailwind
 *
 * ชื่อเดือน/วันมาจาก `formatters` ที่เขียนเอง จึง **ไม่ได้แตะ `Intl`** ตามกฎของโปรเจกต์
 *
 * ค่าที่รับ/ส่งออกยังเป็น `YYYY-MM-DD` (ค.ศ.) เหมือนเดิม — ที่เปลี่ยนคือสิ่งที่ตาเห็น
 */

export const THAI_MONTHS_FULL = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** ปีที่มากกว่านี้ถือว่าเป็น พ.ศ. — ปี ค.ศ. จริงไม่มีทางแตะเลขนี้ในอายุการใช้งานระบบ */
const BUDDHIST_THRESHOLD = 2400;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `2026-08-19` → `19/08/2569` · ค่าที่อ่านไม่ออกคืนสตริงว่าง */
function isoToThaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : "";
}

/**
 * `19/08/2569` (หรือ `19/08/2026`) → `2026-08-19` · `null` เมื่อยังไม่ครบ/ไม่มีอยู่จริง
 *
 * รับทั้ง พ.ศ. และ ค.ศ. เพราะคนพิมพ์มาทั้งสองแบบ — ตัดสินจากขนาดของเลขปี
 * แล้วตรวจย้อนว่ายังเป็นวันเดิม (กัน `31/02` กลายเป็น 3 มี.ค. เงียบ ๆ)
 */
function thaiDateToIso(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const raw = Number(m[3]);
  const year = raw > BUDDHIST_THRESHOLD ? raw - 543 : raw;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** ใส่ `/` ให้เองระหว่างพิมพ์ — ผู้ใช้พิมพ์แต่ตัวเลข */
function maskThaiDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join("/");
}

/** `Date` ท้องถิ่น ↔ `YYYY-MM-DD` — ไม่ผ่าน `toISOString()` ซึ่งเลื่อนวันตามโซนเวลา */
export const isoToDate = (iso: string): Date | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
export const dateToIso = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * ปี (ค.ศ.) ในดรอปดาวน์ของปฏิทิน ใหม่ → เก่า · ย้อน 100 ปีพอสำหรับวันเกิด
 * ล่วงหน้า 10 ปีพอสำหรับวันหมดอายุบัตร · ถ้าค่าที่เปิดอยู่หลุดช่วงก็ขยายให้ครอบ
 */
function calendarYears(shown: number): number[] {
  const now = new Date().getFullYear();
  const max = Math.max(now + 10, shown);
  const min = Math.min(now - 100, shown);
  return Array.from({ length: max - min + 1 }, (_, i) => max - i);
}

/** สไตล์ปฏิทินทั้งชุด — ทุกชิ้นเป็น token ของธีม ไม่มี CSS ของไลบรารีเข้ามาเกี่ยว */
/** สไตล์ปฏิทินชุดเดียวของทั้งระบบ — ปฏิทินที่ฝังในหน้าอื่นต้องหน้าตาเหมือนกัน */
export const dayPickerClassNames = {
  root: "relative",
  months: "flex flex-col",
  month: "flex flex-col gap-2",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "text-13 font-semibold",
  nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
  button_previous:
    "flex size-7 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-35",
  button_next:
    "flex size-7 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink disabled:opacity-35",
  month_grid: "w-full border-collapse",
  weekday: "pb-1 text-11 font-normal text-mut",
  day: "p-[1px] text-center",
  day_button:
    "flex size-8 items-center justify-center rounded-full text-12-5 transition-colors hover:bg-soft",
  today: "[&_button]:font-semibold [&_button]:text-primary",
  selected:
    "[&_button]:bg-primary [&_button]:font-semibold [&_button]:text-primary-content",
  outside: "[&_button]:text-mut/45",
  disabled: "[&_button]:cursor-not-allowed [&_button]:opacity-35",
  hidden: "invisible",
};

export function DateField({
  value,
  onChange,
  ...frame
}: FieldBase & {
  /** `YYYY-MM-DD` · `""` = ยังไม่เลือก */
  value: string;
  onChange: (v: string) => void;
}) {
  const { id, readOnly, optional, size = "md" } = frame;

  const [open, setOpen] = useState(false);
  /** ข้อความในช่องระหว่างพิมพ์ — ยังไม่ครบก็ยังไม่ส่งค่าขึ้นไปข้างบน */
  const [text, setText] = useState(() => isoToThaiDate(value));

  /* ค่าจากข้างบนเปลี่ยน (เลือกจากปฏิทิน / ล้างฟอร์ม) ให้ข้อความตามในการ render เดียวกัน */
  const [syncedTo, setSyncedTo] = useState(value);
  if (syncedTo !== value) {
    setSyncedTo(value);
    setText(isoToThaiDate(value));
  }

  /* คลิกนอกกล่อง / Esc / ปิดเมื่อเลื่อนจอ เป็นงานของ Radix แล้ว — ที่ยังต้องทำเอง
     คือบอก modal ของ /desk ว่ามี overlay กางอยู่ ให้ Esc ครั้งแรกกินแค่ปฏิทิน */
  useOverlayCount(open);

  function type(raw: string) {
    const masked = maskThaiDate(raw);
    setText(masked);

    const iso = thaiDateToIso(masked);
    if (iso) {
      setSyncedTo(iso);
      onChange(iso);
    } else if (!masked) {
      setSyncedTo("");
      onChange("");
    }
  }

  /* พิมพ์ค้างไว้ไม่ครบแล้วคลิกออก — ดึงกลับไปแสดงค่าที่บันทึกไว้จริง ไม่ปล่อยให้จอโกหก */
  const restore = () => setText(isoToThaiDate(value));

  const selected = isoToDate(value);

  /* เดือนที่ปฏิทินกางอยู่ — คุมเองเพื่อให้ดรอปดาวน์เดือน/ปีกระโดดไปได้
     (วันเกิดย้อนไปหลายสิบปี กดลูกศรทีละเดือนไม่ไหว) · เปิดใหม่ทุกครั้งเริ่มที่ค่าที่เลือกไว้ */
  const [month, setMonth] = useState<Date>(() => selected ?? new Date());
  function toggle(next: boolean) {
    if (next) setMonth(selected ?? new Date());
    setOpen(next);
  }
  const years = calendarYears(month.getFullYear());

  return (
    <Frame {...frame}>
      <RPopover.Root open={open} onOpenChange={toggle}>
        {/* `Anchor` ครอบทั้งช่อง ปฏิทินจึงเกาะขอบซ้ายของช่อง ไม่ใช่ขอบปุ่มไอคอน
            ที่อยู่ชิดขวา — ปฏิทินกว้างกว่าปุ่มมาก ถ้าเกาะปุ่มจะล้นออกนอกจอ */}
        <RPopover.Anchor asChild>
          <div className="relative">
            <input
              id={id}
              value={text}
              inputMode="numeric"
              autoComplete="off"
              placeholder="วว/ดด/ปปปป"
              aria-required={optional ? undefined : true}
              disabled={readOnly}
              onChange={(e) => type(e.target.value)}
              onBlur={restore}
              className={`${box} ${boxSize[size]} pr-11 ${readOnly ? disabledBox : enabled}`}
            />

            <RPopover.Trigger
              type="button"
              disabled={readOnly}
              aria-label="เปิดปฏิทิน"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-field text-mut transition-colors hover:text-primary disabled:cursor-not-allowed disabled:hover:text-mut"
            >
              <CalendarDays size={16} strokeWidth={1.8} aria-hidden />
            </RPopover.Trigger>
          </div>
        </RPopover.Anchor>

        <RPopover.Portal>
          {/*
           * ต้องเป็น **portal** ไม่ใช่ `absolute` ในช่อง — ก่อนหน้านี้ปฏิทินถูกแถบ
           * ปุ่มล่างทับ เพราะกล่องแม่ที่เล่นแอนิเมชันขาเข้า (`animate-lift-in`)
           * ทิ้ง `transform` ค้างไว้ = เปิด stacking context ใหม่ · `z-60` ของ
           * ปฏิทินจึงแข่งได้แค่ในกล่องนั้น ไม่มีทางชนะ `z-20` ของแถบปุ่มที่อยู่
           * นอกกล่อง · ออกไปอยู่ที่ `body` แล้วไม่มี transform / overflow / z-index
           * ของใครมาขังได้อีก
           *
           * `collisionPadding` ให้ Radix พลิกปฏิทินขึ้นด้านบนเองเมื่อที่ว่าง
           * ด้านล่างไม่พอ — ช่องวันเกิดมักอยู่ท้ายหน้าจอพอดี
           */}
          <RPopover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            /* z-60 เหมือน `Select.Content` — Radix ยกค่านี้ไปใส่กล่องนอกที่ครอบอยู่
               ต่ำกว่านี้ปฏิทินจะไปอยู่ใต้โมดัลของ /desk */
            className="z-60 rounded-box border border-line bg-base-100 p-2.5 shadow-[0_18px_40px_-16px_rgba(21,32,29,0.4)]"
          >
            {/* หัวปฏิทินทำเอง: ลูกศร + ดรอปดาวน์เดือน/ปี (พ.ศ.) — ใช้ `Select` ของเรา
                ไม่ใช้ `captionLayout="dropdown"` ของไลบรารีซึ่งเป็น `<select>` ดิบ */}
            <div className="mb-2 flex items-center justify-between gap-1">
              <button
                type="button"
                aria-label="เดือนก่อนหน้า"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                disabled={month.getFullYear() <= years[years.length - 1] && month.getMonth() === 0}
                className={dayPickerClassNames.button_previous}
              >
                <ChevronLeft size={16} strokeWidth={1.9} aria-hidden />
              </button>
              <div className="flex items-center gap-1">
                <Select
                  label="เลือกเดือน"
                  variant="ghost"
                  searchable={false}
                  value={String(month.getMonth())}
                  onChange={(v) => setMonth(new Date(month.getFullYear(), Number(v), 1))}
                  options={THAI_MONTHS_FULL.map((name, i) => ({ value: String(i), label: name }))}
                  className="font-semibold"
                />
                <Select
                  label="เลือกปี (พ.ศ.)"
                  variant="ghost"
                  searchPlaceholder="พิมพ์ปี พ.ศ.…"
                  value={String(month.getFullYear())}
                  onChange={(v) => setMonth(new Date(Number(v), month.getMonth(), 1))}
                  options={years.map((y) => ({ value: String(y), label: String(y + 543) }))}
                  className="font-semibold"
                  contentClassName="min-w-36"
                />
              </div>
              <button
                type="button"
                aria-label="เดือนถัดไป"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                disabled={month.getFullYear() >= years[0] && month.getMonth() === 11}
                className={dayPickerClassNames.button_next}
              >
                <ChevronRight size={16} strokeWidth={1.9} aria-hidden />
              </button>
            </div>

            <DayPicker
              mode="single"
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              onSelect={(picked) => {
                if (!picked) return;
                onChange(dateToIso(picked));
                setOpen(false);
              }}
              showOutsideDays
              classNames={{ ...dayPickerClassNames, month_caption: "hidden" }}
              formatters={{
                formatCaption: (month) =>
                  `${THAI_MONTHS_FULL[month.getMonth()]} ${month.getFullYear() + 543}`,
                formatWeekdayName: (day) => THAI_WEEKDAYS[day.getDay()],
              }}
              /* ป้ายที่ screen reader อ่าน — ไม่ทับจะเป็นภาษาอังกฤษของไลบรารี
                 ทั้งที่ทุกอย่างบนจอเป็นไทย */
              labels={{
                labelDayButton: (day) =>
                  `${day.getDate()} ${THAI_MONTHS_FULL[day.getMonth()]} ${day.getFullYear() + 543}`,
                labelPrevious: () => "เดือนก่อนหน้า",
                labelNext: () => "เดือนถัดไป",
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left" ? (
                    <ChevronLeft size={16} strokeWidth={1.9} aria-hidden />
                  ) : (
                    <ChevronRight size={16} strokeWidth={1.9} aria-hidden />
                  ),
              }}
            />
          </RPopover.Content>
        </RPopover.Portal>
      </RPopover.Root>
    </Frame>
  );
}
