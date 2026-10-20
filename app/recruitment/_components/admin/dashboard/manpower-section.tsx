"use client";

import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";

import {
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  clip,
  type ChartConfig,
} from "@/components/dashboard/chart";
import { DashCard, DashToggle, StatTile } from "@/components/dashboard/card";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import type { XlsxColumn } from "@/lib/xlsx-table";
import type { ManpowerBoard, ManpowerRow, OnboardStatus } from "@/app/recruitment/_lib/dashboard/manpower";

/**
 * หมวด Manpower — ดูกำลังคนได้หลายมิติ: ลูกค้า → แพล้นท์ (เจาะได้) · เวลา (รายเดือน) ·
 * สัดส่วนคนลาออกรายแพล้นท์ (ออกเกินครึ่ง = น่าเป็นห่วง)
 *
 * `rows` = แถวที่หน้ากรองลูกค้า (ลูกค้าหลัก รวม MS) มาแล้ว · `customer` ว่าง = ทุกลูกค้า → กราฟแบ่งตามลูกค้า
 * และกดลูกค้าเพื่อเจาะ (`onCustomer`) · เลือกลูกค้าแล้ว → กราฟชุดเดิมแบ่งตามแพล้นท์ของลูกค้านั้น
 * · ลำดับซีรีส์ = ลำดับสี `--s1…` (ห้ามสลับ)
 */

type People = "working" | "waitTraining" | "training" | "waitHandover";

const PEOPLE: ChartConfig = {
  working: { label: "ปฏิบัติงาน", color: "var(--s1)" },
  waitTraining: { label: "รอฝึกงาน", color: "var(--s2)" },
  training: { label: "กำลังฝึกงาน", color: "var(--s3)" },
  waitHandover: { label: "รอรับรถ", color: "var(--s4)" },
};
const PEOPLE_KEYS = Object.keys(PEOPLE) as People[];

const FLOW: ChartConfig = {
  joined: { label: "เข้า", color: "var(--s1)" },
  left: { label: "ออก", color: "var(--s2)" },
};
/* ออก = สีขั้วลบของสเกลสองขั้ว · ยังอยู่ = น้ำเงินจาง (ส่วนที่ไม่ต้องสนใจ) */
const SHARE: ChartConfig = {
  share: { label: "ออกปีนี้", color: "var(--dash-neg)" },
  stay: { label: "ยังอยู่", color: "color-mix(in oklab, var(--s1) 28%, var(--dash-surface))" },
};
/** กลุ่มสีของกราฟสถานะ Onboarding */
const ONBOARD_GROUP: ChartConfig = {
  active: { label: "ระหว่างดำเนินการ", color: "var(--s1)" },
  success: { label: "รับรถแล้ว", color: "var(--s2)" },
  withdrawn: { label: "ยกเลิก/สละสิทธิ์", color: "var(--s3)" },
  lost: { label: "หลุดระหว่างฝึก", color: "var(--s4)" },
};
const ONBOARD: { key: OnboardStatus; label: string; group: keyof typeof ONBOARD_GROUP | "none" }[] = [
  { key: "waitTraining", label: "รอฝึกงาน", group: "active" },
  { key: "training", label: "กำลังฝึกงาน", group: "active" },
  { key: "waitHandover", label: "รอรับรถ", group: "active" },
  { key: "handedOver", label: "รับรถแล้ว", group: "success" },
  { key: "cancelled", label: "ยกเลิกฝึกงาน", group: "withdrawn" },
  { key: "waived", label: "สละสิทธิ์", group: "withdrawn" },
  { key: "trialExit", label: "ฝึกงาน 1-2 วันแล้วออก", group: "lost" },
  { key: "leftBeforeHandover", label: "ลาออก/ปลด ก่อนรับรถ", group: "lost" },
  { key: "unknown", label: "ไม่ระบุ", group: "none" },
];
/** ออกเกิน 2 ใน 3 ของคนทั้งหมดที่เคยอยู่ปีนี้ = น่าเป็นห่วง (ค่าเฉลี่ยบริษัทราว 40% · ปี 2569) */
const CONCERN = 67;
/** คนรวมขั้นต่ำ — แพล้นท์เล็กมาก ออก 1 คนก็เป็น 50% ไม่ใช่สัญญาณจริง */
const MIN_PEOPLE = 5;

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const AXIS = { tickLine: false, axisLine: false } as const;
const net = (r: Pick<ManpowerRow, "joined" | "left">) => r.joined - r.left;
/** ลูกค้าหลัก — ทะเบียนแยก Mixer S เป็น “<ลูกค้า> MS” */
export const baseCustomer = (c: string) => c.replace(/\s+MS$/i, "");

