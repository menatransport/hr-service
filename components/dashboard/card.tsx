"use client";

import { useState } from "react";
import { Select } from "radix-ui";
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown, Minus, Table2 } from "lucide-react";

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
      className={`flex min-w-0 flex-col rounded-[14px] border border-(--dash-ring) bg-(--dash-surface) ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-14 font-semibold text-(--dash-ink)">{title}</h3>
          {sub ? <p className="mt-0.5 text-12 text-(--dash-mut)">{sub}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {action}
          {table ? (
            <div role="group" aria-label="มุมมอง" className="flex rounded-lg border border-(--dash-ring) p-0.5">
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
                    on ? "bg-(--dash-hover) text-(--dash-ink)" : "text-(--dash-mut) hover:text-(--dash-ink)"
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
    <div className="max-h-96 overflow-auto rounded-lg border border-(--dash-grid)">
      <table className="w-full border-collapse text-12-5">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.label}
                className={`sticky top-0 border-b border-(--dash-grid) bg-(--dash-surface) px-3 py-2 font-medium whitespace-nowrap text-(--dash-mut) ${
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
            <tr key={i} className="border-b border-(--dash-grid) last:border-0">
              {r.map((v, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 ${columns[j]?.num ? "text-right tabular-nums" : ""} text-(--dash-ink-2)`}
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
}: {
  label: string;
  value: number;
  unit?: string;
  note?: React.ReactNode;
  delta?: { value: number; label: string };
  swatch?: string;
}) {
  const d = delta?.value ?? 0;
  const DeltaIcon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[14px] border border-(--dash-ring) bg-(--dash-surface) px-5 py-4">
      <p className="flex items-center gap-2 text-12-5 text-(--dash-ink-2)">
        {swatch ? <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: swatch }} /> : null}
        {label}
      </p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-30 leading-none font-semibold tracking-tight text-(--dash-ink)">
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
    <div role="tablist" className="flex gap-1">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={`-mb-px cursor-pointer border-b-2 px-3 pt-1 pb-2.5 text-13 transition-colors ${
              on
                ? "border-(--dash-ink) font-semibold text-(--dash-ink)"
                : "border-transparent text-(--dash-mut) hover:text-(--dash-ink)"
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
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-(--dash-ring) p-0.5">
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
              on ? "bg-(--dash-hover) font-semibold text-(--dash-ink)" : "text-(--dash-mut) hover:text-(--dash-ink)"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
