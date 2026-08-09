"use client";

import { useState } from "react";

import { monthlyVolume } from "@/lib/data";

/**
 * Grouped bars, one y-scale (both series count cases).
 *
 * Series colours are a 2-slot categorical palette validated against the six
 * colour checks — lightness band, chroma floor, CVD separation, normal-vision
 * separation and contrast. One validated pair per theme, both live on
 * `--color-series-a/b` in `globals.css`:
 *
 *   hrs      #a35a08 / #0d9488 on #ffffff — deutan ΔE 13.6 · tritan 25.1 ·
 *            normal 21.2 · contrast 5.22 / 3.74
 *   hrs-dark #e0913f / #2fc7b4 on #161c1b — deutan ΔE 14.0 · tritan 27.5 ·
 *            normal 22.5 · contrast 6.82 / 8.18
 *
 * Do not substitute hues without re-validating on the surface they sit on.
 */
const series = [
  { key: "opened", label: "เปิดใหม่", color: "var(--color-series-a)" },
  { key: "closed", label: "ปิดเคส", color: "var(--color-series-b)" },
] as const;

const TICK_STEP = 20;
const peak = Math.max(...monthlyVolume.flatMap((m) => [m.opened, m.closed]));
const max = Math.ceil(peak / TICK_STEP) * TICK_STEP;
const ticks = Array.from({ length: max / TICK_STEP + 1 }, (_, i) => i * TICK_STEP);

export function CaseVolumeChart() {
  const [hover, setHover] = useState<{ m: number; s: number } | null>(null);
  const [asTable, setAsTable] = useState(false);

  const last = monthlyVolume.length - 1;

  return (
    <figure className="flex flex-col gap-4 rounded-box border border-line bg-base-100 p-5">
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">เคสเปิดใหม่เทียบเคสที่ปิดได้</h2>
          <p className="text-[12px] text-mut">รายเดือน · หน่วยเป็นจำนวนเคส</p>
        </div>
        <div className="flex items-center gap-4">
          <ul className="flex items-center gap-3.5">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-mut">
                <span
                  className="size-2.5 flex-none rounded-[3px]"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                {s.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-mut transition-colors hover:border-ink/30 hover:text-ink"
          >
            {asTable ? "ดูเป็นกราฟ" : "ดูเป็นตาราง"}
          </button>
        </div>
      </figcaption>

      {asTable ? (
        <VolumeTable />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex h-[220px] gap-2">
            {/* y scale */}
            <div className="relative w-7 flex-none" aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-0 translate-y-1/2 text-[10.5px] text-mut"
                  style={{ bottom: `${(t / max) * 100}%` }}
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="relative min-w-0 flex-1">
              {/* recessive grid */}
              {ticks.map((t) => (
                <span
                  key={t}
                  aria-hidden
                  className={`absolute inset-x-0 border-t ${
                    t === 0 ? "border-line" : "border-line/60"
                  }`}
                  style={{ bottom: `${(t / max) * 100}%` }}
                />
              ))}

              <div className="relative flex h-full items-end gap-2.5">
                {monthlyVolume.map((m, mi) => (
                  <div
                    key={m.month}
                    className="relative flex h-full flex-1 items-end justify-center gap-[2px]"
                  >
                    {series.map((s, si) => {
                      const value = m[s.key];
                      const on = hover?.m === mi && hover?.s === si;
                      const dim = hover !== null && !on;

                      return (
                        <button
                          key={s.key}
                          type="button"
                          onMouseEnter={() => setHover({ m: mi, s: si })}
                          onFocus={() => setHover({ m: mi, s: si })}
                          onMouseLeave={() => setHover(null)}
                          onBlur={() => setHover(null)}
                          aria-label={`${m.month} ${s.label} ${value} เคส`}
                          className="relative w-full max-w-[26px] rounded-t-[4px] transition-opacity"
                          style={{
                            height: `${(value / max) * 100}%`,
                            backgroundColor: s.color,
                            opacity: dim ? 0.4 : 1,
                          }}
                        >
                          {/* selective direct labels: latest month only */}
                          {mi === last ? (
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10.5px] font-medium text-mut">
                              {value}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}

                    {hover?.m === mi ? (
                      <div
                        role="status"
                        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 rounded-selector border border-line bg-base-100 px-2.5 py-1.5 text-[11.5px] whitespace-nowrap shadow-md"
                      >
                        <span className="font-medium">{m.month}</span>
                        <span className="text-mut">
                          {" "}
                          · เปิดใหม่ {m.opened} · ปิด {m.closed}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 pl-9">
            {monthlyVolume.map((m) => (
              <span
                key={m.month}
                className="flex-1 text-center text-[11.5px] text-mut"
              >
                {m.month}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

function VolumeTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] text-mut">
            <th scope="col" className="py-2 font-medium">เดือน</th>
            <th scope="col" className="py-2 text-right font-medium">เปิดใหม่</th>
            <th scope="col" className="py-2 text-right font-medium">ปิดเคส</th>
            <th scope="col" className="py-2 text-right font-medium">คงเหลือสุทธิ</th>
          </tr>
        </thead>
        <tbody>
          {monthlyVolume.map((m) => {
            const net = m.opened - m.closed;
            return (
              <tr key={m.month} className="border-b border-line/70 last:border-0">
                <td className="py-2">{m.month}</td>
                <td className="py-2 text-right">{m.opened}</td>
                <td className="py-2 text-right">{m.closed}</td>
                <td
                  className={`py-2 text-right ${net > 0 ? "text-sla" : "text-mut"}`}
                >
                  {net > 0 ? `+${net}` : net}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
