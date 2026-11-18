"use client";

import { useState } from "react";
import { Popover, Select } from "radix-ui";
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown, Minus, Search, Table2 } from "lucide-react";

/**
 * ชิ้นประกอบหน้าแดชบอร์ด (แนว shadcn/ui · สีจาก `dashboard.css` ไม่ใช่ธีมระบบ)
 *
 * เพิ่มกราฟใหม่ = `<DashCard title … table={…}>` + กราฟ recharts ข้างใน · ส่ง `table` ทุกครั้ง —
 * เป็นมุมมองตารางของกราฟ (คนที่แยกสีไม่ออก/อยากได้ตัวเลขเป๊ะ) และปุ่มสลับขึ้นให้เอง
 */

export interface TableView {
  columns: { label: string; num?: boolean }[];
  rows: (string | number)[][];
}

export function DashCard({
  title,
  sub,
  action,
  table,
  className = "",
  children,
}: {
  title: string;
  sub?: React.ReactNode;
  /** มุมขวาบน เช่น คำอธิบายสี ตัวเลือก */
  action?: React.ReactNode;
  table?: TableView;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);

  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col rounded-2xl border border-(--dash-ring) bg-(--dash-surface) shadow-(--dash-shadow) ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-15 font-semibold tracking-tight text-(--dash-ink)">{title}</h3>
          {sub ? <p className="mt-1 text-12 leading-relaxed text-(--dash-mut)">{sub}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {action}
          {table ? (
            <div role="group" aria-label="มุมมอง" className="flex rounded-lg bg-(--dash-sunken) p-0.5 ring-1 ring-(--dash-ring) ring-inset">
              {[
                { on: !asTable, icon: BarChart3, label: "กราฟ", set: false },
                { on: asTable, icon: Table2, label: "ตาราง", set: true },
              ].map(({ on, icon: Icon, label, set }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  title={label}
                  onClick={() => setAsTable(set)}
                  className={`grid size-7 cursor-pointer place-items-center rounded-md transition-colors ${
                    on ? "bg-(--dash-surface) text-(--dash-ink) shadow-(--dash-shadow)" : "text-(--dash-mut) hover:text-(--dash-ink)"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.8} aria-hidden />
                  <span className="sr-only">{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <div className="min-w-0 flex-1 px-5 pb-4">{asTable && table ? <DataTable {...table} /> : children}</div>
    </section>
  );
}

function DataTable({ columns, rows }: TableView) {
  return (
    <div className="max-h-96 overflow-auto rounded-xl border border-(--dash-grid)">
      <table className="w-full border-collapse text-12-5">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                className={`sticky top-0 border-b border-(--dash-grid) bg-(--dash-sunken) px-3 py-2 text-12 font-medium whitespace-nowrap text-(--dash-ink-2) ${
                  c.num ? "text-right" : "text-left"
                }`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-(--dash-grid) transition-colors last:border-0 hover:bg-(--dash-hover)">
              {r.map((v, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 ${columns[j]?.num ? "text-right tabular-nums" : ""} text-(--dash-ink-2)`}
                >
                  {typeof v === "number" ? v.toLocaleString("th-TH") : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * ตัวเลขหลัก — ค่า + หน่วย + บรรทัดรอง · `delta` = การเปลี่ยนแปลง (ลูกศร + เครื่องหมาย ไม่ใช้สีอย่างเดียว)
 * · `swatch` = สีของซีรีส์ที่ตัวเลขนี้เป็นตัวแทนในกราฟ
 */
export function StatTile({
  label,
  value,
  unit,
  note,
  delta,
  swatch,
  hero = false,
}: {
  label: string;
  value: number;
  unit?: string;
  note?: React.ReactNode;
  delta?: { value: number; label: string };
  swatch?: string;
  /** ตัวเลขหลักของหน้า — พื้นอ่อนสีหลัก */
  hero?: boolean;
}) {
  const d = delta?.value ?? 0;
  const DeltaIcon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;

  return (
    <div
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border px-5 py-4 shadow-(--dash-shadow) ${
        hero
          ? "border-[color-mix(in_oklab,var(--dash-accent),transparent_70%)] bg-[color-mix(in_oklab,var(--dash-accent),var(--dash-surface)_93%)]"
          : "border-(--dash-ring) bg-(--dash-surface)"
      }`}
    >
      <p className={`flex items-center gap-2 text-12-5 ${hero ? "font-medium text-(--dash-accent)" : "text-(--dash-ink-2)"}`}>
        {swatch ? <span aria-hidden className="size-2 rounded-full" style={{ background: swatch }} /> : null}
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-30 leading-none font-semibold tracking-tight text-(--dash-ink) tabular-nums">
          {value.toLocaleString("th-TH")}
        </span>
        {unit ? <span className="text-13 text-(--dash-mut)">{unit}</span> : null}
      </p>
      <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-12 text-(--dash-mut)">
        {delta ? (
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${
              d > 0 ? "text-(--dash-up)" : d < 0 ? "text-(--dash-down)" : "text-(--dash-mut)"
            }`}
          >
            <DeltaIcon size={14} strokeWidth={2.2} aria-hidden />
            {d > 0 ? "+" : ""}
            {d.toLocaleString("th-TH")}
            <span className="font-normal text-(--dash-mut)">{delta.label}</span>
          </span>
        ) : null}
        {note}
      </div>
    </div>
  );
}

/** ตัวเลือกแบบ dropdown (Radix Select) — ใช้กับตัวกรองระดับหน้า */
export function DashSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className="inline-flex h-9 min-w-48 cursor-pointer items-center justify-between gap-2 rounded-lg border border-(--dash-ring) bg-(--dash-surface) px-3 text-13 text-(--dash-ink) outline-none hover:bg-(--dash-hover) focus-visible:ring-2 focus-visible:ring-(--s1)/40"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-(--dash-mut)">{label}</span>
          <span className="font-medium">{current?.label}</span>
        </span>
        <Select.Icon>
          <ChevronDown size={15} className="text-(--dash-mut)" aria-hidden />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="dash z-60 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-[10px] border border-(--dash-ring) bg-(--dash-raise) p-1 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.35)]"
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer items-center justify-between gap-6 rounded-md py-1.5 pr-3 pl-7 text-13 text-(--dash-ink) outline-none select-none data-[highlighted]:bg-(--dash-hover)"
              >
                <Select.ItemIndicator className="absolute left-2">
                  <Check size={14} strokeWidth={2.4} aria-hidden />
                </Select.ItemIndicator>
                <Select.ItemText>{o.label}</Select.ItemText>
                {o.hint ? <span className="text-12 text-(--dash-mut) tabular-nums">{o.hint}</span> : null}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/**
 * ตัวกรองเลือกหลายค่า (checkbox) สำหรับแถบกรองพื้นเข้ม `.dash-filterbar`
 * · ไม่เลือกเลย = ทั้งหมด · ปุ่ม: ยังไม่เลือก = โปร่งบนพื้นเข้ม · เลือกแล้ว = ขาวทึบ + จำนวนที่เลือก
 * · รายการเกิน 8 ค่ามีช่องค้นหา
 */
export function DashMultiFilter({
  label,
  allLabel,
  values,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  values: readonly string[];
  options: { value: string; label: string; hint?: string }[];
  onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const on = values.length > 0;
  const picked = options.filter((o) => values.includes(o.value));
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const summary = !on ? allLabel : picked.length === 1 ? picked[0].label : `${picked[0]?.label ?? ""} +${picked.length - 1}`;

  return (
    <Popover.Root onOpenChange={(open) => !open && setQ("")}>
      <Popover.Trigger
        aria-label={label}
        className={`inline-flex h-9 max-w-72 cursor-pointer items-center gap-2 rounded-full pr-3 pl-3.5 text-13 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/60 ${
          on ? "bg-white text-(--dash-filter-bg) shadow-sm" : "bg-white/10 text-white ring-1 ring-white/20 ring-inset hover:bg-white/15"
        }`}
      >
        <span className={on ? "text-(--dash-mut)" : "text-white/65"}>{label}</span>
        <span className="truncate font-semibold">{summary}</span>
        {on && picked.length > 1 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-(--dash-accent) px-1.5 text-11 font-semibold text-white tabular-nums">{picked.length}</span>
        ) : null}
        <ChevronDown size={15} className={on ? "text-(--dash-mut)" : "text-white/70"} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="dash z-60 flex max-h-(--radix-popover-content-available-height) w-72 flex-col overflow-hidden rounded-xl border border-(--dash-ring) bg-(--dash-raise) shadow-[0_18px_44px_-18px_rgba(0,0,0,0.35)]"
        >
          {options.length > 8 ? (
            <div className="border-b border-(--dash-grid) p-2">
              <label className="flex h-8 items-center gap-2 rounded-lg bg-(--dash-sunken) px-2.5 ring-1 ring-(--dash-ring) ring-inset focus-within:ring-(--dash-accent)">
                <Search size={14} className="text-(--dash-mut)" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={`ค้นหา${label}`}
                  aria-label={`ค้นหา${label}`}
                  className="min-w-0 flex-1 bg-transparent text-13 text-(--dash-ink) outline-none placeholder:text-(--dash-mut)"
                />
              </label>
            </div>
          ) : null}
          <div role="group" aria-label={label} className="min-h-0 flex-1 overflow-auto p-1">
            {shown.length === 0 ? <p className="px-3 py-4 text-center text-12 text-(--dash-mut)">ไม่พบ “{q}”</p> : null}
            {shown.map((o) => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(o.value)}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-13 text-(--dash-ink) hover:bg-(--dash-hover)"
                >
                  <span
                    aria-hidden
                    className={`grid size-4 flex-none place-items-center rounded-[5px] border transition-colors ${
                      checked ? "border-(--dash-accent) bg-(--dash-accent) text-white" : "border-(--dash-axis) bg-(--dash-surface)"
                    }`}
                  >
                    {checked ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${checked ? "font-semibold" : ""}`}>{o.label}</span>
                  {o.hint ? <span className="text-12 text-(--dash-mut) tabular-nums">{o.hint}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-(--dash-grid) px-3 py-2 text-12">
            <span className="text-(--dash-mut)">{on ? `เลือก ${picked.length} จาก ${options.length}` : allLabel}</span>
            <button
              type="button"
              disabled={!on}
              onClick={() => onChange([])}
              className="cursor-pointer rounded-md px-2 py-1 font-medium text-(--dash-accent) hover:bg-(--dash-hover) disabled:cursor-default disabled:text-(--dash-axis) disabled:hover:bg-transparent"
            >
              ล้าง
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** แท็บของหน้า — หนึ่งแท็บ = หนึ่งหมวดการวิเคราะห์ (`DASH_SECTIONS` ใน dashboard-view) */
export function DashTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex gap-1 rounded-xl bg-(--dash-surface) p-1 shadow-(--dash-shadow) ring-1 ring-(--dash-ring)">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`h-8 cursor-pointer rounded-lg px-4 text-13 transition-colors ${
              on
                ? "bg-(--dash-accent) font-semibold text-white"
                : "text-(--dash-ink-2) hover:bg-(--dash-hover) hover:text-(--dash-ink)"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** สวิตช์มิติ/ตัวชี้วัดในหัวการ์ด — ปุ่มเล็กติดกัน เลือกได้ทีละค่า */
export function DashToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-(--dash-sunken) p-0.5 ring-1 ring-(--dash-ring) ring-inset">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`h-7 cursor-pointer rounded-md px-2.5 text-12 whitespace-nowrap transition-colors ${
              on ? "bg-(--dash-surface) font-semibold text-(--dash-ink) shadow-(--dash-shadow)" : "text-(--dash-mut) hover:text-(--dash-ink)"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
