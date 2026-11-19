"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, MessageSquareText, RotateCcw, Settings2, SlidersHorizontal, UserRound } from "lucide-react";

import { DashCard, DashMultiFilter } from "@/components/dashboard/card";
import { XlsxExportButton } from "@/components/ui/xlsx-export-button";
import type { XlsxColumn } from "@/lib/xlsx-table";
import {
  MP_GROUPS,
  MP_SCOPES,
  actualOf,
  fmtNum,
  groupRows,
  pctText,
  recruitOf,
  signed,
  sumCounts,
  thDate,
  type MpBoard,
  type MpCounts,
  type MpRow,
  type MpScope,
  type MpTarget,
} from "@/app/recruitment/_lib/dashboard/manpower-daily-shared";

import { ManpowerLineDialog } from "./manpower-line-dialog";
import { ManpowerTargetsDialog } from "./manpower-targets-dialog";

/**
 * หมวด Manpower รายวัน — แทนชีต “📊 Manpower” (นิยามตัวเลข: `manpower-daily-shared.ts`)
 *
 * โครง: แถบตัวกรอง (สาขา · กลุ่มงาน · ลูกค้า · สถานะคน) → ปุ่ม (ตั้งเป้า · ข้อความ LINE · Excel) → ตัวเลขหลัก
 * → ตาราง กลุ่มงาน → ลูกค้า → แพล้นท์ · ตัวกรองเลือกได้หลายค่า · ข้อความ LINE / ตั้งเป้า ใช้แค่สาขา (เลือกสาขาเดียว = สาขานั้น)
 * · สัดส่วนต่อเป้า / ตาม RC Owner / แนวโน้ม เอาออก 18 พ.ย. 2569 รอออกแบบใหม่ให้กระชับ (โค้ดเดิมอยู่ใน f152c81)
 * · การ์ดตัวเลข 4 ใบ เรียงตามกลุ่มคอลัมน์ของตาราง (เป้าหมาย → มีคนแล้ว → ยังขาด → ความเคลื่อนไหว)
 */

type Row = MpCounts & { recruit: number };

/** สถานะคน — กรองเหลือแพล้นท์ที่มีคนในสถานะที่เลือกอย่างน้อยหนึ่งสถานะ (> 0) */
type StatusKey = "active" | "ojt" | "vacant" | "open" | "waiting";
const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "active", label: "ปฏิบัติงาน (Active)" },
  { value: "ojt", label: "ฝึกงาน (OJT)" },
  { value: "vacant", label: "อัตราว่าง (Vacant HC)" },
  { value: "open", label: "รอสรรหา (Open)" },
  { value: "waiting", label: "รอฝึกงาน (Waiting)" },
];

