"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchX, Wrench } from "lucide-react";

import { TruckLogicButton } from "@/app/recruitment/_components/admin/truck-logic-dialog";
import { OnboardingDialog } from "@/app/recruitment/_components/admin/onboarding-dialog";
import { Pager } from "@/components/ui/pager";
import { SearchField } from "@/components/ui/field";
import {
  SummaryBody,
  SummaryFooter,
  SummaryPanel,
  SummaryStat,
  SummaryStats,
  SummaryToolbar,
} from "@/components/ui/summary-panel";
import { todayInBangkok } from "@/lib/record-case-flow";
import { formatThaiDate, formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type {
  CarState,
  TruckBoard,
  TruckDriver,
  TruckJob,
  TruckRow,
  TruckState,
} from "@/app/recruitment/_lib/drivers/truck-status";

/**
 * สถานะรถ — รถทุกคัน + คนขับวันนี้ + งานซ่อม **ในภาพเดียว**
 *
 * อ่านจากบนลงล่างได้สามชั้น: ตัวเลขสี่สถานะ (กดกรอง) → แถบสีรายลูกค้า (เห็นทั้งบริษัทในจอเดียว
 * กดกรอง) → ตารางรายคัน · ตารางคือ “มุมมองตาราง” ของแถบสีด้วย จึงไม่ต้องมีปุ่มดูเป็นตารางแยก
 *
 * สีของห้าสถานะใช้ชุดเดียวทุกชั้น — teal พร้อมวิ่ง · เหลือง คนขับไม่มา · ฟ้า รถซ่อม · แดง ไม่มีคนขับ
 * · ชมพู รถรอสรรหา (แดงคืองานของฝ่ายบุคคล: ต้องหาคนขับ · ชมพู = มี JR หาคนให้แล้ว)
 */

const STATES: {
  key: TruckState;
  label: string;
  hint: string;
  dot: string;
  chip: string;
  tone: "primary" | "sla" | "ink" | "alert" | "pink";
}[] = [
  {
    key: "ready",
    label: "พร้อมวิ่ง",
    hint: "มีคนขับ และวันนี้มาทำงาน (หรือยังไม่มีบันทึกของวันนี้) · หรือมีคนใหม่ฝึกงานอยู่",
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
    hint: "รถว่าง ไม่มี พจส. ประจำ และยังไม่มี JR — ต้องหาคนขับ",
    dot: "bg-alert",
    chip: "chip-alert",
    tone: "alert",
  },
  {
    key: "hiring",
    label: "รถรอสรรหา",
    hint: "มี JR ผูกรถคันนี้ ยังไม่ได้คนเริ่มฝึก (รอสรรหา · รอฝึกงาน)",
    dot: "bg-st-pink-ink",
    chip: "chip-pink",
    tone: "pink",
  },
];
const STATE = Object.fromEntries(STATES.map((s) => [s.key, s])) as Record<
  TruckState,
  (typeof STATES)[number]
>;
/** เรียงให้คันที่ต้องจัดการขึ้นก่อน */
const STATE_ORDER: Record<TruckState, number> = { nodriver: 0, hiring: 1, repair: 2, absent: 3, ready: 4 };

const PAGE_SIZE = 50;

type Counts = Record<TruckState, number> & { total: number };

function countOf(rows: TruckRow[]): Counts {
  const c: Counts = { ready: 0, absent: 0, repair: 0, nodriver: 0, hiring: 0, total: rows.length };
  for (const r of rows) c[r.state]++;
  return c;
}

export function TruckStatusView({ board }: { board: TruckBoard }) {
  const [state, setState] = useState<TruckState | null>(null);
  const [fleet, setFleet] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  /* JR ที่เปิดอยู่ใน modal · แก้แล้วปิด = โหลดบอร์ดใหม่ (ช่วง/ผู้สมัครอาจเปลี่ยน) */
  const [jrFor, setJrFor] = useState<string | null>(null);
  const [jrSaved, setJrSaved] = useState(false);
  const router = useRouter();
  const q = useDeferredValue(query.trim().toLowerCase());

  /* แถบลูกค้าคิดจากรถทั้งหมดเสมอ · การ์ดสถานะด้านบนคิดตามลูกค้าที่เลือก (ไม่ขึ้นกับตัวกรองสถานะ) */
  const { trucks } = board;
  const inFleet = useMemo(
    () => (fleet ? trucks.filter((t) => t.fleet === fleet) : trucks),
    [trucks, fleet],
  );
  const counts = useMemo(() => countOf(inFleet), [inFleet]);

  const fleets = useMemo(() => {
    const by = new Map<string, TruckRow[]>();
    for (const t of trucks) by.set(t.fleet, [...(by.get(t.fleet) ?? []), t]);
    return [...by.entries()]
      .map(([name, rows]) => ({ name, counts: countOf(rows) }))
      .sort((a, b) => b.counts.total - a.counts.total || a.name.localeCompare(b.name, "th"));
  }, [trucks]);

  const results = useMemo(() => {
    const rows = inFleet.filter(
      (t) =>
        (!state || t.state === state) &&
        (!q ||
          [t.code, t.plate, t.fleet, t.plant, t.job?.code ?? "", ...t.drivers.flatMap((d) => [d.name, d.code])]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
    return rows.sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        a.code.localeCompare(b.code, "th", { numeric: true }),
    );
  }, [inFleet, state, q]);

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
        <SummaryStats className="grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <SummaryStat
            lead
            label="รถทั้งหมด"
            value={counts.total}
            unit="คัน"
            sub={fleet ?? `สาขา${board.branch}`}
            active={!state}
            onClick={() => pick(setState)(null)}
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
          <div className="flex items-center gap-3 self-end lg:ml-auto lg:self-auto">
            <TruckLogicButton board={board} />
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

        {results.length === 0 ? (
          <SummaryBody pad className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX size={22} strokeWidth={1.6} className="text-mut" aria-hidden />
            <p className="text-13 text-mut">ไม่พบรถตามเงื่อนไขนี้</p>
          </SummaryBody>
        ) : (
          <>
            {/* ── จอ ≥lg: ตาราง ── */}
            <div className="relative hidden max-h-[calc(100dvh-10.5rem)] overflow-auto border-t border-line bg-base-100 lg:block">
              <table className="sheet-table w-full min-w-[1160px] border-collapse text-13">
                <thead>
                  <tr>
                    {["เลขรถ", "ทะเบียน", "ลูกค้า", "แพล้นท์", "พนักงานจัดส่ง", "สถานะรถ", "อัปเดตเวลา"].map(
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
                        <DriverCell truck={t} onOpenJob={setJrFor} />
                      </td>
                      <td className="px-3 py-2">
                        <StateCell truck={t} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <UpdatedAt at={t.updatedAt} today={board.today} />
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
                    <DriverCell truck={t} onOpenJob={setJrFor} />
                    <p className="text-11-5 text-mut">
                      อัปเดต <UpdatedAt at={t.updatedAt} today={board.today} />
                    </p>
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

      {jrFor ? (
        <OnboardingDialog
          id={jrFor}
          onClose={() => {
            setJrFor(null);
            if (jrSaved) {
              setJrSaved(false);
              router.refresh();
            }
          }}
          onSaved={() => setJrSaved(true)}
        />
      ) : null}
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

/**
 * คอลัมน์พนักงานจัดส่ง — คนประจำตอนนี้ แล้วตามด้วยคนใหม่จาก JR (ถ้ามี)
 * ไม่มีทั้งคู่ = ตัวแดง "ไม่มีคนขับประจำ" (งานของฝ่ายบุคคล) · มี JR = ไม่ขึ้นตัวแดงซ้ำ (Bew 6 พ.ย. 2026)
 */
function DriverCell({ truck, onOpenJob }: { truck: TruckRow; onOpenJob: (id: string) => void }) {
  const { drivers, job } = truck;
  if (!drivers.length && !job) return <span className="text-12-5 text-alert">ไม่มีคนขับประจำ</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {drivers.length ? <DriverList drivers={drivers} /> : null}
      {job ? (
        <JobRow
          job={job}
          divided={drivers.length > 0}
          known={drivers.some((d) => sameDriver(d, job))}
          onOpen={() => onOpenJob(job.id)}
        />
      ) : null}
    </div>
  );
}

function DriverList({ drivers }: { drivers: TruckDriver[] }) {
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

/**
 * คนใหม่ที่กำลังมาขับคันนี้ — แถวเดียวกับคนประจำ: ชื่อ · ป้าย "ช่วง · เลข JR" (กดป้าย = modal ข้อมูล JR บนหน้านี้)
 * ยังไม่มีผู้สมัคร (รอสรรหา) = ป้ายก่อน แล้ว "ยังไม่มีผู้สมัคร"
 */
function JobRow({
  job,
  divided,
  known,
  onOpen,
}: {
  job: TruckJob;
  divided: boolean;
  known: boolean;
  onOpen: () => void;
}) {
  /* คนฝึกงานขึ้นใน ATMS แล้ว (แถวบน) = เหลือแค่ป้าย ไม่ขึ้นชื่อซ้ำ */
  if (known) return <JobChip job={job} onOpen={onOpen} />;
  return (
    <p
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-12-5 ${
        divided ? "border-t border-dashed border-line pt-1.5" : ""
      }`}
    >
      {job.candidate ? (
        <>
          <span className="font-medium">{job.candidate}</span>
          <JobChip job={job} onOpen={onOpen} />
        </>
      ) : (
        <>
          <JobChip job={job} onOpen={onOpen} />
          <span className="text-mut">ยังไม่มีผู้สมัคร</span>
        </>
      )}
    </p>
  );
}

function JobChip({ job, onOpen }: { job: TruckJob; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`ขอเมื่อ ${formatThaiDate(job.requestedOn)} · เปิดข้อมูล JR`}
      className={`chip ${job.hiring ? "chip-pink" : "chip-live"} w-fit cursor-pointer gap-1 text-11 hover:brightness-95`}
    >
      {job.statusLabel}
      <span aria-hidden>·</span>
      <span className="font-mono underline decoration-dotted underline-offset-2">{job.code}</span>
    </button>
  );
}

/** คนขับใน ATMS คือผู้สมัครของ JR — รหัสตรง หรือชื่อตรง (ผู้สมัครที่ยังไม่ผูกรหัส) */
function sameDriver(d: TruckDriver, job: TruckJob): boolean {
  if (job.candidateCode && d.code === job.candidateCode) return true;
  return Boolean(job.candidate) && d.name.replace(/\s+/g, "") === job.candidate.replace(/\s+/g, "");
}

/** ป้ายสั้นในชิป — ความหมายเต็มอยู่ใน tooltip */
function shortLabel(d: TruckDriver): string {
  if (!d.today) return "ไม่มีบันทึก";
  return d.todayLabel.replace(/^พจส\.?\s*/, "").slice(0, 18);
}

/**
 * คอลัมน์สถานะรถพูดถึง “ตัวรถ” อย่างเดียว (Bew 6 พ.ย. 2026) — เรื่องคนอยู่คอลัมน์พนักงานจัดส่งแล้ว
 * ไม่มีคนขับ / คนขับไม่มา = รถจอด · ซ่อมตัดสินก่อนเสมอ (`stateOf`) คันที่ซ่อมจึงไม่ขึ้นว่าจอด
 */
const CAR: Record<CarState, { label: string; chip: string; why?: string }> = {
  ready: { label: "พร้อมวิ่ง", chip: "chip-live" },
  repair: { label: "ซ่อม", chip: "chip-new" },
  nodriver: { label: "จอด", chip: "chip-done", why: "ไม่มีคนขับ" },
  absent: { label: "จอด", chip: "chip-done", why: "คนขับไม่มา" },
};

function StateCell({ truck }: { truck: TruckRow }) {
  const s = STATE[truck.car];
  const car = CAR[truck.car];
  /* ATMS ยังไม่มีคนขับ แต่มีคนใหม่ฝึกงานกับคันนี้แล้ว */
  const why = truck.car === "nodriver" && truck.job && !truck.job.hiring ? "รอคนฝึกงาน" : car.why;
  const { repair, stop } = truck;
  /* `YYYY-MM-DD` เทียบเป็นสตริงได้ตรง — ท่าเดียวกับ `RepairBadge` */
  const overdue = Boolean(repair?.due) && repair!.due < todayInBangkok();
  const days = stop?.days != null ? <span>· ค้าง {stop.days} วัน</span> : null;

  return (
    <div className="flex flex-col items-end gap-1 lg:items-start">
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span className={`chip ${car.chip} text-11-5`} title={s.hint}>
          {car.label}
        </span>
        {why ? <span className="text-11-5 text-mut">{why}</span> : null}
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

/** เวลาที่ ETL ลงแถวคนขับของคันนี้ — วัน เดือน ปี เวลา เสมอ · ค้างจากวันก่อนเป็นสีเตือน */
function UpdatedAt({ at, today }: { at: string | null; today: string }) {
  if (!at) return <span className="text-mut">—</span>;
  const fresh = bangkokDay(at) >= today;
  return (
    <time
      dateTime={at}
      title={fresh ? "อัปเดตวันนี้" : "ยังไม่อัปเดตวันนี้"}
      className={`text-12 tabular-nums ${fresh ? "text-mut" : "font-medium text-st-wait-ink"}`}
    >
      {formatThaiDateTime(at)}
    </time>
  );
}
