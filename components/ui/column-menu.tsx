"use client";

import { useMemo, useRef, useState } from "react";
import { Popover as RPopover } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ListFilter,
  Search,
  X,
} from "lucide-react";

import { useOverlayCount } from "@/components/ui/field";

/**
 * เมนูประจำคอลัมน์ของตาราง — **ไอคอนเดียวคุมทั้งการเรียงและการกรอง**
 * แบบเดียวกับหัวตารางของ Excel / Google Sheets
 *
 * เดิมหัวคอลัมน์มีสองปุ่ม (กดป้ายเพื่อเรียง + กรวยเพื่อกรอง) ซึ่งกินที่สองเท่า
 * และต้องจำว่าอันไหนทำอะไร · รวมเป็นปุ่มเดียวแล้วเปิดเมนูที่มีทุกอย่าง
 * เป็นท่าที่คนใช้ตารางคุ้นอยู่แล้วจากโปรแกรมตารางคำนวณ
 *
 * สองแบบ: `head` คือหัวคอลัมน์เต็มใบ (ป้าย + ไอคอนสถานะ ทั้งก้อนเป็นปุ่มเดียว)
 * · `chip` คือปุ่มกลมบนแถบเครื่องมือ สำหรับจอแคบที่ไม่มีหัวตารางให้กด
 *
 * ตัวไอคอนบอกสถานะของคอลัมน์นั้นในตัวเอง:
 * - กรองอยู่ → ป้ายเป็นสี primary พร้อมตัวเลขค่าที่ติ๊ก (สถานะนี้สำคัญสุด
 *   เพราะเป็นเหตุผลที่แถวหายไปจากตาราง จึงเด่นกว่าการเรียงเสมอ)
 * - เรียงอยู่ (ไม่ได้กรอง) → ลูกศรขึ้น/ลงสี primary
 * - ปกติ → กรวยจาง ๆ **ที่ยังเห็นได้ตลอดเวลา** ไม่ใช่โผล่ตอน hover
 *   ไม่งั้นไม่มีใครรู้ว่าคอลัมน์นี้กดได้
 *
 * `sort` กับ `filter` ใส่มาอย่างใดอย่างหนึ่งหรือทั้งคู่ก็ได้ — คอลัมน์ชื่อคนขับ
 * มีแต่เรียง ส่วนตัวกรองลูกค้าบนแถบเครื่องมือมีแต่กรอง
 */

export interface ColumnFilterOption {
  value: string;
  label: string;
  /** จำนวนแถวที่ตรงกับค่านี้ — ช่วยให้รู้ว่าติ๊กแล้วจะเหลือเท่าไรก่อนติ๊ก */
  count?: number;
}

export type SortDir = "asc" | "desc";

export interface ColumnSort {
  /** ทิศที่เรียงอยู่ของคอลัมน์นี้ · `null` = คอลัมน์นี้ไม่ได้ถูกใช้เรียง */
  dir: SortDir | null;
  /** ป้ายของการเรียงขึ้น เช่น “ก → ฮ”, “น้อย → มาก”, “ใกล้หมดอายุก่อน” */
  ascLabel: string;
  descLabel: string;
  /** ส่ง `null` = เลิกเรียงด้วยคอลัมน์นี้ */
  onSort: (dir: SortDir | null) => void;
}

