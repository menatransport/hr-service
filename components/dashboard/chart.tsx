"use client";

import { ResponsiveContainer } from "recharts";

/**
 * ชิ้นกลางของกราฟ (แนวเดียวกับ `chart.tsx` ของ shadcn/ui แต่เขียนเอง ไม่รัน `shadcn init`
 * เพราะ init เขียนทับ `--color-primary` ของ daisyUI ทั้งระบบ)
 *
 * - `ChartConfig` = ซีรีส์ → ป้าย + สี (สีเป็นตัวแปรใน `dashboard.css` เช่น `var(--s1)`)
 * - `ChartFrame` ให้ความสูงที่แน่นอนรวมแถบแกนแล้ว การ์ดจึงไม่มี scroll ซ้อน
 * - `ChartTooltip` / `ChartLegend` อ่าน config ชุดเดียวกับกราฟ ป้ายจึงตรงกันทุกที่
 */

export type ChartConfig = Record<string, { label: string; color: string }>;

export function ChartFrame({ height, children }: { height: number; children: React.ReactElement }) {
  return (
    <div style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("th-TH");

interface TooltipItem {
  dataKey?: unknown;
  value?: unknown;
}

/**
 * กล่องลอยตอนชี้ — หัว = หมวด · แถว = ซีรีส์ที่มีค่า (ค่าศูนย์ซ่อน) · `total` = บรรทัดรวมท้าย
 * · `extra` = บรรทัดเสริมที่คิดจากแถวข้อมูล เช่น “สุทธิ +3”
 */
export function ChartTooltip({
  active,
  payload,
  label,
  config,
  total,
  extra,
}: {
  active?: boolean;
  payload?: readonly TooltipItem[];
  label?: unknown;
  config: ChartConfig;
  total?: boolean;
  extra?: (row: Record<string, unknown>) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => typeof p.value === "number" && p.value !== 0);
  const row = (payload[0] as { payload?: Record<string, unknown> }).payload ?? {};
  const sum = items.reduce((n, p) => n + (p.value as number), 0);

  return (
    <div className="min-w-40 rounded-[10px] border border-(--dash-ring) bg-(--dash-raise) px-3 py-2.5 text-12 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
      <p className="mb-1.5 font-semibold text-(--dash-ink)">{String(label ?? "")}</p>
      {items.length === 0 ? <p className="text-(--dash-mut)">ไม่มีข้อมูล</p> : null}
      <ul className="flex flex-col gap-1">
        {items.map((p) => {
          const key = String(p.dataKey);
          const c = config[key];
          return (
            <li key={key} className="flex items-center gap-2 text-(--dash-ink-2)">
              <span aria-hidden className="size-2.5 flex-none rounded-[3px]" style={{ background: c?.color }} />
              <span className="flex-1">{c?.label ?? key}</span>
              <span className="font-semibold text-(--dash-ink) tabular-nums">{fmt(p.value as number)}</span>
            </li>
          );
        })}
      </ul>
      {total && items.length > 1 ? (
        <p className="mt-1.5 flex justify-between border-t border-(--dash-grid) pt-1.5 text-(--dash-ink-2)">
          รวม <span className="font-semibold text-(--dash-ink) tabular-nums">{fmt(sum)}</span>
        </p>
      ) : null}
      {extra ? <div className="mt-1.5 border-t border-(--dash-grid) pt-1.5">{extra(row)}</div> : null}
    </div>
  );
}

/**
 * คำอธิบายสี — กดซีรีส์เพื่อซ่อน/แสดง (ซ่อนได้ทีละหลายตัว แต่ต้องเหลืออย่างน้อยหนึ่ง)
 * · ส่ง `onToggle` ไม่มา = ป้ายเฉย ๆ
 */
export function ChartLegend({
  config,
  keys,
  hidden,
  onToggle,
}: {
  config: ChartConfig;
  keys: string[];
  hidden?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-12 text-(--dash-ink-2)">
      {keys.map((k) => {
        const off = hidden?.has(k);
        const body = (
          <>
            <span
              aria-hidden
              className="size-2.5 rounded-[3px] transition-opacity"
              style={{ background: config[k].color, opacity: off ? 0.25 : 1 }}
            />
            <span className={off ? "line-through opacity-60" : ""}>{config[k].label}</span>
          </>
        );
        return (
          <li key={k}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(k)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-(--dash-hover)"
              >
                {body}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-1">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** ป้ายแกนที่ยาวเกิน — ตัดด้วย … (ชื่อแพล้นท์ไทยบางชื่อยาวมาก) */
export const clip = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ------------------------------------------------------------------ สเกลสี */

/**
 * สเกลลำดับ (sequential) — สีเดียว อ่อน → เข้ม · `t` 0–1 · 0 = เทากลาง (ไม่มีค่า)
 * ผสมจากสีซีรีส์กับพื้นการ์ด จึงพลิกตามโหมดมืดเอง
 */
export function seqColor(t: number, hue = "var(--s1)"): string {
  if (t <= 0) return "var(--dash-mid)";
  return `color-mix(in oklab, ${hue} ${Math.round(18 + Math.min(1, t) * 82)}%, var(--dash-surface))`;
}

/** สเกลสองขั้ว (diverging) — ลบ = แดง · 0 = เทา · บวก = น้ำเงิน · `t` −1…1 */
export function divColor(t: number): string {
  if (t === 0) return "var(--dash-mid)";
  const pole = t < 0 ? "var(--dash-neg)" : "var(--s1)";
  return `color-mix(in oklab, ${pole} ${Math.round(25 + Math.min(1, Math.abs(t)) * 75)}%, var(--dash-mid))`;
}

/** ตัวหนังสือบนช่องสี — ช่องเข้มใช้ขาว */
export const inkOn = (t: number) => (Math.abs(t) > 0.55 ? "#fff" : "var(--dash-ink)");

/** แถบคำอธิบายสเกล — ป้ายซ้าย · แถบไล่สี · ป้ายขวา (และกลาง) */
export function ScaleLegend({ left, mid, right, colors }: { left: string; mid?: string; right: string; colors: string[] }) {
  return (
    <div className="flex items-center gap-2 text-11-5 text-(--dash-mut)">
      <span>{left}</span>
      <span className="flex h-2.5 w-28 overflow-hidden rounded-full">
        {colors.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span>{right}</span>
      {mid ? <span className="sr-only">กลาง = {mid}</span> : null}
    </div>
  );
}
