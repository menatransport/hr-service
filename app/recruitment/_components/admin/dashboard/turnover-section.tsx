"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Lock, MessageSquareQuote, RotateCcw, SlidersHorizontal } from "lucide-react";

import { DashCard, DashMultiFilter, DashToggle } from "@/components/dashboard/card";
import { seqColor, inkOn } from "@/components/dashboard/chart";
import { RECRUIT_SITES } from "@/app/recruitment/_lib/sites";
import { CONTROLLABLE_CHIP, controllableLabel, type ExitType } from "@/app/recruitment/_lib/resign-reasons/types";
import {
  BREAKDOWNS,
  COVERAGE_TARGET,
  EARLY_DAYS,
  EXIT_TYPE_SHORT,
  TO_GROUPS,
  breakdown,
  fmt,
  monthLabel,
  pct,
  reasonStats,
  summarize,
  tenureText,
  voiceOf,
  type Breakdown,
  type ToBoard,
  type ToRow,
} from "@/app/recruitment/_lib/dashboard/turnover-shared";

import { CTL_CONFIG, CategoryChart, MonthlyChart, OwnerChart, TenureChart } from "./turnover-charts";

/**
 * หมวด TurnOver — วิเคราะห์การลาออก พจส. แทนชีต “Dashboard” ของไฟล์ Reason Code (HR ส่วนกลาง 25 พ.ย. 2569)
 *
 * ข้อมูลชุดเดียวกับแท็บพ้นสภาพของทะเบียน (`turnover.ts`) — แก้รหัสใน Exit Interview แล้วตัวเลขที่นี่ตามทันที
 * โครง: แถบตัวกรอง → ตัวเลขหลัก (A–C ของชีต) → รายเดือน + จุดตาย (D, H) → หมวด + เจ้าของ (G)
 * → ตารางแยกมิติ กลุ่มงาน/ลูกค้า/Zone/RC/ช่องทาง (D–F, I) → รหัสสาเหตุ (J–K) → เสียงจากสัมภาษณ์ (C 14–17, เฉพาะสิทธิ์)
 */

const EXIT_TYPES: ExitType[] = ["vol", "inv", "disap"];
const EXIT_COLOR: Record<ExitType, string> = { vol: "var(--s1)", inv: "var(--s2)", disap: "var(--s5)" };

