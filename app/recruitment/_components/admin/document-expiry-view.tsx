"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  SearchX,
  X,
} from "lucide-react";

import { InfoTip } from "@/components/ui/info-tip";
import { SearchField, SelectField } from "@/components/ui/field";
import { Pager } from "@/components/ui/pager";
import {
  EXPIRY_DOC_KINDS,
  THAI_MONTHS_FULL,
  THAI_WEEKDAYS_SHORT,
  expiryDocKind,
  expiryState,
  formatExpiryGap,
  formatThaiDate,
  primaryPhone,
  type DocExpiry,
  type ExpiryDocKind,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ศูนย์เอกสาร — ปฏิทินวันหมดอายุเอกสารของ พจส. แบบ **สองฝั่ง** (23 ก.ย. 2026 ตามคำสั่งเจ้าของงาน)
 *
 * | ฝั่ง | หน้าที่ |
 * |---|---|
 * | ซ้าย — ปฏิทิน (กว้างกว่าแผงขวา) | วันไหนมีของ ชื่อคนขับ (ชิป) · จอแคบยุบเป็นจุดสี |
 * | ขวา — รายละเอียด | ตัวงาน: รายชื่อของวันที่กด (หรือทั้งเดือน จัดกลุ่มตามวัน) พร้อมสถานะ |
 *
 * **ตารางเดิมถูกถอดออก** — รายการฝั่งขวาทำหน้าที่แทน และอ่านคู่กับปฏิทินได้โดยไม่ต้อง
 * เลื่อนหน้าลงไปหา · ปฏิทินโชว์ชื่อได้ 3 คนต่อวัน ที่เหลือกดวันดูทางขวา
 *
 * ฝั่งซ้าย `sticky` บนจอใหญ่ — เลื่อนรายการยาว ๆ ฝั่งขวาแล้วปฏิทินยังอยู่ให้กดวันอื่นต่อได้
 *
 * ทั้งชุดถูกส่งมาจากเซิร์ฟเวอร์ครั้งเดียวแล้วกรอง/เปลี่ยนเดือนในเครื่อง — ท่าเดียวกับ
 * `DriverRegistryView` และ `DriverWorkYear` · กดเปลี่ยนเดือนจึงไม่มีสถานะ “กำลังโหลด”
 */

/** รายการต่อหน้าฝั่งขวา */
const PAGE_SIZE = 30;

/** ชิปชื่อที่โชว์ได้ในหนึ่งช่องก่อนยุบเป็น “+N เพิ่มเติม” */
const MAX_VISIBLE = 3;

const pad = (n: number) => String(n).padStart(2, "0");

type KindFilter = ExpiryDocKind | "all";

/** ช่องหนึ่งช่องในตาราง 7 คอลัมน์ — `inMonth: false` คือวันของเดือนข้างเคียง */
interface Cell {
  iso: string;
  dayNo: number;
  inMonth: boolean;
}

/**
 * 42 ช่อง (6 สัปดาห์) เสมอ — ความสูงของปฏิทินไม่กระโดดตอนเปลี่ยนเดือน
 * (`Date` สร้างจากตัวเลข ปี/เดือน/วัน ที่กำหนดเอง ไม่ได้อ่านนาฬิกา ผลจึงเท่ากันทุกโซนเวลา)
 */
function buildCells(year: number, month: number): Cell[] {
  const lead = new Date(year, month - 1, 1).getDay();
  const cells: Cell[] = [];

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(year, month - 1, 1 - lead + i);
    cells.push({
      iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      dayNo: d.getDate(),
      inMonth: d.getMonth() === month - 1 && d.getFullYear() === year,
    });
  }

  return cells;
}

/** `YYYY-MM-DD` → ชื่อวันย่อ (อา จ อ …) */
function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return THAI_WEEKDAYS_SHORT[new Date(y, m - 1, d).getDay()];
}