function sum(rows: ManpowerRow[]) {
  const t = { working: 0, open: 0, waitTraining: 0, training: 0, waitHandover: 0, joined: 0, left: 0 };
  for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k];
  return t;
}

interface Group extends Record<People, number> {
  name: string;
  open: number;
  joined: number;
  left: number;
  joinedByMonth: number[];
  leftByMonth: number[];
}

/** รวมแถวตาม `by` (ลูกค้า หรือ แพล้นท์) — ทุกกราฟใช้ชุดนี้ */
function groupBy(rows: ManpowerRow[], by: (r: ManpowerRow) => string): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const name = by(r);
    const g: Group = m.get(name) ?? {
      name,
      working: 0,
      waitTraining: 0,
      training: 0,
      waitHandover: 0,
      open: 0,
      joined: 0,
      left: 0,
      joinedByMonth: Array(12).fill(0),
      leftByMonth: Array(12).fill(0),
    };
    for (const k of PEOPLE_KEYS) g[k] += r[k];
    g.open += r.open;
    g.joined += r.joined;
    g.left += r.left;
    r.joinedByMonth.forEach((v, i) => (g.joinedByMonth[i] += v));
    r.leftByMonth.forEach((v, i) => (g.leftByMonth[i] += v));
    m.set(name, g);
  }
  return [...m.values()].sort(
    (a, b) =>
      PEOPLE_KEYS.reduce((n, k) => n + b[k] - a[k], 0) || b.left - a.left || a.name.localeCompare(b.name, "th"),
  );
}