export function TurnoverSection({ board }: { board: ToBoard }) {
  const [sites, setSites] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [cats, setCats] = useState<string[]>([]);

  const allMonths = useMemo(() => [...new Set(board.rows.map((r) => r.month))].sort().slice(-12), [board.rows]);

  /* ตัวกรองไล่ชั้น สาขา → กลุ่มงาน → ลูกค้า · เดือน/ประเภท/หมวด กรองต่อท้าย · ไม่เลือก = ทั้งหมด */
  const f = useMemo(() => {
    const pick = (sel: readonly string[], v: string) => sel.length === 0 || sel.includes(v);
    const people = (rs: readonly ToRow[]) => `${fmt(rs.length)} คน`;
    const inRange = board.rows.filter((r) => allMonths.includes(r.month));
    const siteRows = inRange.filter((r) => pick(sites, r.site));
    const groupOpts = TO_GROUPS.filter((g) => siteRows.some((r) => r.group === g));
    const g = groups.filter((x) => (groupOpts as readonly string[]).includes(x));
    const groupRows = siteRows.filter((r) => pick(g, r.group));
    const custOpts = [...new Set(groupRows.map((r) => r.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    const c = customers.filter((x) => custOpts.includes(x));
    const base = groupRows.filter((r) => pick(c, r.customer));
    const rows = base.filter(
      (r) => pick(months, r.month) && pick(types, r.exitType) && pick(cats, board.categories.some((k) => k.prefix === r.category) ? r.category : ""),
    );
    return {
      groups: g,
      customers: c,
      rows,
      /* กราฟรายเดือนไม่กรองเดือน — เห็นเดือนที่เลือกเด่น ที่เหลือจาง */
      monthRows: base.filter((r) => pick(types, r.exitType) && pick(cats, board.categories.some((k) => k.prefix === r.category) ? r.category : "")),
      siteOptions: RECRUIT_SITES.map((s) => ({ value: s.key, label: s.label, hint: people(inRange.filter((r) => r.site === s.key)) })),
      groupOptions: groupOpts.map((x) => ({ value: x, label: x, hint: people(siteRows.filter((r) => r.group === x)) })),
      customerOptions: custOpts.map((x) => ({ value: x, label: x, hint: people(groupRows.filter((r) => r.customer === x)) })),
      monthOptions: allMonths.map((m) => ({ value: m, label: monthLabel(m), hint: people(base.filter((r) => r.month === m)) })),
      typeOptions: EXIT_TYPES.map((t) => ({ value: t, label: EXIT_TYPE_SHORT[t], hint: people(base.filter((r) => r.exitType === t)) })),
      catOptions: [
        ...board.categories.map((k) => ({ value: k.prefix, label: `${k.prefix} · ${k.label}`, hint: people(base.filter((r) => r.category === k.prefix)) })),
        { value: "", label: "ยังไม่ระบุรหัส", hint: people(base.filter((r) => !board.categories.some((k) => k.prefix === r.category))) },
      ],
    };
  }, [board, allMonths, sites, groups, customers, months, types, cats]);

  const rows = f.rows;
  const s = useMemo(() => summarize(rows), [rows]);
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const activeCount = [sites, f.groups, f.customers, months, types, cats].filter((x) => x.length).length;
  const clearAll = () => {
    setSites([]);
    setGroups([]);
    setCustomers([]);
    setMonths([]);
    setTypes([]);
    setCats([]);
  };
  const readAt = new Date(board.readAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const coverageOk = s.coverage != null && s.coverage >= COVERAGE_TARGET;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------- แถบตัวกรอง */}
      <section aria-label="ตัวกรอง" className="flex flex-wrap items-center gap-2 rounded-2xl bg-(--dash-filter-bg) px-4 py-3 shadow-(--dash-shadow)">
        <span className="mr-1 inline-flex items-center gap-1.5 text-13 font-semibold text-white">
          <SlidersHorizontal size={16} aria-hidden />
          ตัวกรอง
        </span>
        <DashMultiFilter label="สาขา" allLabel="ทุกสาขา" values={sites} options={f.siteOptions} onChange={setSites} />
        <DashMultiFilter label="กลุ่มงาน" allLabel="ทุกกลุ่มงาน" values={f.groups} options={f.groupOptions} onChange={setGroups} />
        <DashMultiFilter label="ลูกค้า" allLabel="ทุกลูกค้า" values={f.customers} options={f.customerOptions} onChange={setCustomers} />
        <DashMultiFilter label="เดือน" allLabel="ทุกเดือน" values={months} options={f.monthOptions} onChange={setMonths} />
        <DashMultiFilter label="ประเภทการออก" allLabel="ทุกประเภท" values={types} options={f.typeOptions} onChange={setTypes} />
        <DashMultiFilter label="หมวดสาเหตุ" allLabel="ทุกหมวด" values={cats} options={f.catOptions} onChange={setCats} />
        {activeCount ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-13 font-medium text-white/85 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} aria-hidden />
            ล้างตัวกรอง ({activeCount})
          </button>
        ) : null}
        <span className="ml-auto text-12 text-white/70 tabular-nums">
          {allMonths.length ? `${monthLabel(allMonths[0])} – ${monthLabel(allMonths[allMonths.length - 1])} · ` : ""}ข้อมูล ณ {readAt} น.
        </span>
      </section>

      {/* ---------- ตัวเลขหลัก */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi th="พ้นสภาพทั้งหมด" en="Turnover" hero>
          <Big value={fmt(s.total)} unit="คน" caption={`ออกใน ${EARLY_DAYS} วันแรก ${fmt(s.early)} คน (${pct(s.early, s.total)})`} />
          <Split
            items={[
              { label: "พนักงานใหม่", hint: "เริ่มงานปีเดียวกับที่ออก", value: fmt(s.newHire) },
              { label: "พนักงานเก่า", value: fmt(s.oldHire) },
            ]}
          />
        </Kpi>

        <Kpi th="บริษัทควบคุมได้" en="Controllable">
          <Big value={pct(s.controlled, s.total)} caption={`${fmt(s.controlled)} คน — ตัวเลขที่ควรรายงานผู้บริหาร`} tone="text-(--s2)" />
          <Split
            items={[
              { label: "ควบคุมได้", value: fmt(s.ctl.yes), swatch: CTL_CONFIG.yes.color },
              { label: "บางส่วน", value: fmt(s.ctl.partial), swatch: CTL_CONFIG.partial.color },
              { label: "ไม่ได้", value: fmt(s.ctl.no), swatch: CTL_CONFIG.no.color },
            ]}
          />
        </Kpi>

        <Kpi th="Exit Interview" en="Coverage">
          <Big
            value={pct(s.interviewed, s.total)}
            caption={`สัมภาษณ์ได้ ${fmt(s.interviewed)} จาก ${fmt(s.total)} คน`}
            badge={
              s.total ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-11-5 font-semibold ${
                    coverageOk
                      ? "bg-[color-mix(in_oklab,var(--dash-good),transparent_88%)] text-(--dash-good)"
                      : "bg-[color-mix(in_oklab,var(--dash-bad),transparent_88%)] text-(--dash-bad)"
                  }`}
                >
                  {coverageOk ? "ผ่านเป้า" : "ต่ำกว่าเป้า"} {Math.round(COVERAGE_TARGET * 100)}%
                </span>
              ) : null
            }
          />
          <Split
            items={[
              { label: "สัมภาษณ์แล้ว", value: fmt(s.interviewed) },
              { label: "N1 / N2", hint: "ติดต่อไม่ได้ / ปฏิเสธ", value: fmt(s.noData) },
              { label: "ยังไม่สัมภาษณ์", value: fmt(s.pending), tone: s.pending ? "text-(--dash-warn)" : undefined },
            ]}
          />
        </Kpi>

        <Kpi th="ประเภทการออก" en="Exit type">
          <ul className="flex flex-col gap-2.5">
            {EXIT_TYPES.map((t) => (
              <li key={t} className="flex items-baseline gap-2 text-13">
                <span aria-hidden className="size-2.5 flex-none translate-y-[-1px] self-center rounded-[3px]" style={{ background: EXIT_COLOR[t] }} />
                <span className="flex-1 text-(--dash-ink-2)">{EXIT_TYPE_SHORT[t]}</span>
                <span className="text-18 font-semibold text-(--dash-ink) tabular-nums">{fmt(s.exitType[t])}</span>
                <span className="w-11 text-right text-12 text-(--dash-mut) tabular-nums">{pct(s.exitType[t], s.total)}</span>
              </li>
            ))}
          </ul>
          {s.exitType.inv / Math.max(1, s.total) > 0.25 ? (
            <p className="text-12 text-(--dash-warn)">บริษัทให้ออกเกิน 25% — ปัญหามักอยู่ที่การคัดเลือก ไม่ใช่การรักษาคน</p>
          ) : null}
        </Kpi>

        <Kpi th="อายุงาน ณ วันออก" en="Tenure">
          <Big value={tenureText(s.avgTenure)} caption={s.avgTenure != null ? `เฉลี่ย ${fmt(Math.round(s.avgTenure))} วัน` : "ยังไม่มีข้อมูล"} />
          <Split
            items={[
              { label: "ไม่ถึง 1 ปี", value: tenureText(s.avgUnderYear) },
              { label: "เกิน 1 ปี", value: tenureText(s.avgOverYear) },
              { label: "ฐานนิยม", hint: s.mode ? `${fmt(s.mode.times)} คน` : undefined, value: s.mode ? `${fmt(s.mode.value)} วัน` : "–" },
            ]}
          />
        </Kpi>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-(--dash-axis) bg-(--dash-surface) px-6 py-12 text-center text-13 text-(--dash-mut)">
          ไม่มีผู้พ้นสภาพในตัวกรองนี้
        </p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <MonthlyChart rows={f.monthRows} months={allMonths} picked={months} onPick={(m) => toggle(months, setMonths, m)} />
            <TenureChart rows={rows} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryChart rows={rows} categories={board.categories} picked={cats} onPick={(c) => toggle(cats, setCats, c)} />
            <OwnerChart rows={rows} />
          </div>

          <BreakdownCard rows={rows} months={months.length ? allMonths.filter((m) => months.includes(m)) : allMonths} />
          <ReasonCard board={board} rows={rows} />
          <VoiceCard rows={rows} allowed={board.withAnswers} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ การ์ดตัวเลข */

function Kpi({ th, en, hero = false, children }: { th: string; en: string; hero?: boolean; children: ReactNode }) {
  return (
    <section
      aria-label={th}
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border p-5 shadow-(--dash-shadow) ${
        hero
          ? "border-[color-mix(in_oklab,var(--dash-accent),transparent_70%)] bg-[color-mix(in_oklab,var(--dash-accent),var(--dash-surface)_93%)]"
          : "border-(--dash-ring) bg-(--dash-surface)"
      }`}
    >
      <h3 className={`text-13 font-semibold ${hero ? "text-(--dash-accent)" : "text-(--dash-ink-2)"}`}>
        {th} <span className="font-normal text-(--dash-mut)">({en})</span>
      </h3>
      {children}
    </section>
  );
}

function Big({ value, unit, caption, badge, tone }: { value: string; unit?: string; caption: string; badge?: ReactNode; tone?: string }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-30 leading-none font-semibold tracking-tight tabular-nums ${tone ?? "text-(--dash-ink)"}`}>{value}</span>
        {unit ? <span className="text-13 text-(--dash-mut)">{unit}</span> : null}
        {badge ? <span className="ml-auto self-center">{badge}</span> : null}
      </p>
      <p className="mt-1.5 text-12 text-(--dash-mut)">{caption}</p>
    </div>
  );
}

function Split({ items }: { items: { label: string; value: string; hint?: string; tone?: string; swatch?: string }[] }) {
  return (
    <dl className="mt-auto grid gap-x-3 border-t border-(--dash-grid) pt-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="flex items-center gap-1.5 truncate text-11-5 text-(--dash-mut)" title={it.hint}>
            {it.swatch ? <span aria-hidden className="size-2 flex-none rounded-full" style={{ background: it.swatch }} /> : null}
            {it.label}
          </dt>
          <dd className={`mt-0.5 truncate text-15 font-semibold tabular-nums ${it.tone ?? "text-(--dash-ink)"}`}>{it.value}</dd>
          {it.hint ? <dd className="truncate text-11 text-(--dash-mut)">{it.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ ตารางแยกมิติ */

function BreakdownCard({ rows, months }: { rows: readonly ToRow[]; months: readonly string[] }) {
  const [by, setBy] = useState<Breakdown>("group");
  const data = useMemo(() => breakdown(rows, by, months), [rows, by, months]);
  const total = useMemo(() => breakdown(rows.map((r) => ({ ...r, group: "อื่น ๆ" as const })), "group", months)[0], [rows, months]);
  const max = Math.max(1, ...data.flatMap((d) => d.months));
  const label = BREAKDOWNS.find((b) => b.value === by)!.label;
  const hint =
    by === "zone" || by === "rcOwner" || by === "channel" ? "ข้อมูลจาก Exit Interview — คนที่ยังไม่สัมภาษณ์อยู่ในแถว “ไม่ระบุ”" : "";

  return (
    <DashCard
      title={`แยกตาม${label}`}
      sub={hint || `ลาออก · ออกใน ${EARLY_DAYS} วันแรก · % ควบคุมได้ · Coverage · อายุงานเฉลี่ย · รายเดือน (สีเข้ม = ออกมาก)`}
      action={<DashToggle label="มิติ" value={by} options={[...BREAKDOWNS]} onChange={setBy} />}
    >
      <div className="max-h-[32rem] overflow-auto rounded-xl border border-(--dash-grid)">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr className="text-12 text-(--dash-ink-2)">
              <Th left sticky>
                {label}
              </Th>
              <Th>ลาออก</Th>
              <Th>ออกใน {EARLY_DAYS} วัน</Th>
              <Th>ควบคุมได้</Th>
              <Th>Coverage</Th>
              <Th>อายุงานเฉลี่ย</Th>
              {months.map((m) => (
                <Th key={m} narrow>
                  {monthLabel(m, false)}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b border-(--dash-grid) transition-colors hover:bg-(--dash-hover)">
                <td className="sticky left-0 max-w-56 truncate bg-(--dash-surface) px-3 py-2 font-medium text-(--dash-ink)" title={d.key}>
                  {d.key}
                </td>
                <Td strong>{fmt(d.total)}</Td>
                <Td>
                  {fmt(d.early)} <span className="text-(--dash-mut)">({pct(d.early, d.total)})</span>
                </Td>
                <Td>{pct(d.controlled, d.total)}</Td>
                <Td tone={d.coverage != null && d.coverage < COVERAGE_TARGET ? "text-(--dash-warn)" : undefined}>
                  {d.coverage == null ? "–" : `${Math.round(d.coverage * 100)}%`}
                </Td>
                <Td>{tenureText(d.avgTenure)}</Td>
                {d.months.map((v, i) => (
                  <td key={months[i]} className="p-0.5">
                    <span
                      className="grid h-7 min-w-9 place-items-center rounded-md text-11-5 tabular-nums"
                      style={{ background: v ? seqColor(v / max, "var(--s2)") : "transparent", color: v ? inkOn(v / max) : "var(--dash-axis)" }}
                    >
                      {v || "·"}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {total ? (
            <tfoot>
              <tr className="bg-(--dash-sunken) font-semibold text-(--dash-ink)">
                <td className="sticky left-0 bg-(--dash-sunken) px-3 py-2">รวม</td>
                <Td strong>{fmt(total.total)}</Td>
                <Td>
                  {fmt(total.early)} <span className="font-normal text-(--dash-mut)">({pct(total.early, total.total)})</span>
                </Td>
                <Td>{pct(total.controlled, total.total)}</Td>
                <Td>{total.coverage == null ? "–" : `${Math.round(total.coverage * 100)}%`}</Td>
                <Td>{tenureText(total.avgTenure)}</Td>
                {total.months.map((v, i) => (
                  <td key={months[i]} className="px-1 py-2 text-center text-12 tabular-nums">
                    {v || "·"}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </DashCard>
  );
}

function Th({ children, left, sticky, narrow }: { children: ReactNode; left?: boolean; sticky?: boolean; narrow?: boolean }) {
  return (
    <th
      className={`sticky top-0 z-10 border-b border-(--dash-grid) bg-(--dash-sunken) py-2 font-medium whitespace-nowrap ${
        narrow ? "px-1 text-center" : "px-3"
      } ${left ? "text-left" : narrow ? "" : "text-right"} ${sticky ? "left-0 z-20" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, strong, tone }: { children: ReactNode; strong?: boolean; tone?: string }) {
  return (
    <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${strong ? "font-semibold text-(--dash-ink)" : ""} ${tone ?? "text-(--dash-ink-2)"}`}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ รหัสสาเหตุ */

const SHOW_REASONS = 10;

function ReasonCard({ board, rows }: { board: ToBoard; rows: readonly ToRow[] }) {
  const [all, setAll] = useState(false);
  const data = useMemo(() => reasonStats(rows, board.reasons), [rows, board.reasons]);
  const groups = TO_GROUPS.filter((g) => rows.some((r) => r.group === g));
  const shown = all ? data : data.slice(0, SHOW_REASONS);

  return (
    <DashCard
      title="รหัสสาเหตุหลัก"
      sub={`${fmt(data.length)} รหัสที่ใช้ · เรียงจากมากไปน้อย · ควบคุมได้ / เจ้าของ ตาม Reason Code Master`}
      action={
        data.length > SHOW_REASONS ? (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="h-8 cursor-pointer rounded-lg px-3 text-12-5 font-medium text-(--dash-accent) hover:bg-(--dash-hover)"
          >
            {all ? `แสดง ${SHOW_REASONS} อันดับแรก` : `ดูทั้งหมด (${fmt(data.length)})`}
          </button>
        ) : null
      }
    >
      <div className="overflow-auto rounded-xl border border-(--dash-grid)">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr className="text-12 text-(--dash-ink-2)">
              <Th left>#</Th>
              <Th left>รหัส · หมวดย่อย</Th>
              <Th>คน</Th>
              <Th>สัดส่วน</Th>
              <Th>อายุงานเฉลี่ย</Th>
              <Th left>ควบคุมได้?</Th>
              <Th left>เจ้าของการแก้ไข</Th>
              {groups.map((g) => (
                <Th key={g}>{g}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.code} className="border-b border-(--dash-grid) transition-colors last:border-0 hover:bg-(--dash-hover)">
                <td className="px-3 py-2 text-(--dash-mut) tabular-nums">{i + 1}</td>
                <td className="max-w-80 px-3 py-2">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-none rounded-md bg-(--dash-sunken) px-1.5 py-0.5 font-mono text-11-5 font-semibold text-(--dash-ink) ring-1 ring-(--dash-ring) ring-inset">
                      {r.code}
                    </span>
                    <span className="truncate text-(--dash-ink-2)" title={r.label}>
                      {r.label || "–"}
                    </span>
                  </span>
                </td>
                <Td strong>{fmt(r.count)}</Td>
                <Td>{pct(r.count, rows.length, 1)}</Td>
                <Td>{tenureText(r.avgTenure)}</Td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.controllable ? <span className={`chip ${CONTROLLABLE_CHIP[r.controllable]}`}>{controllableLabel(r.controllable)}</span> : "–"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-(--dash-ink-2)">{r.owner && r.owner !== "-" ? r.owner : "–"}</td>
                {groups.map((g) => {
                  const v = r.byGroup[TO_GROUPS.indexOf(g)];
                  return (
                    <Td key={g} tone={v ? undefined : "text-(--dash-axis)"}>
                      {v || "·"}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashCard>
  );
}

/* ------------------------------------------------------------------ เสียงจากสัมภาษณ์ */

function VoiceCard({ rows, allowed }: { rows: readonly ToRow[]; allowed: boolean }) {
  const v = useMemo(() => voiceOf(rows), [rows]);

  if (!allowed) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-(--dash-axis) bg-(--dash-surface) px-5 py-4 text-12-5 text-(--dash-mut)">
        <Lock size={15} aria-hidden />
        สรุปคำตอบ Exit Interview (จะอยู่ต่อถ้าแก้ 1 เรื่อง · คะแนนหัวหน้า · รายได้ที่ใหม่) เห็นเฉพาะผู้มีสิทธิ์ Exit Interview
      </p>
    );
  }

  return (
    <DashCard
      title="เสียงจาก Exit Interview"
      sub={`จากคำตอบ Wave 1 ของ ${fmt(v.answered)} คนที่สัมภาษณ์ได้ในตัวกรองนี้ · ข้อที่ไม่ได้ถาม/ไม่ตอบไม่นับ`}
      action={<MessageSquareQuote size={18} className="text-(--dash-mut)" aria-hidden />}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div className="rounded-xl bg-(--dash-sunken) p-4 ring-1 ring-(--dash-ring) ring-inset">
          <p className="text-12-5 text-(--dash-ink-2)">“ถ้าแก้ 1 เรื่อง จะอยู่ต่อ” (Q4)</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-30 leading-none font-semibold text-(--s2) tabular-nums">{fmt(v.stay)}</span>
            <span className="text-13 text-(--dash-mut)">คนที่รักษาไว้ได้จริง · ไม่แน่ใจ {fmt(v.stayUnsure)}</span>
          </p>
          {v.topics.length ? (
            <ol className="mt-3 flex flex-col gap-1.5 text-12-5">
              {v.topics.slice(0, 5).map((t, i) => (
                <li key={t.topic} className="flex items-baseline gap-2">
                  <span className="w-4 text-(--dash-mut) tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-(--dash-ink)" title={t.topic}>
                    {t.topic}
                  </span>
                  <span className="text-(--dash-mut) tabular-nums">{fmt(t.count)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-12 text-(--dash-mut)">ยังไม่มีเรื่องที่อยากให้แก้ (Q4.1)</p>
          )}
        </div>
        <VoiceStat
          label="คะแนนดูแลของหัวหน้า (Q8)"
          value={v.score == null ? "–" : v.score.toFixed(2)}
          unit="/ 5"
          note={`จาก ${fmt(v.scored)} คนที่ให้คะแนน`}
        />
        <VoiceStat
          label="งานจริงตรงกับที่บอกตอนสัมภาษณ์ (Q6)"
          value={pct(v.match, v.matchAsked)}
          note={v.matchAsked ? `ตรง ${fmt(v.match)} จาก ${fmt(v.matchAsked)} คนที่ตอบ` : "ยังไม่มีคำตอบ"}
        />
        <VoiceStat
          label="รายได้ที่ใหม่ เทียบที่นี่ (Q9)"
          value={v.incomeGap == null ? "–" : `${v.incomeGap > 0 ? "+" : v.incomeGap < 0 ? "−" : ""}${fmt(Math.abs(Math.round(v.incomeGap)))}`}
          unit={v.incomeGap == null ? undefined : "บาท/เดือน"}
          note={v.incomePairs ? `เฉลี่ยจาก ${fmt(v.incomePairs)} คนที่บอกตัวเลขทั้งสองที่` : "ยังไม่มีคนบอกตัวเลขรายเดือนครบทั้งสองที่"}
        />
      </div>
    </DashCard>
  );
}

function VoiceStat({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-(--dash-ring) ring-inset">
      <p className="text-12-5 text-(--dash-ink-2)">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-24 leading-none font-semibold text-(--dash-ink) tabular-nums">{value}</span>
        {unit ? <span className="text-12 text-(--dash-mut)">{unit}</span> : null}
      </p>
      <p className="mt-auto text-12 text-(--dash-mut)">{note}</p>
    </div>
  );
}