export function ManpowerDailySection({ board: initial, canEditTargets }: { board: MpBoard; canEditTargets: boolean }) {
  const [board, setBoard] = useState(initial);
  const [sites, setSites] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  /* ข้อความ LINE / ตั้งเป้า ทำงานทีละสาขา: เลือกสาขาเดียว = สาขานั้น · อื่น ๆ = ทั้งหมด */
  const scope: MpScope = sites.length === 1 ? (sites[0] as MpScope) : "all";
  const [dialog, setDialog] = useState<"line" | "targets" | null>(null);

  /* ตัวกรองไล่ชั้น สาขา → กลุ่มงาน → ลูกค้า → สถานะคน · ไม่เลือก = ทั้งหมด · ตัวเลือกของชั้นถัดไปมาจากผลของชั้นก่อน */
  const f = useMemo(() => {
    const pick = (sel: readonly string[], v: string) => sel.length === 0 || sel.includes(v);
    const people = (rs: readonly MpRow[]) => `${fmtNum(recruitOf(sumCounts(rs)))} คน`;
    const siteRows = board.rows.filter((r) => pick(sites, r.site));
    const groupOpts = MP_GROUPS.filter((g) => siteRows.some((r) => r.group === g));
    const g = groups.filter((x) => (groupOpts as readonly string[]).includes(x));
    const groupRowsF = siteRows.filter((r) => pick(g, r.group));
    const custOpts = [...new Set(groupRowsF.map((r) => r.customer))].sort((a, b) => a.localeCompare(b, "th"));
    const c = customers.filter((x) => custOpts.includes(x));
    const custRows = groupRowsF.filter((r) => pick(c, r.customer));
    const st = statuses as StatusKey[];
    const rows = st.length ? custRows.filter((r) => st.some((k) => r[k] > 0)) : custRows;
    const statusTotals = sumCounts(custRows);
    return {
      groups: g,
      customers: c,
      rows,
      siteOptions: MP_SCOPES.filter((o) => o.value !== "all").map((o) => ({ ...o, hint: people(board.rows.filter((r) => r.site === o.value)) })),
      groupOptions: groupOpts.map((x) => ({ value: x, label: x, hint: people(siteRows.filter((r) => r.group === x)) })),
      customerOptions: custOpts.map((x) => ({ value: x, label: x, hint: people(groupRowsF.filter((r) => r.customer === x)) })),
      statusOptions: STATUS_OPTIONS.map((o) => ({ ...o, hint: `${fmtNum(statusTotals[o.value])} คน` })),
    };
  }, [board.rows, sites, groups, customers, statuses]);

  const rows = f.rows;
  const fleets = useMemo(() => groupRows(rows, board.targets), [rows, board.targets]);
  const t = useMemo(() => sumCounts(rows), [rows]);
  const recruit = recruitOf(t);
  const truck = fleets.reduce((n, x) => n + x.targetTruck, 0);
  const narrowed = f.groups.length > 0 || f.customers.length > 0 || statuses.length > 0;
  /* นัดสัมภาษณ์ที่ยังไม่ผูกอัตรา ไม่มีกลุ่มงาน/ลูกค้า → นับเฉพาะตอนกรองแค่สาขา */
  const unassigned = narrowed
    ? 0
    : scope === "all"
      ? board.interviewUnassigned.latkrabang + board.interviewUnassigned["saraburi-bangpakong"]
      : board.interviewUnassigned[scope];

  const labelOf = (opts: { value: string; label: string }[], vs: readonly string[]) => vs.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ");
  const activeFilters = [
    sites.length ? `สาขา: ${labelOf(f.siteOptions, sites)}` : "",
    f.groups.length ? `กลุ่มงาน: ${f.groups.join(", ")}` : "",
    f.customers.length ? `ลูกค้า: ${f.customers.join(", ")}` : "",
    statuses.length ? `สถานะคน: ${labelOf(STATUS_OPTIONS, statuses)}` : "",
  ].filter(Boolean);
  const clearAll = () => {
    setSites([]);
    setGroups([]);
    setCustomers([]);
    setStatuses([]);
  };
  const plantCount = fleets.reduce((n, x) => n + x.customers.reduce((m, c) => m + c.plants.length, 0), 0);
  const customerCount = fleets.reduce((n, x) => n + x.customers.length, 0);

  const readAt = new Date(board.readAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

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
        <DashMultiFilter label="สถานะคน" allLabel="ทุกสถานะ" values={statuses} options={f.statusOptions} onChange={setStatuses} />
        {activeFilters.length ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full px-3 text-13 font-medium text-white/85 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw size={14} aria-hidden />
            ล้างตัวกรอง ({activeFilters.length})
          </button>
        ) : null}
        <span className="ml-auto text-12 text-white/70 tabular-nums">
          แสดง <b className="font-semibold text-white">{fmtNum(customerCount)}</b> ลูกค้า · <b className="font-semibold text-white">{fmtNum(plantCount)}</b> แพล้นท์
        </span>
      </section>

      <div className="-mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="text-12 text-(--dash-mut)">
          ข้อมูล ณ {thDate(board.today)} {readAt} น. · ทะเบียน พจส. + คำขอสรรหา (สด)
          {statuses.length ? " · สถานะคน = แสดงเฉพาะแพล้นท์ที่มีคนในสถานะที่เลือก" : ""}
        </p>
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
          <ExportButton fleets={fleets} filter={activeFilters.join(" · ")} today={board.today} />
        </div>
      </div>

      {/* ---------- ตัวเลขหลัก */}
      {/* ลำดับเดียวกับกลุ่มคอลัมน์ของตาราง: เป้าหมาย → มีคนแล้ว → ยังขาด → ความเคลื่อนไหว */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard th="เป้าหมาย" en="Target">
          <Big value={recruit} unit="คน" caption="เป้าคน (Target Recruit)" />
          <Split
            items={[
              { th: "เป้ารถ", en: "Target Truck", value: truck ? `${fmtNum(truck)} คัน` : "ยังไม่ตั้ง", mute: !truck },
              { th: "ปฏิบัติงานต่อรถ", en: "Active / Truck", value: truck ? pctText(t.active, truck) : "–", mute: !truck },
            ]}
          />
        </KpiCard>

        <KpiCard th="มีคนแล้ว" en="Actual" hero>
          <Big value={actualOf(t)} unit="คน" caption="รวม (Total)" badge={recruit ? <FillBadge actual={actualOf(t)} target={recruit} suffix=" ของเป้า" /> : null} />
          <Split
            items={[
              { th: "ปฏิบัติงาน", en: "Active", value: fmtNum(t.active) },
              { th: "ฝึกงาน", en: "OJT", value: fmtNum(t.ojt) },
            ]}
          />
        </KpiCard>

        <KpiCard th="ยังขาด" en="Vacant">
          <Big value={t.vacant} unit="คน" caption="อัตราว่าง (Vacant HC)" tone={t.vacant ? "text-(--dash-warn)" : undefined} />
          <Split
            items={[
              { th: "รอสรรหา", en: "Open", value: fmtNum(t.open) },
              { th: "รอฝึกงาน", en: "Waiting", value: fmtNum(t.waiting) },
            ]}
          />
        </KpiCard>

        <KpiCard th="ความเคลื่อนไหว" en="Movement">
          <MoveRow
            label="วันนี้"
            items={[
              { th: "สัมภาษณ์", en: "Interview", value: fmtNum(t.interview + unassigned), hint: unassigned ? `ยังไม่ผูกอัตรา ${fmtNum(unassigned)} คน` : undefined },
              { th: "เริ่มฝึก", en: "Training", value: fmtNum(t.training) },
            ]}
          />
          <MoveRow
            label="เดือนนี้"
            items={[
              { th: "เข้าใหม่", en: "Newhire", value: fmtNum(t.newhire) },
              { th: "ลาออก", en: "Resign", value: fmtNum(t.resign) },
              { th: "สุทธิ", en: "Net", value: signed(t.newhire - t.resign), tone: t.newhire - t.resign < 0 ? "text-(--dash-bad)" : t.newhire - t.resign > 0 ? "text-(--dash-good)" : undefined },
            ]}
          />
        </KpiCard>
      </div>

      {/* ---------- ตาราง */}
      <PlantTable fleets={fleets} total={t} truck={truck} totalLabel={activeFilters.length ? "รวมตามตัวกรอง" : "รวมทั้งหมด"} />

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
  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-(--dash-ring) bg-(--dash-surface) px-3 text-13 font-medium text-(--dash-ink) shadow-(--dash-shadow) transition-colors hover:bg-(--dash-hover)";

/* ------------------------------------------------------------------ การ์ดตัวเลขหลัก */

/** การ์ดหนึ่งกลุ่ม: หัว ไทย (English) → ตัวเลขหลัก → ตัวเลขย่อยชิดล่าง · `hero` = พื้นสีหลักจาง (ตัวเลขที่ดูก่อน) */
function KpiCard({ th, en, hero = false, children }: { th: string; en: string; hero?: boolean; children: ReactNode }) {
  return (
    <section
      aria-label={th}
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border p-5 shadow-(--dash-shadow) ${
        hero ? `border-[color-mix(in_oklab,var(--dash-accent),transparent_70%)] ${FLEET_BG}` : "border-(--dash-ring) bg-(--dash-surface)"
      }`}
    >
      <h3 className={`text-13 font-semibold ${hero ? "text-(--dash-accent)" : "text-(--dash-ink-2)"}`}>
        {th} <span className="font-normal text-(--dash-mut)">({en})</span>
      </h3>
      {children}
    </section>
  );
}

function Big({ value, unit, caption, badge, tone }: { value: number; unit: string; caption: string; badge?: ReactNode; tone?: string }) {
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-30 leading-none font-semibold tracking-tight tabular-nums ${tone ?? "text-(--dash-ink)"}`}>{fmtNum(value)}</span>
        <span className="text-13 text-(--dash-mut)">{unit}</span>
        {badge ? <span className="ml-auto self-center">{badge}</span> : null}
      </p>
      <p className="mt-1.5 text-12 text-(--dash-mut)">{caption}</p>
    </div>
  );
}

type SubItem = { th: string; en: string; value: string; mute?: boolean; tone?: string; hint?: string };

/** ตัวเลขย่อยใต้เส้นคั่น — แบ่งช่องเท่ากัน */
function Split({ items }: { items: SubItem[] }) {
  return (
    <dl className="mt-auto grid grid-flow-col divide-x divide-(--dash-grid) border-t border-(--dash-grid) pt-3" style={{ gridAutoColumns: "1fr" }}>
      {items.map((i) => (
        <div key={i.en} className="min-w-0 px-3 first:pl-0 last:pr-0" title={i.hint}>
          <dt className="truncate text-11-5 text-(--dash-mut)">
            {i.th} ({i.en})
          </dt>
          <dd className={`mt-0.5 text-16 tabular-nums ${i.mute ? "text-(--dash-mut)" : `font-semibold ${i.tone ?? "text-(--dash-ink)"}`}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** แถวของการ์ดความเคลื่อนไหว — ช่วงเวลาซ้าย ตัวเลขขวา */
function MoveRow({ label, items }: { label: string; items: SubItem[] }) {
  return (
    <div className="flex items-start gap-3 border-t border-(--dash-grid) pt-3 first-of-type:mt-auto">
      <span className="mt-0.5 w-14 flex-none rounded-md bg-(--dash-sunken) px-1.5 py-0.5 text-center text-11-5 font-medium text-(--dash-ink-2)">{label}</span>
      <dl className="grid min-w-0 flex-1 grid-flow-col gap-3" style={{ gridAutoColumns: "1fr" }}>
        {items.map((i) => (
          <div key={i.en} className="min-w-0" title={i.hint}>
            <dt className="truncate text-11-5 text-(--dash-mut)">{i.th}</dt>
            <dd className={`text-16 leading-tight font-semibold tabular-nums ${i.tone ?? "text-(--dash-ink)"}`}>
              {i.value}
              {i.hint ? <span className="ml-0.5 align-super text-10 text-(--dash-warn)">*</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------------ ตาราง */

type Col = { th: string; en: string; cell: (r: Row, truck: number | null) => ReactNode; tone?: (r: Row) => string };

const DASH = <span className="text-(--dash-axis)">–</span>;
const z = (v: number | null) => (v ? fmtNum(v) : DASH);

/** คอลัมน์ เรียงตามการอ่าน: เป้า → มีคนแล้ว → ยังขาด → ความเคลื่อนไหว · หัวคอลัมน์ = ไทย (English) */
const GROUPS: { label: string; cols: Col[] }[] = [
  {
    label: "เป้าหมาย",
    cols: [
      { th: "เป้ารถ", en: "Target Truck", cell: (_, truck) => z(truck) },
      { th: "เป้าคน", en: "Target Recruit", cell: (r) => z(r.recruit) },
    ],
  },
  {
    label: "มีคนแล้ว",
    cols: [
      { th: "ปฏิบัติงาน", en: "Active", cell: (r) => z(r.active) },
      { th: "ฝึกงาน", en: "OJT", cell: (r) => z(r.ojt) },
      { th: "รวม", en: "Total", cell: (r) => z(actualOf(r)) },
      { th: "เต็มเป้า", en: "%", cell: (r) => (r.recruit ? <FillBadge actual={actualOf(r)} target={r.recruit} /> : DASH) },
    ],
  },
  {
    label: "ยังขาด",
    cols: [
      { th: "อัตราว่าง", en: "Vacant HC", cell: (r) => z(r.vacant), tone: (r) => (r.vacant > 0 ? "font-semibold text-(--dash-warn)" : "") },
      { th: "รอสรรหา", en: "Open", cell: (r) => z(r.open) },
      { th: "รอฝึกงาน", en: "Waiting", cell: (r) => z(r.waiting) },
    ],
  },
  {
    label: "วันนี้",
    cols: [
      { th: "สัมภาษณ์", en: "Interview", cell: (r) => z(r.interview) },
      { th: "เริ่มฝึก", en: "Training", cell: (r) => z(r.training) },
    ],
  },
  {
    label: "เดือนนี้",
    cols: [
      { th: "เข้าใหม่", en: "Newhire", cell: (r) => z(r.newhire) },
      { th: "ลาออก", en: "Resign", cell: (r) => z(r.resign) },
    ],
  },
];
const COLUMNS = GROUPS.flatMap((g) => g.cols.map((c, i) => ({ ...c, first: i === 0 })));
/** เส้นแบ่งกลุ่มคอลัมน์ */
const SEP = "border-l border-(--dash-grid)";
const HEAD = "sticky border-b border-(--dash-grid) bg-(--dash-sunken) font-medium text-(--dash-mut)";
/** พื้นแถวกลุ่มงาน — สีหลักจาง ๆ (ทึบ เพราะคอลัมน์แรกติดซ้าย) */
const FLEET_BG = "bg-[color-mix(in_oklab,var(--dash-accent),var(--dash-surface)_94%)]";

/**
 * % เต็มเป้า เป็นป้ายไล่ระดับสี: ≤ 80% แดง → 90% ส้ม → 100% เขียว (ต่อเนื่อง ไม่ใช่ขั้น)
 * · ตัวเลขกำกับเสมอ ไม่พึ่งสีอย่างเดียว
 */
function FillBadge({ actual, target, suffix = "" }: { actual: number; target: number; suffix?: string }) {
  const t = Math.min(1, Math.max(0, (actual / target - 0.8) / 0.2));
  const color =
    t < 0.5
      ? `color-mix(in oklab, var(--dash-warn) ${Math.round(t * 200)}%, var(--dash-bad))`
      : `color-mix(in oklab, var(--dash-good) ${Math.round((t - 0.5) * 200)}%, var(--dash-warn))`;
  return (
    <span
      className="inline-block min-w-15 rounded-full px-2 py-0.5 text-center text-12 font-semibold whitespace-nowrap"
      style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}
    >
      {pctText(actual, target)}
      {suffix}
    </span>
  );
}

function PlantTable({ fleets, total, truck, totalLabel }: { fleets: ReturnType<typeof groupRows>; total: MpCounts; truck: number; totalLabel: string }) {
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(new Set());
  const [openCustomers, setOpenCustomers] = useState<ReadonlySet<string>>(new Set());
  /* คอลัมน์ผู้รับผิดชอบ — ซ่อนไว้ก่อน กดปุ่มเพื่อแสดง */
  const [showOwner, setShowOwner] = useState(false);
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
      sub="กดแถวเพื่อเปิด/ปิด · เต็มเป้า = (ปฏิบัติงาน + ฝึกงาน) ÷ เป้าคน · อัตราว่าง = รอสรรหา + รอฝึกงาน · เป้ารถ = ตั้งเอง (ข้อมูลประกอบ)"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={showOwner}
            onClick={() => setShowOwner((v) => !v)}
            title={showOwner ? "ซ่อนคอลัมน์ผู้รับผิดชอบ" : "แสดงคอลัมน์ผู้รับผิดชอบ"}
            className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-12-5 font-medium shadow-(--dash-shadow) transition-colors ${
              showOwner ? "border-(--dash-accent) bg-[color-mix(in_oklab,var(--dash-accent),transparent_88%)] text-(--dash-accent)" : "border-(--dash-ring) bg-(--dash-surface) text-(--dash-ink-2) hover:bg-(--dash-hover)"
            }`}
          >
            <UserRound size={15} aria-hidden />
            ผู้รับผิดชอบ
          </button>
          <button
            type="button"
            onClick={() => {
              setClosedGroups(new Set());
              setOpenCustomers(allOpen ? new Set() : new Set(customerKeys));
            }}
            title={allOpen ? "ปิดแพล้นท์ทั้งหมด" : "เปิดแพล้นท์ทั้งหมด"}
            className="grid size-8 cursor-pointer place-items-center rounded-lg border border-(--dash-ring) bg-(--dash-surface) text-(--dash-ink-2) shadow-(--dash-shadow) hover:bg-(--dash-hover)"
          >
            {allOpen ? <ChevronsDownUp size={16} aria-hidden /> : <ChevronsUpDown size={16} aria-hidden />}
            <span className="sr-only">{allOpen ? "ปิดทั้งหมด" : "เปิดทั้งหมด"}</span>
          </button>
        </div>
      }
    >
      <div className="max-h-[680px] overflow-auto rounded-xl border border-(--dash-grid)">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr>
              <th rowSpan={2} className={`${HEAD} top-0 left-0 z-20 min-w-56 px-3 py-2 text-left align-bottom`}>
                <Head th="กลุ่มงาน / ลูกค้า / แพล้นท์" en="Fleet / Customer / Plant" />
              </th>
              {showOwner ? (
                <th rowSpan={2} className={`${HEAD} top-0 z-10 px-3 py-2 text-left align-bottom whitespace-nowrap`}>
                  <Head th="ผู้รับผิดชอบ" en="RC Owner" />
                </th>
              ) : null}
              {GROUPS.map((g) => (
                <th key={g.label} colSpan={g.cols.length} className={`${HEAD} ${SEP} top-0 z-10 h-7 px-3 text-center text-11-5 font-semibold tracking-wide text-(--dash-mut)`}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.en} className={`${HEAD} top-7 z-10 px-3 py-2 text-right whitespace-nowrap ${c.first ? SEP : ""}`}>
                  <Head th={c.th} en={c.en} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fleets.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + (showOwner ? 2 : 1)}>
                  <Empty />
                </td>
              </tr>
            ) : null}
            {fleets.map((f) => {
              const open = !closedGroups.has(f.group);
              return (
                <Fragment key={f.group}>
                  <tr className={`cursor-pointer border-t border-(--dash-grid) font-semibold ${FLEET_BG}`} onClick={() => setClosedGroups((s) => toggle(s, f.group))}>
                    <NameCell level={0} open={open} label={f.group} hint={`${f.customers.length} ลูกค้า`} />
                    {showOwner ? <td className="px-3" /> : null}
                    <Cells r={{ ...f.t, recruit: recruitOf(f.t) }} truck={f.targetTruck || null} />
                  </tr>
                  {open
                    ? f.customers.map((c) => {
                        const many = c.plants.length > 1;
                        const cOpen = openCustomers.has(c.key);
                        return (
                          <Fragment key={c.key}>
                            <tr
                              className={`border-t border-(--dash-grid) transition-colors hover:bg-(--dash-hover) ${many ? "cursor-pointer" : ""}`}
                              onClick={many ? () => setOpenCustomers((s) => toggle(s, c.key)) : undefined}
                            >
                              <NameCell level={1} open={many ? cOpen : null} label={c.customer} hint={many ? `${c.plants.length} แพล้นท์` : c.plants[0]?.plant !== c.customer ? c.plants[0]?.plant : ""} />
                              {showOwner ? <td className="px-3 whitespace-nowrap text-(--dash-ink-2)">{c.target?.rcOwner || DASH}</td> : null}
                              <Cells r={{ ...c.t, recruit: recruitOf(c.t) }} truck={c.target?.targetTruck ?? null} />
                            </tr>
                            {many && cOpen
                              ? c.plants.map((p) => (
                                  <tr key={p.key} className="border-t border-(--dash-grid)/70 bg-(--dash-sunken) text-(--dash-ink-2)">
                                    <NameCell level={2} open={null} label={p.plant} />
                                    {showOwner ? <td /> : null}
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
                <td className="sticky bottom-0 left-0 z-20 border-t border-(--dash-axis) bg-(--dash-sunken) px-3 py-2.5 text-(--dash-ink)">{totalLabel}</td>
                {showOwner ? <td className="sticky bottom-0 border-t border-(--dash-axis) bg-(--dash-sunken)" /> : null}
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
    <td className={`sticky left-0 z-10 py-2 pr-3 ${pad} ${level === 0 ? FLEET_BG : level === 2 ? "bg-(--dash-sunken)" : "bg-(--dash-surface)"}`}>
      <span className="flex items-center gap-1.5">
        {open === null ? (
          <span className="w-4 flex-none" />
        ) : (
          <ChevronRight size={14} aria-hidden className={`flex-none transition-transform ${level === 0 ? "text-(--dash-accent)" : "text-(--dash-mut)"} ${open ? "rotate-90" : ""}`} />
        )}
        <span className={level === 2 ? "" : "text-(--dash-ink)"}>{label}</span>
        {hint ? <span className="text-11-5 font-normal whitespace-nowrap text-(--dash-mut)">{hint}</span> : null}
      </span>
    </td>
  );
}

function Cells({ r, truck, sticky = false }: { r: Row; truck: number | null; sticky?: boolean }) {
  const cell = `px-3 py-2 text-right tabular-nums whitespace-nowrap ${sticky ? "sticky bottom-0 border-t border-(--dash-axis) bg-(--dash-sunken) py-2.5" : ""}`;
  return (
    <>
      {COLUMNS.map((c) => (
        <td key={c.en} className={`${cell} ${c.first ? SEP : ""} ${c.tone?.(r) ?? ""}`}>
          {c.cell(r, truck)}
        </td>
      ))}
    </>
  );
}

/** หัวคอลัมน์สองบรรทัด: ไทย + (English) */
function Head({ th, en }: { th: string; en: string }) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-(--dash-ink)">{th}</span>
      <span className="text-11 font-normal text-(--dash-mut)">({en})</span>
    </span>
  );
}

function Empty({ text = "ไม่มีข้อมูลตามตัวกรอง" }: { text?: string }) {
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

function ExportButton({ fleets, filter, today }: { fleets: ReturnType<typeof groupRows>; filter: string; today: string }) {
  const rows: ExportRow[] = fleets.flatMap((f) => [
    { level: "กลุ่มงาน", group: f.group, customer: "", plant: "", rcOwner: "", truck: f.targetTruck || null, c: f.t },
    ...f.customers.flatMap((c) => [
      { level: "ลูกค้า", group: f.group, customer: c.customer, plant: "", rcOwner: c.target?.rcOwner ?? "", truck: c.target?.targetTruck ?? null, c: c.t },
      ...c.plants.map((p) => ({ level: "แพล้นท์", group: f.group, customer: c.customer, plant: p.plant, rcOwner: "", truck: null, c: p })),
    ]),
  ]);
  const n = (header: string, value: (r: ExportRow) => number | null, width = 11): XlsxColumn<ExportRow> => ({ header, width, kind: "int", value });
  const columns: XlsxColumn<ExportRow>[] = [
    { header: "ระดับ (Level)", width: 11, value: (r) => r.level },
    { header: "กลุ่มงาน (Fleet)", width: 14, value: (r) => r.group },
    { header: "ลูกค้า (Customer)", width: 18, value: (r) => r.customer },
    { header: "แพล้นท์ (Plant)", width: 22, value: (r) => r.plant },
    { header: "ผู้รับผิดชอบ (RC Owner)", width: 18, value: (r) => r.rcOwner },
    n("เป้ารถ (Target Truck)", (r) => r.truck, 16),
    n("เป้าคน (Target Recruit)", (r) => recruitOf(r.c), 17),
    n("ปฏิบัติงาน (Active)", (r) => r.c.active, 15),
    n("ฝึกงาน (OJT)", (r) => r.c.ojt, 12),
    n("รวม (Total)", (r) => actualOf(r.c), 12),
    { header: "เต็มเป้า (%)", width: 12, kind: "decimal", value: (r) => (recruitOf(r.c) ? Math.round((actualOf(r.c) / recruitOf(r.c)) * 1000) / 10 : null) },
    n("อัตราว่าง (Vacant HC)", (r) => r.c.vacant, 16),
    n("รอสรรหา (Open)", (r) => r.c.open, 14),
    n("รอฝึกงาน (Waiting)", (r) => r.c.waiting, 15),
    n("สัมภาษณ์วันนี้ (Interview)", (r) => r.c.interview, 19),
    n("เริ่มฝึกวันนี้ (Training)", (r) => r.c.training, 18),
    n("เข้าใหม่เดือนนี้ (Newhire)", (r) => r.c.newhire, 19),
    n("ลาออกเดือนนี้ (Resign)", (r) => r.c.resign, 18),
  ];
  return (
    <XlsxExportButton
      className="h-9 px-3 text-13"
      name="Manpower-รายวัน"
      count={rows.length}
      build={() => ({
        sheet: "Manpower",
        title: `Manpower พจส. รายวัน · ${thDate(today)}`,
        filter,
        columns,
        rows,
      })}
    />
  );
}