export function ManpowerSection({
  board,
  rows,
  customer,
  onCustomer,
}: {
  board: ManpowerBoard;
  rows: ManpowerRow[];
  /** ลูกค้าหลักที่กรองอยู่ · ว่าง = ทุกลูกค้า */
  customer: string;
  onCustomer: (customer: string) => void;
}) {
  const [shareMode, setShareMode] = useState<"plant" | "customer">("customer");
  const t = useMemo(() => sum(rows), [rows]);
  const yearTh = board.year + 543;
  /* กดลูกค้าในกราฟ = เจาะลงไปดูแพล้นท์ของลูกค้านั้น (ตอนดูทุกลูกค้าเท่านั้น) */
  const drill = customer ? undefined : onCustomer;

  const groups = useMemo(
    () => groupBy(rows, customer ? (r) => r.plant : (r) => baseCustomer(r.customer)),
    [rows, customer],
  );

  /* เดือนที่ผ่านมาแล้วของปีนี้ (ตามเวลาไทยตอนอ่านข้อมูล) */
  const monthsSoFar = new Date(Date.parse(board.readAt) + 7 * 3_600_000).getUTCMonth() + 1;
  const months = useMemo(() => MONTHS.slice(0, monthsSoFar), [monthsSoFar]);
  const flow = useMemo(
    () =>
      months.map((name, i) => ({
        name,
        joined: rows.reduce((n, r) => n + r.joinedByMonth[i], 0),
        left: rows.reduce((n, r) => n + r.leftByMonth[i], 0),
      })),
    [rows, months],
  );

  /* ── สัดส่วนคนออก: ออกปีนี้ ÷ (คนที่อยู่ตอนนี้ + ออกปีนี้) = ในคนทั้งหมดที่เคยอยู่ปีนี้ ออกไปกี่ % ── */
  /* ค่าตั้งต้นแบ่งตามลูกค้า · เลือกลูกค้าแล้ว = แพล้นท์ของลูกค้านั้นเสมอ (ไม่มีปุ่มสลับ) */
  const shareBy = customer ? "plant" : shareMode;
  const shareUnit = shareBy === "plant" ? "แพล้นท์" : "ลูกค้า";
  const shares = useMemo(() => {
    const pick = (g: { name: string; working: number; left: number; joined: number }) => ({
      name: g.name,
      working: g.working,
      left: g.left,
      joined: g.joined,
    });
    const list =
      shareBy === "customer" || customer
        ? groups.map(pick)
        : rows.map((r) => pick({ ...r, name: `${r.plant} · ${r.customer}` }));
    return list
      .filter((g) => g.left > 0 && g.working + g.left >= MIN_PEOPLE)
      .map((g) => {
        const share = Math.round((g.left / (g.working + g.left)) * 100);
        return { ...g, share, stay: 100 - share, label: `${share}% · ${g.left}/${g.working + g.left}` };
      })
      .sort((x, y) => y.share - x.share || y.left - x.left)
      .slice(0, 15);
  }, [rows, groups, customer, shareBy]);
  const avgShare = t.working + t.left ? Math.round((t.left / (t.working + t.left)) * 100) : 0;
  /* แบ่งตามลูกค้าตอนดูทุกลูกค้า = กดแท่งเพื่อเจาะได้เหมือนกราฟอื่น */
  const shareDrill = shareBy === "customer" ? drill : undefined;
  const concern = shares.filter((x) => x.share >= CONCERN).length;
  const concernNames = new Set(shares.filter((x) => x.share >= CONCERN).map((x) => x.name));

  const pipe = t.waitTraining + t.training + t.waitHandover;
  const chartH = Math.max(320, shares.length * 30 + 36);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="ปฏิบัติงาน"
          value={t.working}
          unit="คน"
          swatch={PEOPLE.working.color}
          note={`${rows.filter((r) => r.working).length} แพล้นท์ · Mixer L ${rows.reduce((n, r) => n + r.mixerL, 0)} · Mixer S ${rows.reduce((n, r) => n + r.mixerS, 0)}`}
        />
        <StatTile
          label="อยู่ระหว่าง Onboarding"
          value={pipe}
          unit="คน"
          note={`รอฝึก ${t.waitTraining} · ฝึก ${t.training} · รอรับรถ ${t.waitHandover}`}
        />
        <StatTile label="อัตราว่าง" value={t.open} unit="อัตรา" note="คำขอสรรหาที่ยังไม่มีคน" />
        <StatTile
          label={`เข้าใหม่ ปี ${yearTh}`}
          value={t.joined}
          unit="คน"
          delta={{ value: net(t), label: "สุทธิ" }}
          note={`ออก ${t.left.toLocaleString("th-TH")} คน`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <DashCard
          className="xl:col-span-7"
          title={`สัดส่วนคนลาออกราย${shareUnit}${customer ? ` · ${customer}` : ""}`}
          sub={
            <>
              ออกปี {yearTh} ÷ (คนตอนนี้ + ออก) · เรียงจากมากสุด{shareBy === "plant" ? " 15 แพล้นท์" : ""} · เฉพาะ
              {shareUnit}ที่มีคนรวม {MIN_PEOPLE} คนขึ้นไป ·
              เส้นประ = เฉลี่ย{customer ? ` ${customer}` : "ทั้งบริษัท"} {avgShare}%
              {concern ? (
                <span className="ml-1.5 inline-flex items-center gap-1 font-medium text-(--dash-down)">
                  <AlertTriangle size={12} aria-hidden />
                  ออกเกิน 2 ใน 3 · {concern} {shareUnit}
                </span>
              ) : null}
            </>
          }
          action={
            <>
              <ChartLegend config={SHARE} keys={["share", "stay"]} />
              {customer ? null : (
                <DashToggle
                  label="แบ่งตาม"
                  value={shareMode}
                  onChange={setShareMode}
                  options={[
                    { value: "customer", label: "ลูกค้า" },
                    { value: "plant", label: "แพล้นท์" },
                  ]}
                />
              )}
            </>
          }
          table={{
            columns: [
              { label: shareUnit },
              { label: "ปฏิบัติงาน", num: true },
              { label: "เข้า", num: true },
              { label: "ออก", num: true },
              { label: "สัดส่วนออก %", num: true },
            ],
            rows: shares.map((x) => [x.name, x.working, x.joined, x.left, x.share]),
          }}
        >
          {shares.length ? (
            <ChartFrame height={chartH}>
              <BarChart data={shares} layout="vertical" margin={{ top: 4, right: 92, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" {...AXIS} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={shareBy === "customer" ? 110 : customer ? 130 : 170}
                  {...AXIS}
                  tick={(p) => (
                    <ShareTick {...p} concern={concernNames} width={shareBy === "customer" ? 15 : customer ? 18 : 24} />
                  )}
                />
                <Tooltip cursor={{ fill: "var(--dash-hover)" }} content={(p) => <ShareTip {...p} />} />
                <Bar
                  dataKey="share"
                  stackId="s"
                  fill={SHARE.share.color}
                  radius={[4, 0, 0, 4]}
                  maxBarSize={16}
                  cursor={shareDrill ? "pointer" : undefined}
                  onClick={
                    shareDrill
                      ? (d) => shareDrill(String((d as { payload?: { name?: unknown } }).payload?.name ?? ""))
                      : undefined
                  }
                >
                  {/* ป้ายวางท้ายแถบ 100% เสมอ — ผูกกับแท่ง “ออก” เพราะแพล้นท์ที่ออก 100% ไม่มีแท่ง “ยังอยู่” ให้ผูก */}
                  <LabelList dataKey="label" content={(p) => <ShareLabel {...p} />} />
                </Bar>
                <Bar dataKey="stay" stackId="s" fill={SHARE.stay.color} radius={[0, 4, 4, 0]} maxBarSize={16} />
                <ReferenceLine x={avgShare} stroke="var(--dash-ink-2)" strokeDasharray="4 3" />
              </BarChart>
            </ChartFrame>
          ) : (
            <p className="grid h-60 place-items-center text-13 text-(--dash-mut)">ยังไม่มี{shareUnit}ที่มีคนออกปีนี้</p>
          )}
        </DashCard>

        <OnboardStatusCard rows={rows} yearTh={yearTh} />

        <DashCard
          className="xl:col-span-12"
          title={`คนเข้า–ออก รายเดือน ปี ${yearTh}`}
          sub="เข้า = วันเริ่มงาน · ออก = วันพ้นสภาพ (ทะเบียน พจส.)"
          action={<ChartLegend config={FLOW} keys={["joined", "left"]} />}
          table={{
            columns: [
              { label: "เดือน" },
              { label: "เข้า", num: true },
              { label: "ออก", num: true },
              { label: "สุทธิ", num: true },
            ],
            rows: flow.map((f) => [f.name, f.joined, f.left, net(f)]),
          }}
        >
          <ChartFrame height={300}>
            <BarChart data={flow} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis {...AXIS} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--dash-hover)" }}
                content={(p) => (
                  <ChartTooltip
                    {...p}
                    config={FLOW}
                    extra={(row) => <NetLine value={Number(row.joined) - Number(row.left)} />}
                  />
                )}
              />
              <Bar dataKey="joined" fill={FLOW.joined.color} radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="left" fill={FLOW.left.color} radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ChartFrame>
        </DashCard>
      </div>

      <PivotTable key={customer} rows={rows} yearTh={yearTh} total={board.rows.length} customer={customer} />
    </div>
  );
}

/* ------------------------------------------------------------- สถานะ Onboarding */

/** ทุกคนที่ RC ส่งเข้าฝึกปีนี้ แยกตามสถานะล่าสุด — แท่งแนวนอน ลำดับตามขั้น (ไม่เรียงตามจำนวน) */
function OnboardStatusCard({ rows, yearTh }: { rows: ManpowerRow[]; yearTh: number }) {
  const counts = ONBOARD.map((s) => ({ ...s, n: rows.reduce((n, r) => n + r.onboard[s.key], 0) }));
  const total = counts.reduce((n, c) => n + c.n, 0);
  const max = Math.max(1, ...counts.map((c) => c.n));
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <DashCard
      className="xl:col-span-5"
      title="สถานะ Onboarding"
      sub={`ทุกคนที่ RC แจ้งฝึกงานในปี ${yearTh} แยกตามสถานะล่าสุด${total ? ` · ${total.toLocaleString("th-TH")} คน` : ""}`}
      table={{
        columns: [{ label: "สถานะ" }, { label: "คน", num: true }, { label: "%", num: true }],
        rows: counts.map((c) => [c.label, c.n, pct(c.n)]),
      }}
    >
      <div className="mb-3">
        <ChartLegend config={ONBOARD_GROUP} keys={Object.keys(ONBOARD_GROUP)} />
      </div>
      {total ? (
        <ul className="flex flex-col gap-2.5">
          {counts.map((c) => (
            <li
              key={c.key}
              className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-3 text-12-5"
              title={`${c.label} · ${c.n} คน (${pct(c.n)}%)`}
            >
              <span className="truncate text-(--dash-ink-2)">{c.label}</span>
              <span className="h-3.5">
                {c.n ? (
                  <span
                    className="block h-full min-w-1 rounded-r-[4px]"
                    style={{
                      width: `${(c.n / max) * 100}%`,
                      background: c.group === "none" ? "var(--dash-mut)" : ONBOARD_GROUP[c.group].color,
                    }}
                  />
                ) : null}
              </span>
              <span className="text-right tabular-nums">
                <span className={c.n ? "font-semibold text-(--dash-ink)" : MUTED}>{c.n || "–"}</span>
                <span className="ml-1.5 text-11-5 text-(--dash-mut)">{c.n ? `${pct(c.n)}%` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="grid h-60 place-items-center text-13 text-(--dash-mut)">ยังไม่มีพนักงานใหม่ที่แจ้งฝึกงานปีนี้</p>
      )}
    </DashCard>
  );
}

/* ------------------------------------------------------------- ชิ้นย่อยของกราฟ */

/** ป้ายแกนของกราฟสัดส่วน — แพล้นท์ที่ออกเกินครึ่งมีไอคอนเตือน + ตัวหนา (ไม่ใช้สีอย่างเดียว) */
function ShareTick({
  x,
  y,
  payload,
  concern,
  width,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  concern: ReadonlySet<string>;
  width: number;
}) {
  const name = String(payload?.value ?? "");
  const hot = concern.has(name);
  return (
    <text
      x={Number(x) - 4}
      y={Number(y)}
      dy={4}
      textAnchor="end"
      style={{
        fill: hot ? "var(--dash-down)" : "var(--dash-mut)",
        fontSize: 11.5,
        fontWeight: hot ? 600 : 400,
      }}
    >
      {hot ? "⚠ " : ""}
      {clip(name, width)}
    </text>
  );
}

/** ป้าย “62% · 13/21” ท้ายแถบ — คิดจุด 100% จากความกว้างแท่ง “ออก” ÷ สัดส่วน */
function ShareLabel({
  x,
  y,
  width,
  height,
  value,
}: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
}) {
  const label = String(value ?? "");
  const share = Number.parseInt(label, 10);
  if (!share) return null;
  const end = Number(x) + (Number(width) * 100) / share;
  return (
    <text
      x={end + 6}
      y={Number(y) + Number(height) / 2}
      dy={4}
      style={{ fill: "var(--dash-ink-2)", fontSize: 11.5 }}
    >
      {label}
    </text>
  );
}

interface TipProps {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
}

function ShareTip({ active, payload }: TipProps) {
  const d = payload?.[0]?.payload as
    | { name?: string; working?: number; joined?: number; left?: number; share?: number }
    | undefined;
  if (!active || !d?.name) return null;
  return (
    <TipBox title={d.name}>
      <TipRow label="ปฏิบัติงานตอนนี้" value={d.working ?? 0} />
      <TipRow label="เข้าปีนี้" value={d.joined ?? 0} />
      <TipRow label="ออกปีนี้" value={d.left ?? 0} />
      <TipRow label="สัดส่วนคนออก" value={`${d.share ?? 0}%`} />
    </TipBox>
  );
}

function TipBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-44 rounded-[10px] border border-(--dash-ring) bg-(--dash-raise) px-3 py-2.5 text-12 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)]">
      <p className="mb-1.5 font-semibold text-(--dash-ink)">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function TipRow({ label, value }: { label: string; value: number | string }) {
  return (
    <p className="flex justify-between gap-4 text-(--dash-ink-2)">
      {label}
      <span className="font-semibold text-(--dash-ink) tabular-nums">
        {typeof value === "number" ? value.toLocaleString("th-TH") : value}
      </span>
    </p>
  );
}

function NetLine({ value }: { value: number }) {
  return (
    <p className="flex justify-between text-(--dash-ink-2)">
      สุทธิ
      <span
        className={`font-semibold tabular-nums ${value < 0 ? "text-(--dash-down)" : value > 0 ? "text-(--dash-up)" : ""}`}
      >
        {value > 0 ? "+" : ""}
        {value}
      </span>
    </p>
  );
}
/* ------------------------------------------------------------------ Manpower pivot */

type Totals = ReturnType<typeof sum>;
type ValueKey = People | "open" | "joined" | "left" | "net";
type SortKey = "name" | People | "open" | "net";

interface PivotGroup {
  name: string;
  rows: ManpowerRow[];
  t: Totals;
}

/** แถวของไฟล์ Excel — แพล้นท์ · รวมลูกค้า · รวมทั้งหมด */
interface PivotXlsxRow {
  customer: string;
  plant: string;
  t: Totals;
  kind: "plant" | "sub" | "total";
}

/** ขั้นก่อนปฏิบัติงาน — แยกคอลัมน์ละขั้น */
const PIPE: { key: People; label: string; hint: string }[] = [
  { key: "waitTraining", label: "รอฝึกงาน", hint: "ผ่านสัมภาษณ์แล้ว ยังไม่เริ่มฝึก" },
  { key: "training", label: "กำลังฝึกงาน", hint: "อยู่ระหว่างฝึกงาน" },
  { key: "waitHandover", label: "รอรับรถ", hint: "ฝึกครบแล้ว รอรับรถ" },
];

const valueOf = (t: Totals, k: ValueKey) => (k === "net" ? net(t) : t[k]);
const byName = (a: string, b: string) =>
  a.localeCompare(b, "th", { numeric: true });
const GROUP_BG = "color-mix(in oklab, var(--s1) 6%, var(--dash-surface))";
const MUTED = "text-(--dash-mut)/50";

/**
 * Pivot กำลังคน — แถว = ลูกค้า → แพล้นท์ · คอลัมน์: ปฏิบัติงาน · รอฝึกงาน · กำลังฝึกงาน · รอรับรถ · อัตราว่าง · เข้า–ออกปีนี้ (สุทธิ)
 * · เริ่มแบบยุบทุกลูกค้า · เลือกลูกค้าจากตัวกรองหน้า (เหลือ L/MS) = กางให้เลย · กำลังค้นหา = กางกลุ่มที่ตรง
 * · Excel แยก เข้า/ออก/สุทธิ เป็นคนละคอลัมน์
 * · ยังไม่เลือกลูกค้า = กลุ่มละลูกค้าหลัก (รวม MS · แพล้นท์ MS มีป้าย) · เลือกแล้ว = แยกกลุ่ม L กับ MS
 */
function PivotTable({
  rows,
  yearTh,
  total,
  customer,
}: {
  rows: ManpowerRow[];
  yearTh: number;
  total: number;
  customer: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "working",
    desc: true,
  });
  /* คอมโพเนนต์ถูก remount เมื่อเปลี่ยนลูกค้า (key) — เลือกลูกค้าแล้วเหลือแค่ L/MS จึงกางไว้ก่อน */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(customer ? rows.map((r) => r.customer) : []),
  );
  const q = useDeferredValue(query.trim().toLowerCase());

  const groups = useMemo<PivotGroup[]>(() => {
    const dir = sort.desc ? -1 : 1;
    const m = new Map<string, ManpowerRow[]>();
    for (const r of rows) {
      if (q && !`${r.plant} ${r.customer}`.toLowerCase().includes(q)) continue;
      const name = customer ? r.customer : baseCustomer(r.customer);
      m.set(name, [...(m.get(name) ?? []), r]);
    }
    const order = <T,>(
      a: T,
      b: T,
      name: (x: T) => string,
      t: (x: T) => Totals,
    ) =>
      sort.key === "name"
        ? byName(name(a), name(b)) * dir
        : (valueOf(t(a), sort.key) - valueOf(t(b), sort.key)) * dir ||
          byName(name(a), name(b));
    return [...m]
      .map(([name, rs]) => ({
        name,
        rows: rs.sort((a, b) =>
          order(
            a,
            b,
            (x) => x.plant,
            (x) => x,
          ),
        ),
        t: sum(rs),
      }))
      .sort((a, b) =>
        order(
          a,
          b,
          (x) => x.name,
          (x) => x.t,
        ),
      );
  }, [rows, q, sort, customer]);

  const grand = sum(groups.flatMap((g) => g.rows));
  const plants = groups.reduce((n, g) => n + g.rows.length, 0);
  const maxGroup = Math.max(1, ...groups.map((g) => g.t.working));
  const maxPlant = Math.max(
    1,
    ...groups.flatMap((g) => g.rows.map((r) => r.working)),
  );
  const isOpen = (name: string) => Boolean(q) || expanded.has(name);
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.name));

  const toggle = (name: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" },
    );

  /* Excel = ตัวเลขครบ · บนจอรวม เข้า/ออก/สุทธิ ไว้ช่องเดียว */
  const exportCols: { key: ValueKey; label: string }[] = [
    { key: "working", label: "ปฏิบัติงาน" },
    ...PIPE.map(({ key, label }) => ({ key, label })),
    { key: "open", label: "อัตราว่าง" },
    { key: "joined", label: `เข้า ${yearTh}` },
    { key: "left", label: `ออก ${yearTh}` },
    { key: "net", label: `สุทธิ ${yearTh}` },
  ];
  const xlsxRows: PivotXlsxRow[] = [
    ...groups.flatMap((g) => [
      ...g.rows.map((r) => ({
        customer: r.customer,
        plant: r.plant,
        t: r,
        kind: "plant" as const,
      })),
      {
        customer: g.name,
        plant: `รวม ${g.name}`,
        t: g.t,
        kind: "sub" as const,
      },
    ]),
    { customer: "รวมทั้งหมด", plant: "", t: grand, kind: "total" },
  ];
  const xlsx: XlsxColumn<PivotXlsxRow>[] = [
    {
      header: "ลูกค้า",
      width: 16,
      kind: "text",
      value: (r) => r.customer,
      tone: (r) => (r.kind === "plant" ? null : "ok"),
    },
    {
      header: "แพล้นท์",
      width: 24,
      kind: "text",
      value: (r) => r.plant,
      tone: (r) => (r.kind === "plant" ? null : "ok"),
    },
    ...exportCols.map((c): XlsxColumn<PivotXlsxRow> => ({
      header: c.label,
      width: 11,
      kind: "int",
      value: (r) => valueOf(r.t, c.key),
      tone: (r) =>
        c.key === "net" && net(r.t) < 0
          ? "alert"
          : r.kind === "plant"
            ? null
            : "ok",
    })),
  ];

  const sortHead = (
    key: SortKey,
    label: string,
    hint: string,
    className = "",
  ) => {
    const on = sort.key === key;
    return (
      <th
        aria-sort={on ? (sort.desc ? "descending" : "ascending") : undefined}
        className={`border-b border-(--dash-grid) bg-(--dash-surface) p-0 text-12 font-medium whitespace-nowrap ${className}`}
      >
        <button
          type="button"
          onClick={() => sortBy(key)}
          title={hint}
          className={`flex w-full cursor-pointer items-center gap-1 px-3 py-2.5 ${key === "name" ? "" : "justify-end"} ${
            on
              ? "text-(--dash-ink)"
              : "text-(--dash-mut) hover:text-(--dash-ink)"
          }`}
        >
          {label}
          {on ? (
            sort.desc ? (
              <ArrowDown size={12} aria-hidden />
            ) : (
              <ArrowUp size={12} aria-hidden />
            )
          ) : null}
        </button>
      </th>
    );
  };

  /** ปฏิบัติงาน — ตัวเลข + แท่งเทียบกับแถวระดับเดียวกัน · กลุ่มมี % ของทั้งหมด */
  const workingCell = (v: number, max: number, share?: number) => (
    <td className="px-3 py-2">
      <div className="flex items-center justify-end gap-2.5">
        {share !== undefined && v ? (
          <span className="hidden text-11-5 text-(--dash-mut) tabular-nums sm:inline">
            {share}%
          </span>
        ) : null}
        <span
          aria-hidden
          className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-(--dash-grid) sm:block"
        >
          <span
            className="block h-full rounded-full"
            style={{ width: `${(v / max) * 100}%`, background: "var(--s1)" }}
          />
        </span>
        <span
          className={`w-8 text-right tabular-nums ${v ? "text-(--dash-ink)" : MUTED} ${share !== undefined ? "font-semibold" : ""}`}
        >
          {v || "–"}
        </span>
      </div>
    </td>
  );

  /** ช่องตัวเลขธรรมดา — 0 เป็นขีดจาง */
  const numCell = (v: number, strong: boolean, className = "") => (
    <td
      className={`px-3 py-2 text-right tabular-nums ${className} ${v ? (strong ? "font-semibold text-(--dash-ink)" : "text-(--dash-ink-2)") : MUTED}`}
    >
      {v || "–"}
    </td>
  );
  const pipeCells = (t: Totals, strong: boolean) =>
    PIPE.map((p) => <Fragment key={p.key}>{numCell(t[p.key], strong)}</Fragment>);

  const openCell = (v: number, strong: boolean) =>
    numCell(v, strong, "hidden sm:table-cell");

  /** เข้า–ออก — บรรทัดบน = สุทธิ (ขึ้น/ลง) · บรรทัดล่าง = เข้า · ออก */
  const flowCell = (t: Totals, strong: boolean) => {
    const v = net(t);
    return (
      <td className="border-l border-(--dash-grid) px-3 py-1.5 text-right whitespace-nowrap tabular-nums">
        <span
          className={`inline-flex items-center gap-0.5 ${strong ? "font-semibold" : ""} ${
            v < 0
              ? "text-(--dash-down)"
              : v > 0
                ? "text-(--dash-up)"
                : MUTED
          }`}
        >
          {v > 0 ? <ArrowUp size={11} aria-hidden /> : null}
          {v < 0 ? <ArrowDown size={11} aria-hidden /> : null}
          {v > 0 ? `+${v}` : v || "–"}
        </span>
        <span className="block text-10-5 leading-tight whitespace-nowrap text-(--dash-mut)">
          {t.joined || t.left ? `เข้า ${t.joined} · ออก ${t.left}` : ""}
        </span>
      </td>
    );
  };

  const nameCol = "sticky left-0 z-[5]";

  return (
    <DashCard
      title="Manpower pivot"
      sub={`${groups.length.toLocaleString("th-TH")} ลูกค้า · ${plants.toLocaleString("th-TH")} แพล้นท์ · กดชื่อลูกค้าเพื่อดูแพล้นท์`}
      action={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-(--dash-ring) px-2.5 focus-within:ring-2 focus-within:ring-(--s1)/30 sm:flex-none">
            <Search size={15} className="flex-none text-(--dash-mut)" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาลูกค้า แพล้นท์…"
              aria-label="ค้นหาลูกค้าหรือแพล้นท์"
              className="w-full bg-transparent text-13 text-(--dash-ink) outline-none placeholder:text-(--dash-mut) sm:w-48"
            />
          </label>
          <button
            type="button"
            disabled={Boolean(q) || groups.length === 0}
            onClick={() =>
              setExpanded(
                allOpen ? new Set() : new Set(groups.map((g) => g.name)),
              )
            }
            title={allOpen ? "ยุบทั้งหมด" : "ขยายทั้งหมด"}
            aria-label={allOpen ? "ยุบทั้งหมด" : "ขยายทั้งหมด"}
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-(--dash-ring) text-(--dash-ink-2) hover:bg-(--dash-hover) disabled:opacity-40"
          >
            {allOpen ? (
              <ChevronsDownUp size={16} aria-hidden />
            ) : (
              <ChevronsUpDown size={16} aria-hidden />
            )}
          </button>
          <XlsxExportButton
            className="h-9 px-3 text-13"
            name="Manpower-pivot"
            count={plants}
            build={() => ({
              sheet: "Manpower",
              title: "Manpower pivot · ลูกค้า → แพล้นท์",
              filter: [
                customer ? `ลูกค้า: ${customer}` : "",
                q ? `คำค้น: “${query.trim()}”` : "",
              ]
                .filter(Boolean)
                .join(" · "),
              total,
              columns: xlsx,
              rows: xlsxRows,
            })}
          />
        </div>
      }
    >
      <div className="max-h-[620px] overflow-auto rounded-lg border border-(--dash-grid)">
        <table className="w-full border-collapse text-13">
          <thead className="sticky top-0 z-10">
            <tr>
              {sortHead("name", "ลูกค้า / แพล้นท์", "เรียงตามชื่อ", `${nameCol} text-left sm:w-full`)}
              {sortHead("working", "ปฏิบัติงาน", "คนที่รับรถแล้ว ทำงานอยู่ · % = สัดส่วนของทั้งหมด")}
              {PIPE.map((p) => (
                <Fragment key={p.key}>{sortHead(p.key, p.label, p.hint)}</Fragment>
              ))}
              {sortHead("open", "อัตราว่าง", "ตำแหน่งที่ยังไม่มีคน", "hidden sm:table-cell")}
              {sortHead("net", `เข้า–ออก ${yearTh}`, `สุทธิ = เข้า − ออก ปี ${yearTh}`, "border-l border-(--dash-grid)")}
            </tr>
          </thead>

          {groups.map((g) => {
            const open = isOpen(g.name);
            const share = grand.working
              ? Math.round((g.t.working / grand.working) * 100)
              : 0;
            return (
              <tbody
                key={g.name}
                className="border-b border-(--dash-grid) last-of-type:border-0"
              >
                <tr style={{ background: GROUP_BG }}>
                  <th
                    scope="rowgroup"
                    className={`${nameCol} p-0 text-left font-semibold`}
                    style={{ background: GROUP_BG }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(g.name)}
                      aria-expanded={open}
                      disabled={Boolean(q)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-(--dash-ink) disabled:cursor-default"
                    >
                      <ChevronRight
                        size={15}
                        aria-hidden
                        className={`flex-none text-(--dash-mut) transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                      />
                      <span className="truncate">{g.name}</span>
                      <span className="hidden flex-none text-11-5 sm:inline font-normal text-(--dash-mut)">
                        {g.rows.length} แพล้นท์
                      </span>
                    </button>
                  </th>
                  {workingCell(g.t.working, maxGroup, share)}
                  {pipeCells(g.t, true)}
                  {openCell(g.t.open, true)}
                  {flowCell(g.t, true)}
                </tr>
                {open
                  ? g.rows.map((r) => (
                      <tr
                        key={r.key}
                        className="group/row border-t border-(--dash-grid)/60 bg-(--dash-surface) hover:bg-(--dash-hover)"
                      >
                        <th
                          scope="row"
                          className={`${nameCol} bg-(--dash-surface) py-1.5 pr-3 pl-10 text-left font-normal text-(--dash-ink-2) group-hover/row:bg-(--dash-hover)`}
                        >
                          <span className="flex items-center gap-1.5">
                            {r.plant}
                            {!customer && r.customer !== g.name ? (
                              <span className="rounded border border-(--dash-ring) px-1 text-10-5 font-medium text-(--dash-mut)">
                                MS
                              </span>
                            ) : null}
                          </span>
                        </th>
                        {workingCell(r.working, maxPlant)}
                        {pipeCells(r, false)}
                        {openCell(r.open, false)}
                        {flowCell(r, false)}
                      </tr>
                    ))
                  : null}
              </tbody>
            );
          })}

          <tfoot className="sticky bottom-0 z-10 bg-(--dash-surface)">
            <tr className="border-t-2 border-(--dash-ink)/15">
              <th
                scope="row"
                className={`${nameCol} bg-(--dash-surface) px-3 py-2.5 text-left font-semibold text-(--dash-ink)`}
              >
                รวมทั้งหมด
              </th>
              <td className="px-3 py-2.5 text-right font-semibold text-(--dash-ink) tabular-nums">
                {grand.working || "–"}
              </td>
              {pipeCells(grand, true)}
              {openCell(grand.open, true)}
              {flowCell(grand, true)}
            </tr>
          </tfoot>
        </table>
        {groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-13 text-(--dash-mut)">
            <Search size={28} className="text-(--dash-mut)/40" aria-hidden />
            ไม่พบลูกค้าหรือแพล้นท์ที่ตรงกับคำค้น
          </div>
        ) : null}
      </div>
    </DashCard>
  );
}
