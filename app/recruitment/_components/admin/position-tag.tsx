"use client";

import { SegmentedControl } from "@/components/ui/summary-panel";

/**
 * ตำแหน่ง Mixer L / Mixer S ของลาดกระบัง — ป้ายสีในตาราง + แท็บกรองเหนือตาราง (Bew 12 พ.ย. 2569)
 * · คีย์ = ป้ายที่ตารางโชว์ (`positionLabel`) · ตำแหน่งอื่นเป็นตัวหนังสือธรรมดา
 */
export const MIXER_POSITIONS = ["Mixer L", "Mixer S"] as const;
export type MixerPick = "all" | (typeof MIXER_POSITIONS)[number];

const TONE: Record<(typeof MIXER_POSITIONS)[number], { chip: string; dot: string }> = {
  "Mixer L": { chip: "bg-pjs-soft text-pjs ring-pjs/25", dot: "bg-pjs" },
  "Mixer S": { chip: "bg-warning/12 text-warning ring-warning/25", dot: "bg-warning" },
};

const toneOf = (position: string) => TONE[position as keyof typeof TONE];

export const isMixer = (position: string) => Boolean(toneOf(position));

export function PositionTag({ value }: { value: string }) {
  const tone = toneOf(value);
  if (!tone) return <>{value}</>;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-11-5 font-semibold whitespace-nowrap ring-1 ring-inset ${tone.chip}`}>
      {value}
    </span>
  );
}

/** แท็บ ทั้งหมด | Mixer L | Mixer S — ตัวเลข = แถวที่ผ่านตัวกรองอื่นแล้ว */
export function MixerTabs({
  value,
  counts,
  onChange,
  className = "",
}: {
  value: MixerPick;
  counts: Record<MixerPick, number>;
  onChange: (v: MixerPick) => void;
  className?: string;
}) {
  return (
    <SegmentedControl
      label="กรองตำแหน่ง"
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "ทั้งหมด", count: counts.all },
        ...MIXER_POSITIONS.map((p) => ({ value: p, label: p, count: counts[p], dot: TONE[p].dot })),
      ]}
      className={className}
    />
  );
}

/** นับแถวต่อแท็บ — `all` = ทุกแถว (รวมตำแหน่งอื่น) */
export function mixerCounts<T>(rows: readonly T[], positionOf: (row: T) => string): Record<MixerPick, number> {
  const n: Record<MixerPick, number> = { all: rows.length, "Mixer L": 0, "Mixer S": 0 };
  for (const r of rows) {
    const p = positionOf(r);
    if (isMixer(p)) n[p as Exclude<MixerPick, "all">] += 1;
  }
  return n;
}
