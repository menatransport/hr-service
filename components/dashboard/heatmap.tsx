"use client";

import { inkOn } from "./chart";

/**
 * Heatmap แบบ HTML grid — แถว × คอลัมน์ ตัวเลขอยู่ในช่อง (direct label) จึงอ่านได้โดยไม่ต้องชี้
 * · `total` = คอลัมน์ตัวเลขท้าย (ไม่ลงสี) เช่น ยอดคนปัจจุบัน
 * · `color(v)` / `tone(v)` มาจากสเกลใน `chart.tsx` (`seqColor` / `divColor`) · `onRow` = กดชื่อแถวเพื่อเจาะต่อ
 */
export function Heatmap({
  rows,
  cols,
  values,
  color,
  tone,
  format = (v) => (v > 0 ? String(v) : v < 0 ? String(v) : ""),
  onRow,
  total,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  color: (v: number) => string;
  /** ค่าบนสเกล (0–1 หรือ −1…1) — เลือกสีตัวหนังสือ */
  tone: (v: number) => number;
  format?: (v: number) => string;
  onRow?: (row: string) => void;
  /** คอลัมน์สรุปท้ายตาราง (ไม่ลงสี) เช่น ยอดคนปัจจุบัน */
  total?: { label: string; hint?: string; values: number[] };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-11-5">
        <thead>
          <tr>
            <th />
            {cols.map((c) => (
              <th key={c} className="px-0.5 pb-1 text-center font-normal text-(--dash-mut)">
                {c}
              </th>
            ))}
            {total ? (
              <th title={total.hint} className="pb-1 pl-2 text-right font-semibold whitespace-nowrap text-(--dash-ink)">
                {total.label}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <th scope="row" className="max-w-32 pr-2 text-right font-normal whitespace-nowrap">
                {onRow ? (
                  <button
                    type="button"
                    onClick={() => onRow(r)}
                    className="cursor-pointer truncate text-(--dash-ink-2) hover:text-(--dash-ink) hover:underline"
                  >
                    {r}
                  </button>
                ) : (
                  <span className="truncate text-(--dash-ink-2)">{r}</span>
                )}
              </th>
              {values[i].map((v, j) => (
                <td
                  key={j}
                  title={`${r} · ${cols[j]}: ${v}`}
                  className="h-7 min-w-8 rounded-[4px] text-center font-medium tabular-nums"
                  style={{ background: color(v), color: inkOn(tone(v)) }}
                >
                  {format(v)}
                </td>
              ))}
              {total ? (
                <td className="border-l border-(--dash-grid) pl-2 text-right text-12-5 font-semibold text-(--dash-ink) tabular-nums">
                  {total.values[i].toLocaleString("th-TH")}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
