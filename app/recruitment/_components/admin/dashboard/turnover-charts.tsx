"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Tooltip, XAxis, YAxis } from "recharts";

import { DashCard } from "@/components/dashboard/card";
import { ChartFrame, ChartLegend, ChartTooltip, clip, type ChartConfig } from "@/components/dashboard/chart";
import {
  CTL_KEYS,
  CTL_LABEL,
  TENURE_BANDS,
  ctlOf,
  fmt,
  monthLabel,
  ownerStats,
  pct,
  summarize,
  tenureText,
  type ToRow,
} from "@/app/recruitment/_lib/dashboard/turnover-shared";

/**
 * กราฟของแท็บ TurnOver — แยกจาก `turnover-section.tsx` ตามกติกาความยาวไฟล์
 * ทุกการ์ดมีมุมมองตาราง (`table`) · กดแท่งเดือน/หมวด = กรองทั้งหน้า (ผู้เรียกส่ง `onPick`)
 */

const AXIS = { tickLine: false, axisLine: false } as const;

export const CTL_CONFIG: ChartConfig = {
  yes: { label: CTL_LABEL.yes, color: "var(--s2)" },
  partial: { label: CTL_LABEL.partial, color: "var(--s4)" },
  no: { label: CTL_LABEL.no, color: "var(--s1)" },
  na: { label: CTL_LABEL.na, color: "var(--dash-axis)" },
};

/** ชั้นบนสุดของแท่งซ้อนที่มีค่า > 0 */
const topKey = (row: Record<string, number | string>) => [...CTL_KEYS].reverse().find((k) => Number(row[k]) > 0);

const payloadOf = (d: unknown) => (d as { payload?: Record<string, unknown> }).payload ?? {};

/* ------------------------------------------------------------- รายเดือน */

export function MonthlyChart({
  rows,
  months,
  picked,
  onPick,
}: {
  rows: readonly ToRow[];
  months: readonly string[];
  picked: readonly string[];
  onPick: (month: string) => void;
}) {
  const data = useMemo(
    () =>
      months.map((m) => {
        const rs = rows.filter((r) => r.month === m);
        const row: Record<string, number | string> = { key: m, name: monthLabel(m), total: rs.length };
        for (const k of CTL_KEYS) row[k] = rs.filter((r) => ctlOf(r) === k).length;
        return row;
      }),
    [rows, months],
  );
  const avgPerMonth = data.length ? Math.round(rows.length / data.length) : 0;

  return (
    <DashCard
      title="พ้นสภาพรายเดือน"
      sub={`แยกตามควบคุมได้หรือไม่ · เฉลี่ย ${fmt(avgPerMonth)} คน/เดือน · กดแท่งเพื่อกรองเดือน`}
      className="lg:col-span-2"
      table={{
        columns: [{ label: "เดือน" }, ...CTL_KEYS.map((k) => ({ label: CTL_LABEL[k], num: true })), { label: "รวม", num: true }],
        rows: data.map((d) => [String(d.name), ...CTL_KEYS.map((k) => Number(d[k])), Number(d.total)]),
      }}
    >
      <div className="mb-3">
        <ChartLegend config={CTL_CONFIG} keys={[...CTL_KEYS]} />
      </div>
      <ChartFrame height={260}>
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" {...AXIS} interval={0} />
          <YAxis {...AXIS} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--dash-hover)" }} content={(p) => <ChartTooltip {...p} config={CTL_CONFIG} total />} />
          {CTL_KEYS.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="m"
              fill={CTL_CONFIG[k].color}
              maxBarSize={34}
              radius={i === CTL_KEYS.length - 1 ? [4, 4, 0, 0] : 0}
              cursor="pointer"
              onClick={(d) => onPick(String(payloadOf(d).key ?? ""))}
            >
              {data.map((d) => (
                <Cell key={String(d.key)} fillOpacity={picked.length && !picked.includes(String(d.key)) ? 0.3 : 1} />
              ))}
              {/* ยอดรวมบนหัวแท่ง — ผูกกับชั้นบนสุดที่มีค่า (ชั้นที่เป็น 0 ไม่มีแท่งให้ผูกป้าย) */}
              <LabelList
                dataKey="total"
                content={(p) => {
                  const idx = Number(p.index);
                  const row = data[idx];
                  if (!row || topKey(row) !== k) return null;
                  const x = Number(p.x) + Number(p.width) / 2;
                  return (
                    <text x={x} y={Number(p.y) - 6} textAnchor="middle" className="fill-(--dash-ink-2) text-11-5 tabular-nums">
                      {fmt(Number(row.total))}
                    </text>
                  );
                }}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartFrame>
    </DashCard>
  );
}