export function DocumentExpiryView({
  rows,
  /** วันนี้ตามเวลาไทย คิดมาจากเซิร์ฟเวอร์ — **ห้ามเรียก `new Date()` เพื่อหาวันนี้ในนี้**
      ไม่งั้นช่อง “วันนี้” จะไม่ตรงกันระหว่าง server render กับ client แล้ว hydration พัง */
  todayISO,
}: {
  rows: DocExpiry[];
  todayISO: string;
}) {
  /* เปิดมาที่เดือนปัจจุบัน ไม่ใช่เดือนของแถวแรกในข้อมูล — ใบที่หมดอายุไปแล้ว
     ห้าปีมีอยู่จริงในทะเบียน ถ้าเปิดมาที่นั่นหน้าจะดูเหมือนพาไปผิดที่ */
  const [year, setYear] = useState(() => Number(todayISO.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayISO.slice(5, 7)));

  const [kind, setKind] = useState<KindFilter>("all");
  /** `""` = ดูทั้งเดือน · `YYYY-MM-DD` = หุบเหลือวันเดียวที่กดจากปฏิทิน */
  const [day, setDay] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const search = useDeferredValue(query).trim().toLowerCase();
  const monthPrefix = `${year}-${pad(month)}`;

  /** ปีที่เลือกได้ — ช่วงที่มีข้อมูลจริง บวกปีที่กำลังดูอยู่ (เผื่อกดลูกศรเลยออกไป) */
  const years = useMemo(() => {
    const set = new Set<number>([Number(todayISO.slice(0, 4)), year]);
    for (const row of rows) set.add(Number(row.dateISO.slice(0, 4)));
    return [...set].filter(Number.isFinite).sort((a, b) => a - b);
  }, [rows, todayISO, year]);

  /** ทั้งเดือนที่เปิดอยู่ กรองด้วยชนิดเอกสารแล้ว — ปฏิทินอ่านจากตัวนี้ */
  const monthRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.dateISO.startsWith(monthPrefix) && (kind === "all" || row.kind === kind),
      ),
    [rows, monthPrefix, kind],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, DocExpiry[]>();
    for (const row of monthRows) {
      const list = map.get(row.dateISO);
      if (list) list.push(row);
      else map.set(row.dateISO, [row]);
    }
    return map;
  }, [monthRows]);

  /** รายการฝั่งขวา — เดือนที่เปิดอยู่ (หรือวันเดียวที่กด) แล้วค่อยกรองคำค้น
      (`rows` เรียงตามวันที่มาแล้วจาก `collectDocExpiries()` จึงจัดกลุ่มต่อได้เลย) */
  const results = useMemo(() => {
    const scoped = day ? (byDay.get(day) ?? []) : monthRows;
    if (!search) return scoped;

    return scoped.filter((row) =>
      [row.name, row.drivercode, row.phone, row.siteLabel, row.plateNo].some((field) =>
        field.toLowerCase().includes(search),
      ),
    );
  }, [byDay, monthRows, day, search]);

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const sliceFrom = (current - 1) * PAGE_SIZE;

  /** หน้าปัจจุบัน จัดกลุ่มตามวัน — กลุ่มที่ถูกตัดข้ามหน้าก็ขึ้นหัวกลุ่มซ้ำในหน้าถัดไป */
  const groups = useMemo(() => {
    const out: { iso: string; items: DocExpiry[] }[] = [];
    for (const row of results.slice(sliceFrom, sliceFrom + PAGE_SIZE)) {
      const last = out[out.length - 1];
      if (last?.iso === row.dateISO) last.items.push(row);
      else out.push({ iso: row.dateISO, items: [row] });
    }
    return out;
  }, [results, sliceFrom]);

  const cells = useMemo(() => buildCells(year, month), [year, month]);
  const thisMonth = monthPrefix === todayISO.slice(0, 7);
  const monthLabel = `${THAI_MONTHS_FULL[month - 1]} ${year + 543}`;

  /** ทุกอย่างที่เปลี่ยนเดือนต้องล้างวันที่เลือกและกลับหน้าแรกของรายการ */
  function jump(nextYear: number, nextMonth: number) {
    setYear(nextYear);
    setMonth(nextMonth);
    setDay("");
    setPage(1);
  }

  function step(by: number) {
    const next = new Date(year, month - 1 + by, 1);
    jump(next.getFullYear(), next.getMonth() + 1);
  }

  function pickDay(iso: string) {
    setDay((prev) => (prev === iso ? "" : iso));
    setPage(1);
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(24rem,1fr)]">
      {/* ══════════════════ ซ้าย — ปฏิทิน ══════════════════
          `@container` — ช่องวันเลือกเองว่าจะโชว์ชื่อคนหรือแค่จุดสี จาก **ความกว้างของ
          ปฏิทิน** ไม่ใช่ของจอ (จอกว้างแต่ปฏิทินถูกแบ่งครึ่งกับแผงขวาก็ยังแคบได้) */}
      <aside className="@container flex flex-col gap-3 xl:sticky xl:top-4">
        <section className="elev-card overflow-hidden rounded-box border border-line bg-base-100">
          {/* ── หัวการ์ด: ลูกศร + ชื่อเดือน + ดรอปดาวน์เดือน/ปี ──
              ดรอปดาวน์เพราะใบขับขี่หมดอายุห่างไปหลายปี กดลูกศรทีละเดือนไม่ไหว */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 @xl:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <Step label="เดือนก่อนหน้า" onClick={() => step(-1)}>
                <ChevronLeft size={17} strokeWidth={1.9} aria-hidden />
              </Step>
              <Step label="เดือนถัดไป" onClick={() => step(1)}>
                <ChevronRight size={17} strokeWidth={1.9} aria-hidden />
              </Step>
              <h2 className="ml-1 flex min-w-0 items-center gap-1 text-15-5 font-semibold tabular-nums">
                <span className="truncate">{monthLabel}</span>
                <InfoTip label="วันหมดอายุมาจากไหน และแก้ที่ไหน">
                <b className="font-medium text-ink">ใบขับขี่</b> มาจากระบบต้นทาง (
                <code className="font-mono text-11-5">main_driver.driver_expiry_date</code>)
                แก้ที่นี่ไม่ได้
                <br />
                <br />
                <b className="font-medium text-ink">บัตรประชาชน</b> ไม่มีในระบบต้นทาง —
                ฝ่ายบุคคลกรอกเองได้ที่หน้าประวัติของแต่ละคน ใบที่ยังไม่กรอกจะไม่ขึ้นในปฏิทิน
                <br />
                <br />
                นับเฉพาะ พจส. ที่ยังปฏิบัติงาน และนับเป็น <b className="font-medium text-ink">ใบ</b>{" "}
                ไม่ใช่เป็นคน — คนหนึ่งมีได้สองใบ
              </InfoTip>
              </h2>
              {thisMonth ? null : (
                <button
                  type="button"
                  onClick={() => jump(Number(todayISO.slice(0, 4)), Number(todayISO.slice(5, 7)))}
                  className="ml-1 flex-none cursor-pointer rounded-full border border-line px-2.5 py-0.5 text-12 text-primary transition-colors hover:border-primary/40 hover:bg-soft"
                >
                  เดือนนี้
                </button>
              )}
            </div>
            <div className="flex w-full items-center gap-2 @md:w-auto">
            <SelectField
              id="doc-expiry-month"
              label="เดือน"
              srLabel
              className="min-w-0 flex-1 @md:w-32 @md:flex-none"
              value={String(month)}
              onChange={(v) => jump(year, Number(v))}
              options={THAI_MONTHS_FULL.map((name, i) => ({
                value: String(i + 1),
                label: name,
              }))}
            />
            <SelectField
              id="doc-expiry-year"
              label="ปี พ.ศ."
              srLabel
              className="w-24 flex-none"
              value={String(year)}
              onChange={(v) => jump(Number(v), month)}
              options={years.map((y) => ({ value: String(y), label: String(y + 543) }))}
            />
            </div>
          </div>

          {/* ── ตารางวัน ── */}
          <div className="px-2 pt-2 pb-2 @xl:px-3">
            <div className="grid grid-cols-7 pb-1">
              {THAI_WEEKDAYS_SHORT.map((label, i) => (
                <span
                  key={label}
                  className={`py-1 text-center text-11-5 font-semibold @xl:text-12 ${
                    i === 0 ? "text-alert/75" : i === 6 ? "text-primary/80" : "text-mut"
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((cell) => (
                <DayCell
                  key={cell.iso}
                  cell={cell}
                  items={cell.inMonth ? (byDay.get(cell.iso) ?? []) : []}
                  today={cell.iso === todayISO}
                  past={cell.iso < todayISO}
                  selected={cell.iso === day}
                  onPick={pickDay}
                />
              ))}
            </div>
          </div>

          {/* ── คำอธิบายสี = ตัวกรองชนิดเอกสาร ── */}
          <div className="flex items-center gap-1 border-t border-line bg-base-200/35 p-2">
            <KindButton active={kind === "all"} onClick={() => setKind("all")}>
              ทั้งหมด
            </KindButton>
            {EXPIRY_DOC_KINDS.map((k) => (
              <KindButton key={k.kind} active={kind === k.kind} onClick={() => setKind(k.kind)}>
                <span aria-hidden className={`size-2 flex-none rounded-full ${k.dot}`} />
                {k.label}
              </KindButton>
            ))}
          </div>
        </section>
      </aside>

      {/* ══════════════════ ขวา — รายละเอียด ══════════════════ */}
      <section className="elev-card flex min-w-0 flex-col overflow-hidden rounded-box border border-line bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="text-11-5 font-semibold tracking-[0.04em] text-mut">
              {day ? "รายการของวันที่เลือก" : "รายการทั้งเดือน"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-16 font-semibold">
                {day ? `${weekdayOf(day)}. ${formatThaiDate(day, "full")}` : monthLabel}
              </h2>
              <span className="rounded-full bg-base-200 px-2 py-0.5 font-mono text-11-5 font-semibold text-mut tabular-nums">
                {results.length} ใบ
              </span>
              {day ? (
                <button
                  type="button"
                  onClick={() => pickDay(day)}
                  className="flex cursor-pointer items-center gap-1 rounded-full border border-primary/40 bg-soft px-2.5 py-0.5 text-12 text-primary transition-colors hover:border-primary"
                >
                  ดูทั้งเดือน
                  <X size={12} strokeWidth={2.2} aria-hidden />
                </button>
              ) : null}
            </div>
          </div>

          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            label="ค้นหาในรายการเอกสารหมดอายุ"
            placeholder="ค้นหาชื่อ รหัส เบอร์โทร ทะเบียนรถ…"
            className="w-full sm:w-72"
          />
        </div>

        {results.length ? (
          <>
            {/* `key` เปลี่ยนทุกครั้งที่ชุดรายการเปลี่ยน → แอนิเมชันขาเข้าเล่นซ้ำ
                เป็นตัวบอกว่า “รายการตอบสิ่งที่เพิ่งกดไปแล้ว” */}
            <div key={`${monthPrefix}-${day}-${kind}-${current}-${results.length}`}>
              {groups.map((group) => (
                <div key={group.iso}>
                  {/* หัวกลุ่มวัน — ไม่ต้องมีตอนเลือกวันเดียว หัวแผงบอกวันที่อยู่แล้ว */}
                  {day ? null : (
                    <div className="flex items-center justify-between gap-2 border-b border-line bg-head px-4 py-1.5 sm:px-5">
                      <span className="flex items-center gap-2 text-12 font-semibold text-ink">
                        <span className="w-6 text-mut">{weekdayOf(group.iso)}</span>
                        {formatThaiDate(group.iso, "full")}
                        {group.iso === todayISO ? (
                          <span className="rounded-full bg-primary px-1.5 py-px text-10-5 font-semibold text-primary-content">
                            วันนี้
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-11 text-mut tabular-nums">
                        {group.items.length} ใบ
                      </span>
                    </div>
                  )}
                  <ul>
                    {group.items.map((row, i) => (
                      <Item key={`${row.drivercode}-${row.kind}`} row={row} index={i} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 sm:px-5">
              <p className="font-mono text-12 text-mut tabular-nums">
                {sliceFrom + 1}–{Math.min(sliceFrom + PAGE_SIZE, results.length)} จาก{" "}
                {results.length} ใบ
              </p>
              {pageCount > 1 ? <Pager current={current} count={pageCount} onGo={setPage} /> : null}
            </div>
          </>
        ) : (
          <Empty searching={Boolean(search)} onClearSearch={() => setQuery("")} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- ช่องวัน */

/**
 * หนึ่งวันในปฏิทิน — ปฏิทินแคบโชว์จุดสีต่อชนิดเอกสาร · ปฏิทินกว้างโชว์ชิปชื่อคนขับ
 *
 * **วันที่ไม่มีเอกสาร (และวันของเดือนข้างเคียง) เป็น `<div>` ไม่ใช่ `<button>`** — ช่องว่าง
 * ที่กดได้ทำให้การกดที่มีความหมายจมหาย และแท็บต้องไล่ผ่านช่องเปล่าก่อนถึงของจริง
 *
 * **ไม่มีพื้นแดงสำหรับวันที่เลยมาแล้ว** (คำสั่งเจ้าของงาน) — แค่หรี่จุด/ชิปลงหนึ่งขั้น
 */
function DayCell({
  cell,
  items,
  today,
  past,
  selected,
  onPick,
}: {
  cell: Cell;
  items: DocExpiry[];
  today: boolean;
  past: boolean;
  selected: boolean;
  onPick: (iso: string) => void;
}) {
  const kinds = EXPIRY_DOC_KINDS.filter((k) => items.some((row) => row.kind === k.kind));
  const dim = past ? "opacity-60" : "";

  /* ปฏิทินแคบ (< @xl): ช่องเตี้ย เลขกลาง + จุดสี · ปฏิทินกว้าง: ช่องสูง เลขมุมซ้าย + ชิปชื่อ */
  const shell = `flex h-11 min-w-0 flex-col items-center justify-center gap-0.75 rounded-field border text-left transition-colors @xl:h-auto @xl:min-h-24 @xl:items-stretch @xl:justify-start @xl:gap-1 @xl:p-1.5 ${
    selected
      ? "border-primary bg-soft ring-1 ring-primary ring-inset"
      : !cell.inMonth
        ? "border-transparent @xl:bg-base-200/30"
        : today
          ? "border-primary/40 bg-soft/50"
          : items.length
            ? "border-transparent hover:border-line-strong hover:bg-base-200/50 @xl:border-line/70"
            : "border-transparent @xl:border-line/50"
  }`;

  const body = (
    <>
      {/* เลขวัน — วันนี้คือวงทึบสีหลัก จุดอ้างอิงเดียวในทั้งตาราง */}
      <span className="flex items-center justify-between gap-1">
        <span
          className={`flex size-6 flex-none items-center justify-center rounded-full text-12-5 leading-none tabular-nums @xl:text-13 ${
            today
              ? "bg-primary font-semibold text-primary-content"
              : !cell.inMonth
                ? "text-mut/35"
                : items.length
                  ? "font-semibold text-ink"
                  : "text-mut/80"
          }`}
        >
          {cell.dayNo}
        </span>
        {items.length ? (
          <span className="hidden font-mono text-10-5 font-semibold text-mut tabular-nums @xl:inline">
            {items.length}
          </span>
        ) : null}
      </span>

      {/* แคบ: จุดสีหนึ่งจุดต่อชนิดเอกสาร */}
      <span className="flex h-1.5 items-center gap-0.75 @xl:hidden" aria-hidden>
        {kinds.map((k) => (
          <span key={k.kind} className={`size-1.5 rounded-full ${k.dot} ${dim}`} />
        ))}
      </span>

      {/* กว้าง: ชิปชื่อคนขับ — ไอคอนนำหน้าบอกชนิดเอกสารด้วยรูปร่าง ไม่ต้องพึ่งสีอย่างเดียว */}
      {items.length ? (
        <span className="hidden min-w-0 flex-col gap-0.5 @xl:flex">
          {items.slice(0, MAX_VISIBLE).map((row) => {
            const meta = expiryDocKind(row.kind);
            return (
              <span
                key={`${row.drivercode}-${row.kind}`}
                className={`flex min-w-0 items-center gap-1 rounded-selector px-1.5 py-0.5 text-11-5 leading-snug font-medium ${meta.chip} ${dim}`}
              >
                <meta.icon size={11} strokeWidth={2} aria-hidden className="flex-none" />
                <span className="truncate">{row.name || row.drivercode}</span>
              </span>
            );
          })}
          {items.length > MAX_VISIBLE ? (
            <span className="px-1.5 text-11 leading-snug font-medium text-primary">
              +{items.length - MAX_VISIBLE} เพิ่มเติม
            </span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (!items.length) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onPick(cell.iso)}
      aria-pressed={selected}
      aria-label={`${formatThaiDate(cell.iso, "full")} — ${items.length} ใบ`}
      title={`${formatThaiDate(cell.iso, "full")} · ${items.length} ใบ`}
      className={`${shell} cursor-pointer`}
    >
      {body}
    </button>
  );
}

/* ----------------------------------------------------------- รายการขวา */

/**
 * หนึ่งแถว = **หนึ่งใบ** (ไม่ใช่หนึ่งคน) — รายการจัดกลุ่มตามวันหมดอายุ ใบของคนเดียวกัน
 * ที่หมดคนละวันจึงอยู่คนละกลุ่มตามธรรมชาติ · ทั้งแถวเป็นลิงก์ไปหน้าประวัติ
 */
function Item({ row, index }: { row: DocExpiry; index: number }) {
  const meta = expiryDocKind(row.kind);
  const state = expiryState(row.daysLeft);
  const href = `/recruitment/admin/drivers/${encodeURIComponent(row.drivercode)}`;

  return (
    <li
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
      className="animate-fade-in border-b border-line last:border-b-0"
    >
      <Link
        href={href}
        className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-base-200/50 sm:grid-cols-[auto_minmax(0,1fr)_9rem_auto] sm:px-5"
      >
        {/* ไอคอนชนิดเอกสาร — แยกด้วยรูปร่างก่อน แล้วสีเป็นตัวช่วย */}
        <span
          title={meta.label}
          className={`flex size-8 flex-none items-center justify-center rounded-field ${meta.chip}`}
        >
          <meta.icon size={15} strokeWidth={1.9} aria-hidden />
        </span>

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-13-5 font-medium text-ink">{row.name || row.drivercode}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-11-5 text-mut">
            <span className={`flex-none font-medium ${meta.ink}`}>{meta.label}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tracking-wide">{row.drivercode}</span>
            {row.phone ? (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                <span className="hidden truncate font-mono sm:inline">{primaryPhone(row.phone)}</span>
              </>
            ) : null}
          </span>
        </span>

        <span className="hidden min-w-0 flex-col gap-0.5 text-12 sm:flex">
          <span className="truncate text-ink">{row.siteLabel || "ไม่ระบุสาขา"}</span>
          <span className="truncate font-mono text-11-5 text-mut">{row.plateNo || "—"}</span>
        </span>

        <span className="flex items-center gap-2">
          <StatusPill state={state} text={formatExpiryGap(row.daysLeft)} />
          <ChevronsRight
            size={15}
            strokeWidth={1.8}
            aria-hidden
            className="hidden text-mut/50 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary sm:block"
          />
        </span>
      </Link>
    </li>
  );
}

function StatusPill({ state, text }: { state: ReturnType<typeof expiryState>; text: string }) {
  const tone =
    state === "expired"
      ? "border-alert/30 bg-alert-soft/60 text-alert"
      : state === "soon"
        ? "border-sla/30 bg-sla/8 text-sla"
        : "border-line bg-base-200/60 text-mut";

  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-11-5 font-medium whitespace-nowrap ${tone}`}
    >
      {text}
    </span>
  );
}

/* ----------------------------------------------------------- ชิ้นย่อย */

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-field text-mut transition-colors hover:bg-base-200 hover:text-ink active:bg-base-300"
    >
      {children}
    </button>
  );
}

