import type { ReasonSlice } from "@/lib/case-report";
import { reasonGroup } from "@/lib/data";

/**
 * Single-series magnitude comparison — one hue, no legend needed (the title
 * names the series), every bar directly labelled, baseline anchored at zero.
 */
export function ReasonBars({ slices }: { slices: ReasonSlice[] }) {
  const total = slices.reduce((sum, r) => sum + r.count, 0);
  const peak = Math.max(1, ...slices.map((r) => r.count));

  return (
    <figure className="flex flex-col gap-4 rounded-box border border-line bg-base-100 p-5">
      <figcaption className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">
          เรื่องร้องเรียนแยกตามกลุ่มสาเหตุหลัก
        </h2>
        <p className="text-[12px] text-mut">รวม {total} เคส</p>
      </figcaption>

      {slices.length ? (
        <ul className="flex flex-col gap-3">
          {slices.map(({ code, count }) => {
            const group = reasonGroup(code);
            const share = Math.round((count / total) * 100);

            return (
              <li key={code} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span>
                    {group.label}{" "}
                    <span className="font-mono text-[11px] text-mut">{code}</span>
                  </span>
                  <span className="flex-none text-mut">
                    <strong className="font-medium text-ink">{count}</strong> ·{" "}
                    {share}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-base-200">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(count / peak) * 100}%` }}
                    aria-hidden
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-[13px] text-mut">ยังไม่มีข้อมูล</p>
      )}
    </figure>
  );
}
