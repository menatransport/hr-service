"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, MessageSquareText, Settings2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { ChartFrame, ChartLegend, ChartTooltip, type ChartConfig } from "@/components/dashboard/chart";
import { DashCard, DashToggle, StatTile } from "@/components/dashboard/card";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import type { XlsxColumn } from "@/lib/xlsx-table";
import {
  MP_SCOPES,
  actualOf,
  dailyPoints,
  fmtNum,
  groupRows,
  inScope,
  pctText,
  recruitOf,
  scopeLabel,
  signed,
  sumCounts,
  TH_MONTH,
  thDate,
  trendSeries,
  type MpBoard,
  type MpCounts,
  type MpCustomerGroup,
  type MpPeriod,
  type MpScope,
  type MpTarget,
  type MpTrendPoint,
} from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

import { ManpowerLineDialog } from "./manpower-line-dialog";
import { ManpowerTargetsDialog } from "./manpower-targets-dialog";

/**
 * หมวด Manpower รายวัน — แทนชีต “📊 Manpower” + “📈 Daily สรุป %” (นิยามตัวเลข: `manpower-daily-shared.ts`)
 *
 * โครง: แถบขอบเขต + ปุ่ม (ตั้งเป้า · ข้อความ LINE · Excel) → ตัวเลขหลัก → สัดส่วนต่อเป้าแยกกลุ่มงาน + ตาม RC Owner
 * → แนวโน้ม (วัน/สัปดาห์/เดือน) → ตาราง กลุ่มงาน → ลูกค้า → แพล้นท์
 * · สี: Active `--s1` · OJT `--s2` · Vacant HC `--s3` ทุกกราฟ (ลำดับสีคือกลไกกันตาบอดสี ห้ามสลับ)
 */

const PEOPLE: ChartConfig = {
  active: { label: "Active", color: "var(--s1)" },
  ojt: { label: "OJT", color: "var(--s2)" },
  vacant: { label: "Vacant HC", color: "var(--s3)" },
};
const LEVEL: ChartConfig = {
  active: { label: "Active", color: "var(--s1)" },
  recruit: { label: "Target Recruit", color: "var(--dash-ink-2)" },
};
const PIPE: ChartConfig = {
  ojt: { label: "OJT (ฝึกงาน + รอรับรถ)", color: "var(--s2)" },
  vacant: { label: "Vacant HC", color: "var(--s3)" },
};

const AXIS = { tickLine: false, axisLine: false } as const;

type Row = MpCounts & { recruit: number };