/* ------------------------------------------------------------- ช่วงอายุงาน */

/** “จุดตาย” — ช่วงอายุงานที่คนออกมากที่สุดลงสีเด่น */
export function TenureChart({ rows }: { rows: readonly ToRow[] }) {
  const data = useMemo(() => {
    const out = TENURE_BANDS.map((b) => {
      const rs = rows.filter((r) => r.band === b);
      return { name: b, count: rs.length, share: pct(rs.length, rows.length), avg: summarize(rs).avgTenure };
    });
    const peak = Math.max(0, ...out.map((d) => d.count));
    return out.map((d) => ({ ...d, peak: d.count > 0 && d.count === peak, label: `${fmt(d.count)} · ${d.share}` }));
  }, [rows]);
  const peak = data.find((d) => d.peak);
  const config: ChartConfig = { count: { label: "พ้นสภาพ (คน)", color: "var(--s1)" } };

  return (
    <DashCard
      title="ช่วงอายุงาน ณ วันออก"
      sub={peak ? <>จุดตาย: <b className="font-semibold text-(--dash-ink)">{peak.name}</b> ({peak.share} ของผู้ลาออก)</> : "ยังไม่มีข้อมูล"}
      table={{
        columns: [{ label: "ช่วงอายุงาน" }, { label: "คน", num: true }, { label: "สัดส่วน", num: true }],
        rows: data.map((d) => [d.name, d.count, d.share]),
      }}
    >
      <ChartFrame height={286}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...AXIS} allowDecimals={false} hide />
          <YAxis type="category" dataKey="name" width={84} {...AXIS} />
          <Tooltip cursor={{ fill: "var(--dash-hover)" }} content={(p) => <ChartTooltip {...p} config={config} />} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.peak ? "var(--s2)" : "var(--s1)"} />
            ))}
            <LabelList dataKey="label" position="right" className="fill-(--dash-ink-2) text-11-5 tabular-nums" />
          </Bar>
        </BarChart>
      </ChartFrame>
    </DashCard>
  );
}

/* ------------------------------------------------------------- หมวดสาเหตุ */