/** ปุ่มกรองแบบ segmented — แบ่งความกว้างเท่ากันในแถบท้ายการ์ด */
function KindButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-field px-2 text-12 whitespace-nowrap transition-colors ${
        active
          ? "bg-base-100 font-semibold text-ink shadow-[0_0_0_1px_var(--color-line)]"
          : "text-mut hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({
  searching,
  onClearSearch,
}: {
  searching: boolean;
  onClearSearch: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-base-200">
        {searching ? (
          <SearchX size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
        ) : (
          <CalendarDays size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
        )}
      </span>
      <p className="text-13-5 font-semibold">
        {searching ? "ไม่พบรายการที่ตรงกับคำค้น" : "ไม่มีเอกสารหมดอายุในช่วงที่เลือก"}
      </p>
      <p className="max-w-[44ch] text-12-5 leading-[1.7] text-mut text-pretty">
        {searching
          ? "คำค้นหาใช้กับรายการของเดือนที่เปิดอยู่เท่านั้น — ลองล้างคำค้นหรือเลื่อนไปเดือนอื่น"
          : "เลื่อนปฏิทินไปเดือนอื่น หรือกด “ทั้งหมด” เพื่อดูเอกสารทั้งสองชนิด"}
      </p>
      {searching ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="btn-sec cursor-pointer px-3 py-1.5 text-12 text-mut transition-colors hover:border-primary/40 hover:text-ink"
        >
          ล้างคำค้นหา
        </button>
      ) : null}
    </div>
  );
}