export function ManpowerDailySection({ board: initial, canEditTargets }: { board: MpBoard; canEditTargets: boolean }) {
  const [board, setBoard] = useState(initial);
  const [scope, setScope] = useState<MpScope>("all");
  const [period, setPeriod] = useState<MpPeriod>("day");
  const [dialog, setDialog] = useState<"line" | "targets" | null>(null);

  const rows = useMemo(() => board.rows.filter((r) => inScope(scope, r.site)), [board.rows, scope]);
  const fleets = useMemo(() => groupRows(rows, board.targets), [rows, board.targets]);
  const t = useMemo(() => sumCounts(rows), [rows]);
  const recruit = recruitOf(t);
  const truck = fleets.reduce((n, f) => n + f.targetTruck, 0);
  const unassigned =
    scope === "all" ? board.interviewUnassigned.latkrabang + board.interviewUnassigned["saraburi-bangpakong"] : board.interviewUnassigned[scope];

  const readAt = new Date(board.readAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- แถบขอบเขต */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <DashToggle label="ขอบเขต" value={scope} options={MP_SCOPES} onChange={setScope} />
          <p className="text-12 text-(--dash-mut)">
            ข้อมูล ณ {thDate(board.today)} {readAt} น. · ทะเบียน พจส. + คำขอสรรหา (สด)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditTargets ? (
            <button type="button" onClick={() => setDialog("targets")} className={TOOL_BTN}>
              <Settings2 size={15} aria-hidden />
              ตั้งค่าเป้า
            </button>
          ) : null}
          <button type="button" onClick={() => setDialog("line")} className={TOOL_BTN}>
            <MessageSquareText size={15} aria-hidden />
            ข้อความส่ง LINE
          </button>
          <ExportButton fleets={fleets} scope={scope} today={board.today} />
        </div>
      </div>

      {/* ---------- ตัวเลขหลัก */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Target Recruit" value={recruit} unit="คน" note="Active + OJT + Vacant HC" />
        <StatTile label="Active" value={t.active} unit="คน" swatch={PEOPLE.active.color} note={`${pctText(t.active, recruit)} ของเป้า · วิ่งงาน/รับรถแล้ว`} />
        <StatTile label="OJT" value={t.ojt} unit="คน" swatch={PEOPLE.ojt.color} note="ฝึกงาน + รอรับรถ" />
        <StatTile label="Actual Total" value={actualOf(t)} unit="คน" note={<b className="font-semibold text-(--dash-ink)">{pctText(actualOf(t), recruit)} ของเป้า</b>} />
        <StatTile label="Vacant HC" value={t.vacant} unit="คน" swatch={PEOPLE.vacant.color} note={`รอสรรหา ${fmtNum(t.open)} · รอฝึกงาน ${fmtNum(t.waiting)}`} />
        <StatTile label="Target Truck" value={truck} unit="คัน" note={truck ? `Active ต่อรถ ${pctText(t.active, truck)}` : "ยังไม่ได้ตั้งเป้า"} />
      </div>

      <dl className="grid grid-cols-2 overflow-hidden rounded-[14px] border border-(--dash-ring) bg-(--dash-surface) sm:grid-cols-3 lg:grid-cols-5">
        <Mini label="Newhire เดือนนี้" value={fmtNum(t.newhire)} note="เข้าทะเบียนในเดือน" />
        <Mini label="Resign เดือนนี้" value={fmtNum(t.resign)} note={`สุทธิ ${signed(t.newhire - t.resign)} คน`} />
        <Mini label="Waiting" value={fmtNum(t.waiting)} note="รอฝึกงาน ณ วันนี้" />
        <Mini label="Training วันนี้" value={fmtNum(t.training)} note="เริ่มฝึกวันนี้" />
        <Mini label="Interview วันนี้" value={fmtNum(t.interview + unassigned)} note={unassigned ? `ยังไม่ผูกอัตรา ${fmtNum(unassigned)} คน` : "นัดสัมภาษณ์วันนี้"} />
      </dl>

      {/* ---------- สัดส่วนต่อเป้า + RC Owner */}
      <div className="grid gap-5 lg:grid-cols-12">
        <FleetCard fleets={fleets} className="lg:col-span-7" />
        <OwnerCard customers={fleets.flatMap((f) => f.customers)} className="lg:col-span-5" />
      </div>

      {/* ---------- แนวโน้ม */}
      <TrendCards board={board} scope={scope} period={period} onPeriod={setPeriod} />

      {/* ---------- ตาราง */}
      <PlantTable fleets={fleets} total={t} truck={truck} scope={scope} />

      {dialog === "line" ? <ManpowerLineDialog board={board} scope={scope} onClose={() => setDialog(null)} /> : null}
      {dialog === "targets" ? (
        <ManpowerTargetsDialog
          rows={board.rows}
          targets={board.targets}
          rcOwners={board.rcOwners}
          initialSite={scope === "all" ? "latkrabang" : scope}
          onClose={() => setDialog(null)}
          onSaved={(targets: MpTarget[]) => setBoard((b) => ({ ...b, targets }))}
        />
      ) : null}
    </div>
  );
}

const TOOL_BTN =
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--dash-ring) bg-(--dash-surface) px-3 text-13 font-medium text-(--dash-ink) transition-colors hover:bg-(--dash-hover)";

