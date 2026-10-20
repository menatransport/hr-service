"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Clock, SearchX, Wrench, X } from "lucide-react";

import { InfoTip } from "@/components/ui/info-tip";
import { Pager } from "@/components/ui/pager";
import { SearchField } from "@/components/ui/field";
import {
  SegmentedControl,
  SummaryBody,
  SummaryFooter,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryStrip,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { todayInBangkok } from "@/lib/record-case-flow";
import { formatThaiDate, formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type {
  TruckBoard,
  TruckDriver,
  TruckRow,
  TruckState,
} from "@/app/recruitment/_lib/drivers/truck-status";

/**
 * สถานะรถ — รถทุกคัน + คนขับวันนี้ + งานซ่อม **ในภาพเดียว**
 *
 * อ่านจากบนลงล่างได้สามชั้น: ตัวเลขสี่สถานะ (กดกรอง) → แถบสีรายลูกค้า (เห็นทั้งบริษัทในจอเดียว
 * กดกรอง) → ตารางรายคัน · ตารางคือ “มุมมองตาราง” ของแถบสีด้วย จึงไม่ต้องมีปุ่มดูเป็นตารางแยก
 *
 * สีของสี่สถานะใช้ชุดเดียวทุกชั้น — teal พร้อมวิ่ง · เหลือง คนขับไม่มา · ฟ้า รถซ่อม · แดง ไม่มีคนขับ
 * (แดงคืองานของฝ่ายบุคคล: ต้องหาคนขับ)
 */

const STATES: {
  key: TruckState;
  label: string;
  hint: string;
  dot: string;
  chip: string;
  tone: "primary" | "sla" | "ink" | "alert";
}[] = [
  {
    key: "ready",
    label: "พร้อมวิ่ง",
    hint: "มีคนขับ และวันนี้มาทำงาน (หรือยังไม่มีบันทึกของวันนี้)",
    dot: "bg-primary",
    chip: "chip-live",
    tone: "primary",
  },
  {
    key: "absent",
    label: "คนขับไม่มา",
    hint: "มีคนขับประจำ แต่วันนี้ลา / หยุด / ตกคิว",
    dot: "bg-st-wait-ink",
    chip: "chip-wait",
    tone: "sla",
  },
  {
    key: "repair",
    label: "รถซ่อม",
    hint: "ATMS บอกว่าหยุดวิ่ง (รถซ่อม/อุบัติเหตุ/PM)",
    dot: "bg-st-new-ink",
    chip: "chip-new",
    tone: "ink",
  },
  {
    key: "nodriver",
    label: "ไม่มีคนขับ",
    hint: "รถว่าง ไม่มี พจส. ประจำ — ต้องหาคนขับ",
    dot: "bg-alert",
    chip: "chip-alert",
    tone: "alert",
  },
];
const STATE = Object.fromEntries(STATES.map((s) => [s.key, s])) as Record<
  TruckState,
  (typeof STATES)[number]
>;
/** เรียงให้คันที่ต้องจัดการขึ้นก่อน */
const STATE_ORDER: Record<TruckState, number> = { nodriver: 0, repair: 1, absent: 2, ready: 3 };

const PAGE_SIZE = 50;
const ALL = "all";

type Counts = Record<TruckState, number> & { total: number };

function countOf(rows: TruckRow[]): Counts {
  const c: Counts = { ready: 0, absent: 0, repair: 0, nodriver: 0, total: rows.length };
  for (const r of rows) c[r.state]++;
  return c;
}

export function TruckStatusView({ board }: { board: TruckBoard }) {
  const [branch, setBranch] = useState<string>(ALL);
  const [state, setState] = useState<TruckState | null>(null);
  const [fleet, setFleet] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(query.trim().toLowerCase());

  const branches = useMemo(() => {
    const n = new Map<string, number>();
    for (const t of board.trucks) n.set(t.branch || "ไม่ระบุ", (n.get(t.branch || "ไม่ระบุ") ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]);
  }, [board.trucks]);

  /* ชั้นสาขา — ตัวเลขและแถบลูกค้าคิดจากชุดนี้ (ไม่ขึ้นกับตัวกรองสถานะ/ลูกค้า จะได้เห็นภาพรวมเสมอ) */
  const inBranch = useMemo(
    () =>
      branch === ALL
        ? board.trucks
        : board.trucks.filter((t) => (t.branch || "ไม่ระบุ") === branch),
    [board.trucks, branch],
  );
  const counts = useMemo(() => countOf(inBranch), [inBranch]);

  const fleets = useMemo(() => {
    const by = new Map<string, TruckRow[]>();
    for (const t of inBranch) by.set(t.fleet, [...(by.get(t.fleet) ?? []), t]);
    return [...by.entries()]
      .map(([name, rows]) => ({ name, counts: countOf(rows) }))
      .sort((a, b) => b.counts.total - a.counts.total || a.name.localeCompare(b.name, "th"));
  }, [inBranch]);

  const results = useMemo(() => {
    const rows = inBranch.filter(
      (t) =>
        (!state || t.state === state) &&
        (!fleet || t.fleet === fleet) &&
        (!q ||
          [t.code, t.plate, t.fleet, t.plant, ...t.drivers.flatMap((d) => [d.name, d.code])]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    return rows.sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.code.localeCompare(b.code, "th", { numeric: true }),
    );
  }, [inBranch, state, fleet, q]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const pick = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const toggleState = (s: TruckState) => pick(setState)(state === s ? null : s);
  const toggleFleet = (f: string) => pick(setFleet)(fleet === f ? null : f);

  return (
    <div className="flex flex-col gap-4 animate-rise">
      <SummaryPanel label="สรุปสถานะรถ">
        <SummaryStats className="grid-cols-2 sm:grid-cols-5">
          <SummaryStat
            lead
            label="รถทั้งหมด"
            value={counts.total}
            unit="คัน"
            sub={branch === ALL ? "ทุกสาขา" : `สาขา${branch}`}
            active={!state}
            onClick={() => pick(setState)(null)}
            className="col-span-2 sm:col-span-1"
          />
          {STATES.map((s) => (
            <SummaryStat
              key={s.key}
              label={s.label}
              value={counts[s.key]}
              unit="คัน"
              title={s.hint}
              dot={s.dot}
              tone={s.tone}
              share={counts[s.key] / (counts.total || 1)}
              active={state === s.key}
              onClick={() => toggleState(s.key)}
            />
          ))}
        </SummaryStats>

        <SummaryToolbar>
          <SearchField
            value={query}
            onChange={pick(setQuery)}
            label="ค้นหารถ"
            placeholder="ค้นหาเลขรถ ทะเบียน ลูกค้า แพล้นท์ ชื่อคนขับ…"
            tone="filled"
            className="w-full lg:max-w-88 lg:flex-1"
          />
          <SegmentedControl
            label="เลือกสาขา"
            value={branch}
            onChange={pick(setBranch)}
            options={[
              { value: ALL, label: "ทุกสาขา", count: board.trucks.length },
              ...branches.map(([b, n]) => ({ value: b, label: b, count: n })),
            ]}
            className="w-full sm:w-auto"
          />
          <div className="flex items-center gap-3 self-end lg:ml-auto lg:self-auto">
            <InfoTip label="หน้านี้ดึงข้อมูลจากไหน อัปเดตอย่างไร">
              <span className="mb-1 block font-semibold text-ink">ดึงจากไหน</span>
              <span className="block">
                ฐาน <b className="text-ink">Boom_ETL</b> — ที่เก็บข้อมูลกลางที่ดึงมาจาก ATMS (ชุดเดียวกับที่
                Mena-Next อ่านผ่าน mongodbapi) · หน้านี้อ่านอย่างเดียว แก้ที่นี่ไม่ได้
              </span>
              <span className="mt-2 mb-1 block font-semibold text-ink">อัปเดตอย่างไร</span>
              <SourceLine
                name="รถ"
                how="ดึงทะเบียนรถจาก ATMS วันละรอบ"
                at={board.synced.vehicles}
              />
              <SourceLine
                name="คนขับประจำ"
                how="ดึงทะเบียน พจส. จาก ATMS วันละรอบ"
                at={board.synced.drivers}
              />
              <SourceLine
                name="สถานะงานวันนี้"
                how="นำเข้าจากไฟล์ Excel สถานะงาน เป็นรอบ — ยังไม่นำเข้า = “ไม่มีบันทึก”"
                at={board.synced.work}
              />
              <SourceLine
                name="รถซ่อม"
                how={
                  board.repairSource === "atms"
                    ? "สถานะรถใน ATMS สด (B/อ/PM) แบบหน้ารถค้างซ่อม · ขั้นงานจากบอร์ดซ่อม"
                    : "อ่าน ATMS ไม่ได้ — ใช้ใบแจ้งซ่อมที่ค้างบนบอร์ดซ่อมแทน"
                }
                at={board.synced.repairs}
              />
              <span className="mt-2 block">
                ไม่นับหาง กล้วยหอม รถหลอก รถสำนักงาน รถขาย รถรอขาย และรถร่วมภายนอก · ตัดสินตามลำดับ รถซ่อม → ไม่มีคนขับ →
                คนขับไม่มา → พร้อมวิ่ง · ตัวเลขเป็นของเวลาที่ระบบดึงมาล่าสุด อาจยังไม่ตรงกับ ATMS ณ ตอนนี้
              </span>
            </InfoTip>
          </div>
        </SummaryToolbar>

        {/* ── ภาพเดียว: รถทุกลูกค้าเป็นแถบสีสี่สถานะ ── */}
        <SummaryBody pad>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <h2 className="text-13 font-semibold">ภาพรวมตามลูกค้า</h2>
            <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-11-5 text-mut">
              {STATES.map((s) => (
                <li key={s.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={`size-2 rounded-full ${s.dot}`} />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
          <ul className="grid gap-x-8 gap-y-0.5 md:grid-cols-2 2xl:grid-cols-3">
            {fleets.map((f) => (
              <li key={f.name}>
                <FleetBar
                  name={f.name}
                  counts={f.counts}
                  on={fleet === f.name}
                  focus={state}
                  onClick={() => toggleFleet(f.name)}
                />
              </li>
            ))}
          </ul>
        </SummaryBody>

        <SummaryStrip className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* ETL ดึงจาก ATMS เป็นรอบ — บอกเวลาของแต่ละชุดตรง ๆ แทนปุ่มรีเฟรช (อ่านฐานซ้ำก็ได้ค่าเดิมจนกว่า ETL จะดึงรอบใหม่) */}
            <Freshness
              today={board.today}
              items={[
                { name: "สถานะคน", at: board.synced.work },
                { name: "สถานะรถ", at: board.synced.repairs },
              ]}
            />
            {state ? (
              <ClearChip label={STATE[state].label} dot={STATE[state].dot} onClear={() => toggleState(state)} />
            ) : null}
            {fleet ? <ClearChip label={fleet} onClear={() => toggleFleet(fleet)} /> : null}
          </div>
          <p role="status" aria-live="polite" className="text-12-5 text-mut">
            แสดง{" "}
            <span className="font-semibold text-primary tabular-nums">
              {results.length.toLocaleString("th-TH")}
            </span>{" "}
            คัน · คนขับวันที่ {formatThaiDate(board.today)}
          </p>
        </SummaryStrip>

        {results.length === 0 ? (
          <SummaryBody pad className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX size={22} strokeWidth={1.6} className="text-mut" aria-hidden />
            <p className="text-13 text-mut">ไม่พบรถตามเงื่อนไขนี้</p>
          </SummaryBody>
        ) : (
          <>
            {/* ── จอ ≥lg: ตาราง ── */}
            <div className="relative hidden max-h-[calc(100dvh-10.5rem)] overflow-auto border-t border-line bg-base-100 lg:block">
              <table className="sheet-table w-full min-w-[1080px] border-collapse text-13">
                <thead>
                  <tr>
                    {["เลขรถ", "ทะเบียน", "ลูกค้า", "แพล้นท์", "คนขับประจำ · วันนี้", "สถานะรถ"].map(
                      (h) => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 border-b border-line-strong bg-head px-3 py-2.5 text-left font-mono text-10-5 font-semibold tracking-[0.07em] whitespace-nowrap text-mut uppercase"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody key={`${current}-${results.length}`} className="animate-fade-in">
                  {pageRows.map((t) => (
                    <tr key={t.id} className="border-b border-line align-top last:border-0 hover:bg-base-200/50">
                      <td className="px-3 py-2.5 font-mono font-semibold whitespace-nowrap">{t.code || "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-12-5 whitespace-nowrap text-mut">{t.plate}</td>
                      <td className="px-3 py-2.5">{t.fleet}</td>
                      <td className="px-3 py-2.5 text-mut">{t.plant || "—"}</td>
                      <td className="px-3 py-2">
                        <DriverList drivers={t.drivers} />
                      </td>
                      <td className="px-3 py-2">
                        <StateCell truck={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── จอ <lg: แถวละคัน ── */}
            <SummaryBody className="lg:hidden">
              <ul key={`${current}-${results.length}`} className="divide-y divide-line">
                {pageRows.map((t) => (
                  <li key={t.id} className="flex flex-col gap-2 px-(--sheet-px) py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-13-5 font-semibold">
                          {t.code || "—"}{" "}
                          <span className="font-normal text-12 text-mut">{t.plate}</span>
                        </p>
                        <p className="truncate text-12 text-mut">
                          {t.fleet}
                          {t.plant ? ` · ${t.plant}` : ""}
                        </p>
                      </div>
                      <StateCell truck={t} />
                    </div>
                    <DriverList drivers={t.drivers} />
                  </li>
                ))}
              </ul>
            </SummaryBody>

            {pageCount > 1 ? (
              <SummaryFooter className="flex items-center justify-between gap-3">
                <p className="text-12 text-mut tabular-nums">
                  {((current - 1) * PAGE_SIZE + 1).toLocaleString("th-TH")}–
                  {((current - 1) * PAGE_SIZE + pageRows.length).toLocaleString("th-TH")} จาก{" "}
                  {results.length.toLocaleString("th-TH")}
                </p>
                <Pager current={current} count={pageCount} onGo={setPage} />
              </SummaryFooter>
            ) : null}
          </>
        )}
      </SummaryPanel>
    </div>
  );
}

/* ------------------------------------------------------------- ชิ้นย่อย */

/** หนึ่งลูกค้า = ชื่อ · แถบสีสี่สถานะ · ยอดรวม — กดแล้วกรองตารางเหลือลูกค้านี้ */
function FleetBar({
  name,
  counts,
  on,
  focus,
  onClick,
}: {
  name: string;
  counts: Counts;
  on: boolean;
  /** สถานะที่กรองอยู่ — สถานะอื่นในแถบจางลง ให้เห็นว่าลูกค้าไหนมีเรื่องนั้นมาก */
  focus: TruckState | null;
  onClick: () => void;
}) {
  const breakdown = STATES.filter((s) => counts[s.key])
    .map((s) => `${s.label} ${counts[s.key]}`)
    .join(" · ");

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={breakdown}
      className={`grid min-h-9 w-full cursor-pointer grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-field px-2 text-left transition-colors ${
        on ? "bg-soft ring-1 ring-primary/40 ring-inset" : "hover:bg-base-200/60"
      }`}
    >
      <span className={`truncate text-12-5 ${on ? "font-semibold text-primary" : ""}`}>{name}</span>
      <span aria-hidden className="flex h-2.5 gap-px overflow-hidden rounded-full bg-base-200">
        {STATES.map((s) =>
          counts[s.key] ? (
            <span
              key={s.key}
              className={`${s.dot} transition-opacity ${focus && focus !== s.key ? "opacity-20" : ""}`}
              style={{ flexGrow: counts[s.key] }}
            />
          ) : null,
        )}
      </span>
      <span className="w-14 text-right font-mono text-11-5 tabular-nums text-mut">
        {focus ? (
          <>
            <span className="font-semibold text-ink">{counts[focus]}</span>/{counts.total}
          </>
        ) : (
          `${counts.total} คัน`
        )}
      </span>
      <span className="sr-only">{breakdown}</span>
    </button>
  );
}

function DriverList({ drivers }: { drivers: TruckDriver[] }) {
  if (!drivers.length) return <span className="text-12-5 text-alert">ไม่มีคนขับประจำ</span>;
  return (
    <ul className="flex flex-col gap-1">
      {drivers.map((d) => (
        <li key={d.code} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-12-5">
          <span className="font-medium">{d.name || d.code}</span>
          <span className="font-mono text-11-5 text-mut">{d.code}</span>
          <span
            title={d.todayLabel}
            className={`chip cursor-help text-11 ${
              !d.today
                ? "chip-done"
                : d.tone === "work" || d.today === "ฝ"
                  ? "chip-live"
                  : d.tone === "exit"
                    ? "chip-alert"
                    : "chip-wait"
            }`}
          >
            {d.today || "—"} · {shortLabel(d)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** ป้ายสั้นในชิป — ความหมายเต็มอยู่ใน tooltip */
function shortLabel(d: TruckDriver): string {
  if (!d.today) return "ไม่มีบันทึก";
  return d.todayLabel.replace(/^พจส\.?\s*/, "").slice(0, 18);
}

function StateCell({ truck }: { truck: TruckRow }) {
  const s = STATE[truck.state];
  const { repair, stop } = truck;
  /* `YYYY-MM-DD` เทียบเป็นสตริงได้ตรง — ท่าเดียวกับ `RepairBadge` */
  const overdue = Boolean(repair?.due) && repair!.due < todayInBangkok();
  const days = stop?.days != null ? <span>· ค้าง {stop.days} วัน</span> : null;

  return (
    <div className="flex flex-col items-end gap-1 lg:items-start">
      <span className={`chip ${s.chip} text-11-5 whitespace-nowrap`} title={s.hint}>
        {s.label}
      </span>
      {repair ? (
        <p
          className="flex flex-wrap items-center gap-x-1.5 text-11-5 text-mut"
          title={repair.mrCode ? `ใบแจ้งซ่อม ${repair.mrCode}` : undefined}
        >
          <Wrench size={11} aria-hidden className="text-st-new-ink" />
          <span className="text-ink">{repair.label}</span>
          <span>· {repair.due ? `เสร็จ ${formatThaiDate(repair.due)}` : "ยังไม่มีกำหนดเสร็จ"}</span>
          {overdue ? <span className="font-medium text-alert">เลยกำหนด</span> : null}
          {days}
        </p>
      ) : null}
      {repair?.note ? (
        <p
          className="max-w-64 text-11-5 text-pretty text-mut"
          title={[repair.noteBy, repair.noteAt ? formatThaiDateTime(repair.noteAt) : ""].filter(Boolean).join(" · ")}
        >
          หมายเหตุ: <span className="text-ink">{repair.note}</span>
        </p>
      ) : null}
      {!repair && stop ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-11-5 text-mut">
          <Wrench size={11} aria-hidden className="text-st-new-ink" />
          <span className="text-ink">{stop.label}</span>
          {days}
        </p>
      ) : null}
    </div>
  );
}


/** วันที่ตามปฏิทินไทยของเวลา ISO */
const bangkokDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);

const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short" }).format(new Date(iso));

interface FreshItem {
  name: string;
  at: string | null;
}

/**
 * ความสดของข้อมูลในแถบเดียว — ขึ้นแค่ 2 ชุดที่คนดูสนใจ (Bew 15 ต.ค. 2026): สถานะคน = สถานะงานคนขับ ·
 * สถานะรถ = รถซ่อมจาก ATMS · เวลาชุดอื่นยังอยู่ในกล่อง ⓘ · วันที่ขึ้นครั้งเดียวที่หัว ถ้าเป็นของวันนี้ เหลือแค่เวลา
 * จุดสี: teal อัปเดตวันนี้ · เหลือง ยังไม่อัปเดตวันนี้ (ขึ้นวันที่ให้เห็น) · แดง อ่านเวลาไม่ได้
 */
function Freshness({ items, today }: { items: FreshItem[]; today: string }) {
  const allToday = items.every((it) => it.at && bangkokDay(it.at) >= today);
  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-line bg-base-100 px-3 py-1 text-12 text-mut">
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <Clock size={13} strokeWidth={2} aria-hidden className="flex-none" />
        {allToday ? "อัปเดตวันนี้" : "อัปเดตล่าสุด"}
      </span>
      {items.map(({ name, at }) => {
        const fresh = Boolean(at) && bangkokDay(at!) >= today;
        const dot = !at ? "bg-alert" : fresh ? "bg-primary" : "bg-st-wait-ink";
        const hint = !at ? "อ่านเวลาไม่ได้" : `${formatThaiDateTime(at)} · ${fresh ? "อัปเดตวันนี้" : "ยังไม่อัปเดตวันนี้"}`;
        return (
          <span key={name} className="flex items-center gap-1.5 whitespace-nowrap" title={`${name} — ${hint}`}>
            <span aria-hidden className={`size-1.5 rounded-full ${dot}`} />
            {name}
            <span className={`tabular-nums ${!at ? "text-alert" : fresh ? "text-ink" : "font-medium text-st-wait-ink"}`}>
              {!at ? "—" : fresh ? hhmm(at) : `${dayMonth(at)} ${hhmm(at)}`}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function SourceLine({ name, how, at }: { name: string; how: string; at?: string | null }) {
  return (
    <span className="mb-1 block">
      <b className="text-ink">{name}</b> — {how}
      {at !== undefined ? (
        <span className="block font-mono text-11 text-mut/85">
          ล่าสุด {at ? formatThaiDateTime(at) : "อ่านไม่ได้"}
        </span>
      ) : null}
    </span>
  );
}

function ClearChip({ label, dot, onClear }: { label: string; dot?: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-soft px-3 text-12 font-medium text-primary"
      aria-label={`ล้างตัวกรอง ${label}`}
    >
      {dot ? <span aria-hidden className={`size-2 rounded-full ${dot}`} /> : null}
      {label}
      <X size={13} aria-hidden />
    </button>
  );
}