export function CategoryChart({
  rows,
  categories,
  picked,
  onPick,
}: {
  rows: readonly ToRow[];
  categories: readonly { prefix: string; label: string }[];
  picked: readonly string[];
  onPick: (prefix: string) => void;
}) {
  const data = useMemo(() => {
    const known = new Set(categories.map((c) => c.prefix));
    const list = [
      ...categories.map((c) => ({ key: c.prefix, name: `${c.prefix} · ${c.label}`, rs: rows.filter((r) => r.category === c.prefix) })),
      { key: "", name: "ยังไม่ระบุรหัส", rs: rows.filter((r) => !known.has(r.category)) },
    ];
    return list
      .filter((c) => c.rs.length)
      .map((c) => ({
        key: c.key,
        name: c.name,
        count: c.rs.length,
        share: pct(c.rs.length, rows.length),
        avg: tenureText(summarize(c.rs).avgTenure),
        label: `${fmt(c.rs.length)} · ${pct(c.rs.length, rows.length)}`,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows, categories]);
  const config: ChartConfig = { count: { label: "สาเหตุหลัก (คน)", color: "var(--s1)" } };

  return (
    <DashCard
      title="สาเหตุแยกตามหมวด"
      sub="นับจากรหัสสาเหตุหลัก · กดแท่งเพื่อกรองหมวด"
      table={{
        columns: [{ label: "หมวดสาเหตุ" }, { label: "คน", num: true }, { label: "สัดส่วน", num: true }, { label: "อายุงานเฉลี่ย", num: true }],
        rows: data.map((d) => [d.name, d.count, d.share, d.avg]),
      }}
    >
      <ChartFrame height={Math.max(220, data.length * 34 + 10)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...AXIS} allowDecimals={false} hide />
          <YAxis type="category" dataKey="name" width={190} {...AXIS} tickFormatter={(v: string) => clip(v, 26)} />
          <Tooltip
            cursor={{ fill: "var(--dash-hover)" }}
            content={(p) => (
              <ChartTooltip {...p} config={config} extra={(row) => <p className="text-(--dash-mut)">อายุงานเฉลี่ย {String(row.avg)}</p>} />
            )}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20} cursor="pointer" onClick={(d) => onPick(String(payloadOf(d).key ?? ""))}>
            {data.map((d) => (
              <Cell key={d.key || "none"} fill="var(--s1)" fillOpacity={picked.length && !picked.includes(d.key) ? 0.3 : 1} />
            ))}
            <LabelList dataKey="label" position="right" className="fill-(--dash-ink-2) text-11-5 tabular-nums" />
          </Bar>
        </BarChart>
      </ChartFrame>
    </DashCard>
  );
}

/* ------------------------------------------------------------- เจ้าของการแก้ไข */

/** เคสที่บริษัทควบคุมได้ ตกเป็นงานของใคร — แยกฝ่ายร่วม (`Safety + จัดส่ง`) นับให้ทุกฝ่าย */
export function OwnerChart({ rows }: { rows: readonly ToRow[] }) {
  const data = useMemo(() => ownerStats(rows).slice(0, 10), [rows]);
  const config: ChartConfig = { yes: CTL_CONFIG.yes, partial: CTL_CONFIG.partial };

  return (
    <DashCard
      title="เจ้าของการแก้ไข"
      sub="เคสที่ควบคุมได้ / ได้บางส่วน · เคสที่หลายฝ่ายร่วมกันนับให้ทุกฝ่าย"
      action={<ChartLegend config={config} keys={["yes", "partial"]} />}
      table={{
        columns: [{ label: "เจ้าของ" }, { label: CTL_LABEL.yes, num: true }, { label: CTL_LABEL.partial, num: true }, { label: "รวม", num: true }],
        rows: data.map((d) => [d.owner, d.yes, d.partial, d.count]),
      }}
    >
      {data.length === 0 ? (
        <p className="py-10 text-center text-13 text-(--dash-mut)">ไม่มีเคสที่ควบคุมได้ในตัวกรองนี้</p>
      ) : (
        <ChartFrame height={Math.max(220, data.length * 34 + 10)}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...AXIS} allowDecimals={false} hide />
            <YAxis type="category" dataKey="owner" width={110} {...AXIS} tickFormatter={(v: string) => clip(v, 16)} />
            <Tooltip cursor={{ fill: "var(--dash-hover)" }} content={(p) => <ChartTooltip {...p} config={config} total />} />
            <Bar dataKey="yes" stackId="o" fill={config.yes.color} maxBarSize={20} />
            <Bar dataKey="partial" stackId="o" fill={config.partial.color} radius={[0, 4, 4, 0]} maxBarSize={20}>
              <LabelList dataKey="count" position="right" className="fill-(--dash-ink-2) text-11-5 tabular-nums" />
            </Bar>
          </BarChart>
        </ChartFrame>
      )}
    </DashCard>
  );
}