function Mini({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="-mr-px -mb-px flex flex-col gap-0.5 border-r border-b border-(--dash-grid) px-5 py-3">
      <dt className="text-12 text-(--dash-ink-2)">{label}</dt>
      <dd className="text-20 leading-tight font-semibold tabular-nums">{value}</dd>
      <dd className="text-11-5 text-(--dash-mut)">{note}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ สัดส่วนต่อเป้า */

function FleetCard({ fleets, className }: { fleets: ReturnType<typeof groupRows>; className: string }) {
  const data = fleets.map((f) => {
    const r = recruitOf(f.t);
    return { name: f.group, active: f.t.active, ojt: f.t.ojt, vacant: f.t.vacant, recruit: r, pct: pctText(actualOf(f.t), r) };
  });
  const keys = Object.keys(PEOPLE);
  return (
    <DashCard
      title="สัดส่วนคนต่อเป้า แยกกลุ่มงาน"
      sub="Active + OJT + Vacant HC = Target Recruit · ตัวเลขใต้ชื่อ = (Active + OJT) ÷ Target Recruit"
      className={className}
      action={<ChartLegend config={PEOPLE} keys={keys} />}
      table={{
        columns: [{ label: "กลุ่มงาน" }, { label: "Target Recruit", num: true }, { label: "Active", num: true }, { label: "OJT", num: true }, { label: "Vacant HC", num: true }, { label: "%", num: true }],
        rows: data.map((d) => [d.name, d.recruit, d.active, d.ojt, d.vacant, d.pct]),
      }}
    >
      {data.length ? (
        <ChartFrame height={Math.max(160, data.length * 44 + 24)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={84} interval={0} {...AXIS} tick={<FleetTick data={data} />} />
            <Tooltip
              cursor={{ fill: "var(--dash-hover)" }}
              content={(p) => (
                <ChartTooltip
                  {...p}
                  config={PEOPLE}
                  total
                  extra={(row) => <p className="text-(--dash-ink-2)">เต็มเป้า <b className="text-(--dash-ink)">{String(row.pct)}</b></p>}
                />
              )}
            />
            <Bar dataKey="active" stackId="p" fill={PEOPLE.active.color} maxBarSize={20} />
            <Bar dataKey="ojt" stackId="p" fill={PEOPLE.ojt.color} maxBarSize={20} />
            <Bar dataKey="vacant" stackId="p" fill={PEOPLE.vacant.color} radius={[0, 4, 4, 0]} maxBarSize={20} />
          </BarChart>
        </ChartFrame>
      ) : (
        <Empty />
      )}
    </DashCard>
  );
}

/** ป้ายแกนของกราฟกลุ่มงาน — ชื่อกลุ่ม + % เต็มเป้าบรรทัดล่าง */
function FleetTick({ x, y, payload, data }: { x?: number; y?: number; payload?: { value: string }; data: { name: string; pct: string }[] }) {
  const pct = data.find((d) => d.name === payload?.value)?.pct ?? "";
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={-6} y={-2} textAnchor="end" fill="var(--dash-ink)" fontSize={12}>
        {payload?.value}
      </text>
      <text x={-6} y={12} textAnchor="end" fill="var(--dash-mut)" fontSize={11}>
        {pct}
      </text>
    </g>
  );
}

function OwnerCard({ customers, className }: { customers: MpCustomerGroup[]; className: string }) {
  const owners = useMemo(() => {
    const map = new Map<string, { name: string; t: MpCounts[]; customers: string[] }>();
    for (const c of customers) {
      const name = c.target?.rcOwner || "ไม่ระบุ";
      const o = map.get(name) ?? { name, t: [], customers: [] };
      o.t.push(c.t);
      if (recruitOf(c.t)) o.customers.push(c.customer);
      map.set(name, o);
    }
    return [...map.values()]
      .map((o) => ({ name: o.name, customers: o.customers, t: sumCounts(o.t) }))
      .filter((o) => recruitOf(o.t))
      .sort((a, b) => b.t.vacant - a.t.vacant || recruitOf(b.t) - recruitOf(a.t));
  }, [customers]);

  return (
    <DashCard title="ตาม RC Owner" sub="เรียงตาม Vacant HC มาก → น้อย · RC Owner ตั้งที่ “ตั้งค่าเป้า”" className={className}>
      {owners.length ? (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full border-collapse text-12-5">
            <thead>
              <tr className="text-(--dash-mut)">
                <th className="sticky top-0 bg-(--dash-surface) py-1.5 pr-2 text-left font-medium">RC Owner</th>
                <th className="sticky top-0 bg-(--dash-surface) px-2 py-1.5 text-right font-medium">เป้า</th>
                <th className="sticky top-0 bg-(--dash-surface) px-2 py-1.5 text-right font-medium">ว่าง</th>
                <th className="sticky top-0 w-[38%] bg-(--dash-surface) py-1.5 pl-2 text-left font-medium">สัดส่วน</th>
              </tr>
            </thead>
            <tbody>
              {owners.map((o) => {
                const r = recruitOf(o.t);
                return (
                  <tr key={o.name} className="border-t border-(--dash-grid)">
                    <td className="py-2 pr-2">
                      <p className={`font-semibold ${o.name === "ไม่ระบุ" ? "text-(--dash-mut)" : ""}`}>{o.name}</p>
                      <p className="line-clamp-1 text-11-5 text-(--dash-mut)" title={o.customers.join(", ")}>
                        {o.customers.join(", ")}
                      </p>
                    </td>
                    <td className="px-2 text-right tabular-nums">{fmtNum(r)}</td>
                    <td className="px-2 text-right font-semibold tabular-nums">
                      {fmtNum(o.t.vacant)}
                      <span className="block text-11-5 font-normal text-(--dash-mut)">{pctText(o.t.vacant, r)}</span>
                    </td>
                    <td className="pl-2">
                      <Meter t={o.t} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
    </DashCard>
  );
}

/** แถบสัดส่วน Active | OJT | Vacant HC ของหนึ่งแถว */
function Meter({ t }: { t: Pick<MpCounts, "active" | "ojt" | "vacant"> }) {
  const r = recruitOf(t) || 1;
  const seg = (v: number, c: string, label: string) =>
    v ? <span title={`${label} ${fmtNum(v)} คน`} className="h-full" style={{ width: `${(v / r) * 100}%`, background: c }} /> : null;
  return (
    <div className="flex h-2 min-w-20 gap-px overflow-hidden rounded-sm">
      {seg(t.active, PEOPLE.active.color, "Active")}
      {seg(t.ojt, PEOPLE.ojt.color, "OJT")}
      {seg(t.vacant, PEOPLE.vacant.color, "Vacant HC")}
    </div>
  );
}

/* ------------------------------------------------------------------ แนวโน้ม */

type ChartPoint = Omit<MpTrendPoint, "active" | "ojt" | "vacant" | "recruit"> & {
  active: number | null;
  ojt: number | null;
  vacant: number | null;
  recruit: number | null;
};

/** รายวัน: เติมวันที่ไม่มีข้อมูลเป็นค่าว่าง เส้นจึงขาดตรงช่วงที่ไม่ได้บันทึก (เช่น 1–11 พ.ย.) ไม่ลากข้าม */
function withGaps(points: MpTrendPoint[], period: MpPeriod): ChartPoint[] {
  if (period !== "day" || points.length < 2) return points;
  const out: ChartPoint[] = [];
  const have = new Map(points.map((p) => [p.key, p]));
  const end = Date.parse(`${points[points.length - 1].key}T00:00:00Z`);
  for (let t = Date.parse(`${points[0].key}T00:00:00Z`); t <= end; t += 86_400_000) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const p = have.get(iso);
    const [, m, d] = iso.split("-").map(Number);
    out.push(p ?? { key: iso, label: `${d} ${TH_MONTH[m - 1]}`, long: `${thDate(iso)} · ไม่มีข้อมูล`, days: 0, active: null, ojt: null, vacant: null, recruit: null, fullPct: null });
  }
  return out;
}

function TrendCards({ board, scope, period, onPeriod }: { board: MpBoard; scope: MpScope; period: MpPeriod; onPeriod: (p: MpPeriod) => void }) {
  const series = useMemo(() => trendSeries(dailyPoints(board, scope), period), [board, scope, period]);
  const data = useMemo(() => withGaps(series, period), [series, period]);
  const last = series[series.length - 1];
  const prev = series[series.length - 2];
  const unit = period === "day" ? "วันก่อน" : period === "week" ? "สัปดาห์ก่อน" : "เดือนก่อน";
  const table = {
    columns: [{ label: "ช่วง" }, { label: "Active", num: true }, { label: "OJT", num: true }, { label: "Vacant HC", num: true }, { label: "Target Recruit", num: true }, { label: "% เต็มเป้า", num: true }],
    rows: [...series].reverse().map((p) => [p.long, p.active, p.ojt, p.vacant, p.recruit, p.fullPct == null ? "–" : `${p.fullPct}%`]),
  };
  const historyNote =
    scope === "all"
      ? "ก่อน 15 พ.ย. 2569 มาจากชีต Daily (ระดับบริษัท · 1–11 พ.ย. ไม่ได้บันทึก) · หลังจากนั้นระบบบันทึกเองทุกวันที่เปิดหน้านี้"
      : "ชีต Daily มีเฉพาะระดับบริษัท — ขอบเขตสาขาเริ่มมีแนวโน้มตั้งแต่วันที่ระบบเริ่มบันทึก (15 พ.ย. 2569)";
  const tick = { interval: "preserveStartEnd" as const, minTickGap: 24 };

  return (
    <section aria-label="แนวโน้ม" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-16 font-semibold">แนวโน้ม</h2>
          <p className="text-12 text-(--dash-mut)">{period === "day" ? "ยอดของแต่ละวัน" : "ค่าเฉลี่ยต่อวันของช่วง"} · {historyNote}</p>
        </div>
        <DashToggle
          label="ช่วงเวลา"
          value={period}
          onChange={onPeriod}
          options={[
            { value: "day", label: "รายวัน" },
            { value: "week", label: "รายสัปดาห์" },
            { value: "month", label: "รายเดือน" },
          ]}
        />
      </div>

      {last ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={`Active · ${last.label}`} value={last.active} unit="คน" swatch={PEOPLE.active.color} delta={prev ? { value: round1(last.active - prev.active), label: `เทียบ${unit}` } : undefined} />
          <StatTile label={`OJT · ${last.label}`} value={last.ojt} unit="คน" swatch={PEOPLE.ojt.color} delta={prev ? { value: round1(last.ojt - prev.ojt), label: `เทียบ${unit}` } : undefined} />
          <StatTile label={`Vacant HC · ${last.label}`} value={last.vacant} unit="คน" swatch={PEOPLE.vacant.color} delta={prev ? { value: round1(last.vacant - prev.vacant), label: `เทียบ${unit}` } : undefined} />
          <StatTile label={`% เต็มเป้า · ${last.label}`} value={last.fullPct ?? 0} unit="%" delta={prev && prev.fullPct != null && last.fullPct != null ? { value: round1(last.fullPct - prev.fullPct), label: `จุด เทียบ${unit}` } : undefined} />
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <DashCard title="Active เทียบ Target Recruit" sub="เส้นประ = เป้าของวันนั้น (Active + OJT + Vacant HC)" action={<ChartLegend config={LEVEL} keys={["active", "recruit"]} />} table={table}>
          {series.length ? (
            <ChartFrame height={260}>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...AXIS} {...tick} />
                <YAxis {...AXIS} allowDecimals={false} domain={[(min: number) => Math.floor((min - 10) / 10) * 10, (max: number) => Math.ceil((max + 10) / 10) * 10]} />
                <Tooltip content={(p) => <ChartTooltip {...p} label={(p.payload?.[0]?.payload as ChartPoint | undefined)?.long ?? p.label} config={LEVEL} />} />
                <Line dataKey="recruit" stroke={LEVEL.recruit.color} strokeDasharray="5 4" strokeWidth={1.5} dot={(d) => <LoneDot {...d} data={data} />} connectNulls={false} isAnimationActive={false} />
                <Line dataKey="active" stroke={LEVEL.active.color} strokeWidth={2} dot={(d) => <LoneDot {...d} data={data} />} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ChartFrame>
          ) : (
            <Empty text="ยังไม่มีข้อมูลย้อนหลังของขอบเขตนี้" />
          )}
        </DashCard>

        <DashCard title="OJT และ Vacant HC" sub="คนในท่อ (ฝึกงาน + รอรับรถ) เทียบตำแหน่งที่ยังต้องหา" action={<ChartLegend config={PIPE} keys={["ojt", "vacant"]} />} table={table}>
          {series.length ? (
            <ChartFrame height={260}>
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={1}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" {...AXIS} {...tick} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--dash-hover)" }} content={(p) => <ChartTooltip {...p} label={(p.payload?.[0]?.payload as ChartPoint | undefined)?.long ?? p.label} config={PIPE} />} />
                <Bar dataKey="ojt" fill={PIPE.ojt.color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="vacant" fill={PIPE.vacant.color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ChartFrame>
          ) : (
            <Empty text="ยังไม่มีข้อมูลย้อนหลังของขอบเขตนี้" />
          )}
        </DashCard>
      </div>
    </section>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** จุดบนเส้น — เฉพาะจุดที่ไม่มีเพื่อนบ้าน (วันเดี่ยวหลังช่วงไม่มีข้อมูล) ไม่งั้นเส้นไม่ขึ้นเลย · ข้อมูลน้อยโชว์ทุกจุด */
function LoneDot({ cx, cy, index, stroke, data }: { cx?: number; cy?: number; index?: number; stroke?: string; data: ChartPoint[] }) {
  if (cx == null || cy == null || index == null || data[index]?.active == null) return <g key={index} />;
  const lone = data.length < 20 || data[index - 1]?.active == null || data[index + 1]?.active == null;
  return lone ? <circle key={index} cx={cx} cy={cy} r={3} fill={stroke} /> : <g key={index} />;
}

/* ------------------------------------------------------------------ ตาราง */

const COLS = ["Target Truck", "Target Recruit", "Active", "OJT", "Total", "%", "Vacant HC", "Newhire", "Resign", "Waiting", "Training", "Interview"] as const;

function PlantTable({ fleets, total, truck, scope }: { fleets: ReturnType<typeof groupRows>; total: MpCounts; truck: number; scope: MpScope }) {
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set());
  const [openCustomers, setOpenCustomers] = useState<ReadonlySet<string>>(new Set());
  const customerKeys = fleets.flatMap((f) => f.customers.filter((c) => c.plants.length > 1).map((c) => c.key));
  const allOpen = closedGroups.size === 0 && customerKeys.every((k) => openCustomers.has(k));

  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <DashCard
      title="Manpower รายกลุ่มงาน · ลูกค้า · แพล้นท์"
      sub="กดแถวเพื่อเปิด/ปิด · % = (Active + OJT) ÷ Target Recruit · Target Truck = เป้ารถที่ตั้งเอง (ข้อมูลประกอบ)"
      action={
        <button
          type="button"
          onClick={() => {
            if (allOpen) {
              setClosedGroups(new Set());
              setOpenCustomers(new Set());
            } else {
              setClosedGroups(new Set());
              setOpenCustomers(new Set(customerKeys));
            }
          }}
          title={allOpen ? "ปิดแพล้นท์ทั้งหมด" : "เปิดแพล้นท์ทั้งหมด"}
          className="grid size-8 cursor-pointer place-items-center rounded-lg border border-(--dash-ring) text-(--dash-ink-2) hover:bg-(--dash-hover)"
        >
          {allOpen ? <ChevronsDownUp size={16} aria-hidden /> : <ChevronsUpDown size={16} aria-hidden />}
          <span className="sr-only">{allOpen ? "ปิดทั้งหมด" : "เปิดทั้งหมด"}</span>
        </button>
      }
    >
      <div className="max-h-[680px] overflow-auto rounded-lg border border-(--dash-grid)">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-56 border-b border-(--dash-grid) bg-(--dash-surface) px-3 py-2 text-left font-medium text-(--dash-mut)">กลุ่มงาน / ลูกค้า / แพล้นท์</th>
              <th className="sticky top-0 z-10 border-b border-(--dash-grid) bg-(--dash-surface) px-3 py-2 text-left font-medium whitespace-nowrap text-(--dash-mut)">RC Owner</th>
              {COLS.map((c) => (
                <th key={c} className="sticky top-0 z-10 border-b border-(--dash-grid) bg-(--dash-surface) px-3 py-2 text-right font-medium whitespace-nowrap text-(--dash-mut)">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fleets.length === 0 ? (
              <tr>
                <td colSpan={COLS.length + 2}>
                  <Empty />
                </td>
              </tr>
            ) : null}
            {fleets.map((f) => {
              const open = !closedGroups.has(f.group);
              return (
                <Fragment key={f.group}>
                  <tr className="cursor-pointer bg-(--dash-hover) font-semibold hover:bg-(--dash-grid)/60" onClick={() => setClosedGroups((s) => toggle(s, f.group))}>
                    <NameCell level={0} open={open} label={f.group} hint={`${f.customers.length} ลูกค้า`} />
                    <td className="px-3" />
                    <Cells r={{ ...f.t, recruit: recruitOf(f.t) }} truck={f.targetTruck || null} />
                  </tr>
                  {open
                    ? f.customers.map((c) => {
                        const many = c.plants.length > 1;
                        const cOpen = openCustomers.has(c.key);
                        return (
                          <Fragment key={c.key}>
                            <tr
                              className={`border-t border-(--dash-grid) ${many ? "cursor-pointer hover:bg-(--dash-hover)" : ""}`}
                              onClick={many ? () => setOpenCustomers((s) => toggle(s, c.key)) : undefined}
                            >
                              <NameCell level={1} open={many ? cOpen : null} label={c.customer} hint={many ? `${c.plants.length} แพล้นท์` : c.plants[0]?.plant !== c.customer ? c.plants[0]?.plant : ""} />
                              <td className="px-3 whitespace-nowrap text-(--dash-ink-2)">{c.target?.rcOwner || <span className="text-(--dash-axis)">–</span>}</td>
                              <Cells r={{ ...c.t, recruit: recruitOf(c.t) }} truck={c.target?.targetTruck ?? null} />
                            </tr>
                            {many && cOpen
                              ? c.plants.map((p) => (
                                  <tr key={p.key} className="border-t border-(--dash-grid)/70 text-(--dash-ink-2)">
                                    <NameCell level={2} open={null} label={p.plant} />
                                    <td />
                                    <Cells r={{ ...p, recruit: recruitOf(p) }} truck={null} />
                                  </tr>
                                ))
                              : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
          </tbody>
          {fleets.length ? (
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky bottom-0 left-0 z-20 border-t border-(--dash-axis) bg-(--dash-surface) px-3 py-2">รวม{scope === "all" ? "ทั้งหมด" : ` ${scopeLabel(scope)}`}</td>
                <td className="sticky bottom-0 border-t border-(--dash-axis) bg-(--dash-surface)" />
                <Cells r={{ ...total, recruit: recruitOf(total) }} truck={truck || null} sticky />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </DashCard>
  );
}

function NameCell({ level, open, label, hint }: { level: 0 | 1 | 2; open: boolean | null; label: string; hint?: string }) {
  const pad = level === 0 ? "pl-2" : level === 1 ? "pl-7" : "pl-14";
  return (
    <td className={`sticky left-0 z-10 bg-(--dash-surface) py-2 pr-3 ${pad} ${level === 0 ? "bg-[color-mix(in_oklab,var(--dash-surface),var(--dash-ink)_4%)]" : ""}`}>
      <span className="flex items-center gap-1.5">
        {open === null ? (
          <span className="w-4 flex-none" />
        ) : (
          <ChevronRight size={14} aria-hidden className={`flex-none text-(--dash-mut) transition-transform ${open ? "rotate-90" : ""}`} />
        )}
        <span className={level === 2 ? "" : "text-(--dash-ink)"}>{label}</span>
        {hint ? <span className="text-11-5 font-normal whitespace-nowrap text-(--dash-mut)">{hint}</span> : null}
      </span>
    </td>
  );
}

function Cells({ r, truck, sticky = false }: { r: Row; truck: number | null; sticky?: boolean }) {
  const cell = `px-3 py-2 text-right tabular-nums whitespace-nowrap ${sticky ? "sticky bottom-0 border-t border-(--dash-axis) bg-(--dash-surface)" : ""}`;
  const z = (v: number | null) => (v ? fmtNum(v) : <span className="text-(--dash-axis)">–</span>);
  const tot = actualOf(r);
  return (
    <>
      <td className={cell}>{z(truck)}</td>
      <td className={cell}>{z(r.recruit)}</td>
      <td className={cell}>{z(r.active)}</td>
      <td className={cell}>{z(r.ojt)}</td>
      <td className={cell}>{z(tot)}</td>
      <td className={cell}>{r.recruit ? pctText(tot, r.recruit) : <span className="text-(--dash-axis)">–</span>}</td>
      <td className={`${cell} ${r.vacant ? "font-semibold text-(--dash-ink)" : ""}`}>{z(r.vacant)}</td>
      <td className={cell}>{z(r.newhire)}</td>
      <td className={cell}>{z(r.resign)}</td>
      <td className={cell}>{z(r.waiting)}</td>
      <td className={cell}>{z(r.training)}</td>
      <td className={cell}>{z(r.interview)}</td>
    </>
  );
}

function Empty({ text = "ไม่มีข้อมูลในขอบเขตนี้" }: { text?: string }) {
  return <p className="grid h-32 place-items-center text-13 text-(--dash-mut)">{text}</p>;
}

/* ------------------------------------------------------------------ Excel */

interface ExportRow {
  level: string;
  group: string;
  customer: string;
  plant: string;
  rcOwner: string;
  truck: number | null;
  c: MpCounts;
}

function ExportButton({ fleets, scope, today }: { fleets: ReturnType<typeof groupRows>; scope: MpScope; today: string }) {
  const rows: ExportRow[] = fleets.flatMap((f) => [
    { level: "กลุ่มงาน", group: f.group, customer: "", plant: "", rcOwner: "", truck: f.targetTruck || null, c: f.t },
    ...f.customers.flatMap((c) => [
      { level: "ลูกค้า", group: f.group, customer: c.customer, plant: "", rcOwner: c.target?.rcOwner ?? "", truck: c.target?.targetTruck ?? null, c: c.t },
      ...c.plants.map((p) => ({ level: "แพล้นท์", group: f.group, customer: c.customer, plant: p.plant, rcOwner: "", truck: null, c: p })),
    ]),
  ]);
  const n = (header: string, value: (r: ExportRow) => number | null, width = 11): XlsxColumn<ExportRow> => ({ header, width, kind: "int", value });
  const columns: XlsxColumn<ExportRow>[] = [
    { header: "ระดับ", width: 9, value: (r) => r.level },
    { header: "กลุ่มงาน", width: 12, value: (r) => r.group },
    { header: "ลูกค้า", width: 18, value: (r) => r.customer },
    { header: "แพล้นท์", width: 22, value: (r) => r.plant },
    { header: "RC Owner", width: 12, value: (r) => r.rcOwner },
    n("Target Truck", (r) => r.truck),
    n("Target Recruit", (r) => recruitOf(r.c), 13),
    n("Active", (r) => r.c.active),
    n("OJT", (r) => r.c.ojt),
    n("Total", (r) => actualOf(r.c)),
    { header: "%", width: 9, kind: "decimal", value: (r) => (recruitOf(r.c) ? Math.round((actualOf(r.c) / recruitOf(r.c)) * 1000) / 10 : null) },
    n("Vacant HC", (r) => r.c.vacant),
    n("รอสรรหา", (r) => r.c.open),
    n("Waiting (รอฝึกงาน)", (r) => r.c.waiting, 16),
    n("Newhire", (r) => r.c.newhire),
    n("Resign", (r) => r.c.resign),
    n("Training (เริ่มฝึกวันนี้)", (r) => r.c.training, 18),
    n("Interview (วันนี้)", (r) => r.c.interview, 15),
  ];
  return (
    <XlsxExportButton
      className="h-9 px-3 text-13"
      name="Manpower-รายวัน"
      count={rows.length}
      build={() => ({
        sheet: "Manpower",
        title: `Manpower พจส. รายวัน · ${thDate(today)}`,
        filter: scope === "all" ? "" : `ขอบเขต: ${scopeLabel(scope)}`,
        columns,
        rows,
      })}
    />
  );
}