export interface ColumnFilter {
  options: ColumnFilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/** ตัวเลือกเกินจำนวนนี้ถือว่าไล่หาด้วยตาไม่ไหว → ใส่ช่องค้นหาให้ (เกณฑ์เดียวกับ `Select`) */
const SEARCH_THRESHOLD = 8;

/** อาเรย์ว่างตัวเดียวใช้ร่วมกัน — `?? []` สดใหม่ทุกรอบจะทำให้ `useMemo` ข้างล่างคิดใหม่ทุกเฟรม */
const NO_OPTIONS: ColumnFilterOption[] = [];
const NO_SELECTION: string[] = [];

export function ColumnMenu({
  label,
  sort,
  filter,
  /** `head` = ปุ่มไอคอนในหัวตาราง · `chip` = ปุ่มมีป้ายชื่อ ใช้บนแถบเครื่องมือ */
  variant = "head",
  align = "start",
}: {
  label: string;
  sort?: ColumnSort;
  filter?: ColumnFilter;
  variant?: "head" | "chip";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useOverlayCount(open);

  const options = filter?.options ?? NO_OPTIONS;
  const selected = filter?.selected ?? NO_SELECTION;
  const withSearch = options.length >= SEARCH_THRESHOLD;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const picked = selected.length;
  const sorted = sort?.dir ?? null;

  function toggle(value: string) {
    if (!filter) return;
    filter.onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  }

  /**
   * แถวบนสุดของรายการ เป็นสวิตช์สองทาง:
   * - ยังไม่ติ๊กอะไร → ติ๊กทุกค่าที่เห็นอยู่ (ใช้คู่กับช่องค้นหา: ค้น “ลาด” แล้ว
   *   กดทีเดียวได้ทุกแพล้นท์ที่ขึ้นต้นด้วยลาด)
   * - ติ๊กไว้บ้างแล้ว → ล้างทั้งคอลัมน์ กลับไปสถานะไม่กรอง
   *
   * ติ๊กครบทุกค่ากับไม่ติ๊กเลยกรองได้ผลเท่ากัน (ไม่มีแถวไหนถูกคัดออก) ต่างกันแค่
   * ไอคอนบนหัวคอลัมน์ — ไม่ติ๊กเลยจะกลับเป็นปกติ บอกได้ทันทีว่าคอลัมน์นี้ไม่ได้กรองอยู่
   */
  const allShownPicked = shown.length > 0 && shown.every((o) => selected.includes(o.value));

  function toggleAll() {
    if (!filter) return;
    if (picked) filter.onChange([]);
    else filter.onChange(shown.map((o) => o.value));
  }

  /* ---------------------------------------------------------- ปุ่มเปิดเมนู */

  const StateIcon = picked ? ListFilter : sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronDown;

  const stateTitle = [
    picked ? `กรองอยู่ ${picked} ค่า` : null,
    sorted ? `เรียง${sorted === "asc" ? sort!.ascLabel : sort!.descLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const trigger =
    variant === "head" ? (
      /*
        หัวคอลัมน์แบบสเปรดชีต — **ทั้งป้ายคือปุ่ม** ไม่ใช่ไอคอนเล็ก ๆ ท้ายป้าย

        รูปแบบเดียวกับหัวคอลัมน์ของตารางผู้สมัคร (`sheet-column.tsx`) เพราะฝ่ายบุคคล
        สลับสองหน้านี้ไปมาทั้งวัน หัวตารางสองแบบจึงต้องกดท่าเดียวกัน · พื้นที่กดเต็มความกว้าง
        คอลัมน์ ไม่ใช่ไอคอน 24px ที่ต้องเล็ง
      */
      <button
        type="button"
        aria-label={`เรียงและกรอง${label}`}
        title={stateTitle || `เรียงและกรอง${label}`}
        className={`flex w-full cursor-pointer items-center gap-1.5 py-2.5 font-mono text-10-5 font-semibold tracking-[0.07em] whitespace-nowrap uppercase transition-colors ${
          picked || sorted ? "text-primary" : "text-mut hover:text-ink"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        {sorted === "asc" ? (
          <ArrowUp size={12} strokeWidth={2.2} aria-hidden className="flex-none" />
        ) : sorted === "desc" ? (
          <ArrowDown size={12} strokeWidth={2.2} aria-hidden className="flex-none" />
        ) : null}
        <ListFilter
          size={12}
          strokeWidth={2}
          aria-hidden
          className={`flex-none ${picked ? "" : "opacity-45"}`}
        />
        {picked ? (
          <span className="flex-none rounded-selector bg-primary px-1 text-9-5 text-primary-content tabular-nums">
            {picked}
          </span>
        ) : null}
      </button>
    ) : (
      <button
        type="button"
        aria-label={`เรียงและกรอง${label}`}
        className={`flex flex-none cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-12-5 transition-colors ${
          picked || sorted
            ? "border-primary bg-soft font-medium text-primary"
            : "border-line bg-base-100 text-mut hover:border-primary/40 hover:text-ink"
        }`}
      >
        <StateIcon size={13} strokeWidth={2.2} aria-hidden />
        {label}
        {picked ? (
          <span className="rounded-full bg-primary px-1.5 text-10-5 font-semibold text-primary-content">
            {picked}
          </span>
        ) : null}
      </button>
    );

  /* --------------------------------------------------------------- เมนู */

  return (
    <RPopover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>

      <RPopover.Portal>
        <RPopover.Content
          data-hrs-dropdown=""
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            if (!withSearch) return;
            // โฟกัสไปที่ช่องค้นหาแทนรายการแรก — ตัวเลือกเยอะคนจะพิมพ์ก่อนเสมอ
            e.preventDefault();
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
          /* จอเล็กตกลงเป็นแผ่นเลื่อนขึ้นจากขอบล่างเต็มความกว้าง — กฎอยู่ที่
             `[data-hrs-dropdown]` ใน `app/globals.css` ซึ่งบังคับกล่องนอกเป็น
             `fixed` เต็มจอ คลาสตรงนี้จึงต้องเป็น `w-full` ให้เข้ากัน ไม่ใช่ความกว้างคงที่ */
          className="z-60 flex max-h-[min(400px,var(--radix-popover-content-available-height))] w-64 flex-col overflow-hidden rounded-box border border-line bg-base-100 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] max-sm:max-h-[72dvh] max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-[18px]"
        >
          {/* ที่จับของแผ่นเลื่อน — โผล่เฉพาะจอเล็ก เหมือน dropdown ตัวอื่นในระบบ */}
          <span
            aria-hidden
            className="mx-auto mt-2.5 mb-0.5 hidden h-1 w-9 flex-none rounded-full bg-line max-sm:block"
          />

          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="min-w-0 truncate text-12 font-semibold">{label}</span>
            {picked || sorted ? (
              <button
                type="button"
                onClick={() => {
                  filter?.onChange([]);
                  sort?.onSort(null);
                }}
                className="flex flex-none cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-11-5 text-mut transition-colors hover:text-alert"
              >
                <X size={12} strokeWidth={2.2} aria-hidden />
                ล้างคอลัมน์นี้
              </button>
            ) : null}
          </div>

          {sort ? (
            <div className="flex flex-col gap-0.5 border-b border-line p-1.5">
              <MenuItem
                icon={ArrowUp}
                active={sorted === "asc"}
                onClick={() => {
                  sort.onSort(sorted === "asc" ? null : "asc");
                  setOpen(false);
                }}
              >
                เรียง {sort.ascLabel}
              </MenuItem>
              <MenuItem
                icon={ArrowDown}
                active={sorted === "desc"}
                onClick={() => {
                  sort.onSort(sorted === "desc" ? null : "desc");
                  setOpen(false);
                }}
              >
                เรียง {sort.descLabel}
              </MenuItem>
            </div>
          ) : null}

          {filter ? (
            <>
              {withSearch ? (
                <label className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <Search size={14} strokeWidth={1.7} aria-hidden className="flex-none text-mut" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`ค้นหาใน${label}…`}
                    aria-label={`ค้นหาในรายการ${label}`}
                    className="min-w-0 flex-1 bg-transparent text-12-5 outline-none placeholder:text-mut [&::-webkit-search-cancel-button]:hidden"
                  />
                </label>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {shown.length === 0 ? (
                  <p className="px-2 py-4 text-center text-12 text-mut">ไม่พบตัวเลือก</p>
                ) : (
                  <>
                    <CheckRow
                      on={allShownPicked}
                      partial={picked > 0 && !allShownPicked}
                      onToggle={toggleAll}
                      label={picked ? "ล้างที่ติ๊กไว้" : "เลือกทั้งหมด"}
                      bold
                    />
                    <span aria-hidden className="my-1 block h-px bg-line" />

                    {shown.map((option) => (
                      <CheckRow
                        key={option.value}
                        on={selected.includes(option.value)}
                        onToggle={() => toggle(option.value)}
                        label={option.label}
                        count={option.count}
                      />
                    ))}
                  </>
                )}
              </div>
            </>
          ) : null}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

function MenuItem({
  icon: Icon,
  active,
  onClick,
  children,
}: {
  icon: typeof ArrowUp;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 text-left text-12-5 transition-colors ${
        active ? "bg-soft font-medium text-primary" : "hover:bg-base-200"
      }`}
    >
      <Icon
        size={13}
        strokeWidth={2}
        aria-hidden
        className={`flex-none ${active ? "text-primary" : "text-mut"}`}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? <Check size={12} strokeWidth={2.6} aria-hidden className="flex-none" /> : null}
    </button>
  );
}

function CheckRow({
  on,
  partial,
  onToggle,
  label,
  count,
  bold,
}: {
  on: boolean;
  partial?: boolean;
  onToggle: () => void;
  label: string;
  count?: number;
  bold?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-field px-2 py-1.5 transition-colors hover:bg-base-200">
      <input
        type="checkbox"
        className="sr-only"
        checked={on}
        // ครึ่งทาง = ติ๊กบางค่า · ต้องสั่งผ่าน DOM เพราะ React ไม่มี prop ให้
        ref={(el) => {
          if (el) el.indeterminate = Boolean(partial);
        }}
        onChange={onToggle}
      />
      <span
        aria-hidden
        className={`flex size-4 flex-none items-center justify-center rounded-[5px] border transition-colors ${
          on || partial ? "border-primary bg-primary text-primary-content" : "border-line"
        }`}
      >
        {on ? (
          <Check size={11} strokeWidth={3} />
        ) : partial ? (
          <span className="h-0.5 w-2 rounded-full bg-current" />
        ) : null}
      </span>
      <span className={`min-w-0 flex-1 truncate text-12-5 ${bold ? "font-medium" : ""}`}>
        {label}
      </span>
      {count !== undefined ? (
        <span className="flex-none text-11 text-mut tabular-nums">
          {count.toLocaleString("th-TH")}
        </span>
      ) : null}
    </label>
  );
}
