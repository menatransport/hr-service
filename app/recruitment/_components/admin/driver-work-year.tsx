"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Flag } from "lucide-react";

import {
  THAI_MONTHS_SHORT,
  THAI_WEEKDAYS_SHORT,
  formatTenure,
  formatThaiDate,
  workStatusFullLabel,
  workStatusTone,
  type DriverRecord,
  type DriverWorkStatus,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ปฏิทินการทำงานทั้งปีของ พจส. หนึ่งคน
 *
 * โครงสามชั้นจากหยาบไปละเอียด ซึ่งเป็นลำดับที่คนเปิดหน้านี้ถามจริง ๆ:
 *
 * 1. **แถบบนสุด** — วันเริ่มงาน อายุงาน วันทำงานล่าสุด · วันเริ่มงานอยู่ซ้ายสุด
 *    เพราะทุกอย่างในปฏิทินอ่านเทียบกับมัน (เดือนก่อนหน้านั้นไม่ใช่ “ขาดงาน”
 *    แต่คือ “ยังไม่ได้เริ่ม” ซึ่งคนละเรื่องกันคนละขั้ว)
 * 2. **สิบสองเดือนของปีที่เลือก** — การ์ดเล็กพร้อมแถบสัดส่วน กวาดตารอบเดียว
 *    เห็นทั้งปีว่าเดือนไหนหาย · **ไม่กางปฏิทินรายวันทั้งสิบสองเดือนพร้อมกัน**
 *    เพราะ 365 ช่องบนหน้าเดียวไม่มีใครอ่าน และต้องย่อจนอ่านรหัสไม่ออก
 * 3. **กดเดือนไหน ปฏิทินรายวันของเดือนนั้นกางอยู่ข้างล่าง** — ที่ว่างเต็มความกว้าง
 *    ช่องจึงใหญ่พอใส่ทั้งวันที่และรหัสสถานะ อ่านได้จริงแบบปฏิทินกระดาษ
 *
 * ข้อมูลทั้งปีถูกส่งมาจากเซิร์ฟเวอร์ครบตั้งแต่แรก การกดสลับเดือน/ปีจึงไม่ยิง API
 * (ต่างจากระบบเดิมที่โหลดใหม่ทีละเดือน แล้วมีสถานะ “กำลังโหลด” คั่นทุกครั้งที่กด)
 */

/**
 * สีของแต่ละกลุ่มสถานะ — **สลับคู่ token ของชิปในตาราง** ให้พื้นเป็นสีเข้ม
 *
 * ชิปในตารางใช้พื้นอ่อน–ตัวหนังสือเข้ม (`bg-st-live text-st-live-ink`) ซึ่งพอดี
 * กับการอยู่ปนข้อความในแถว · แต่ในปฏิทินมี 30 ช่องเรียงติดกันและต้องอ่าน
 * **รูปแบบของทั้งเดือน** จากระยะห่างหนึ่งช่วงแขน สีอ่อนจึงจางหายไปกับพื้น
 * ที่นี่เลยกลับด้าน: พื้นเข้ม–ตัวหนังสืออ่อน · **ยังเป็นสีเดียวกันคนละน้ำหนัก**
 * ไม่ใช่สีใหม่ คนที่จำสีจากตารางมาแล้วจึงอ่านต่อได้ทันที
 *
 * การสลับคู่ทำให้ **ธีมมืดถูกต้องเองโดยไม่ต้องเขียนเพิ่ม** — ธีมสว่างได้พื้น
 * เขียวเข้มบนตัวหนังสือซีด ธีมมืดได้พื้นเขียวสว่างบนตัวหนังสือเข้ม ทั้งคู่คอนทราสต์ผ่าน
 */
const TONE_BG = {
  work: "bg-st-live-ink text-st-live",
  leave: "bg-st-wait-ink text-st-wait",
  /* พ้นสภาพ (`ลอ` `ปอ`) — แดงชุดเดียวกับที่ทั้งระบบใช้กับการพ้นสภาพ
     `ink-content` พลิกเป็นสีเข้มในธีมมืดพอดีกับ `alert` ที่สว่างขึ้น */
  exit: "bg-alert text-ink-content",
  other: "bg-st-new-ink text-st-new",
};

const TONE_BAR = {
  work: "bg-st-live-ink",
  leave: "bg-st-wait-ink",
  exit: "bg-alert",
  other: "bg-st-new-ink",
};

const TONE_LABEL = {
  work: "ทำงาน",
  leave: "ลา",
  exit: "พ้นสภาพ",
  other: "ไม่ได้งาน / อื่น ๆ",
};

type Tone = keyof typeof TONE_BG;

interface MonthSummary {
  month: number;
  work: number;
  leave: number;
  exit: number;
  other: number;
  recorded: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function DriverWorkYear({
  driver,
  work,
}: {
  driver: DriverRecord;
  work: DriverWorkStatus;
}) {
  const startYear = driver.startDateISO ? Number(driver.startDateISO.slice(0, 4)) : null;

  /** ปีที่มีข้อมูลจริง เรียงจากใหม่ไปเก่า — ถ้าไม่มีเลยก็ยังให้ดูปีที่เริ่มงานได้ */
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const iso of Object.keys(work.days)) set.add(Number(iso.slice(0, 4)));
    for (const m of work.months) set.add(m.year);
    if (startYear) set.add(startYear);
    return [...set].filter(Number.isFinite).sort((a, b) => b - a);
  }, [work, startYear]);

  const [year, setYear] = useState(() => {
    const latest = work.latestWorkDateISO ? Number(work.latestWorkDateISO.slice(0, 4)) : null;
    if (latest && years.includes(latest)) return latest;
    return years[0] ?? startYear ?? new Date().getFullYear();
  });

  /** สรุปรายเดือนของปีที่เลือก — คิดจากสถานะรายวันถ้ามี ไม่งั้นใช้ยอดรวมที่ต้นทางส่งมา */
  const summaries = useMemo<MonthSummary[]>(() => {
    const rows: MonthSummary[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      work: 0,
      leave: 0,
      exit: 0,
      other: 0,
      recorded: 0,
    }));

    if (Object.keys(work.days).length) {
      for (const [iso, code] of Object.entries(work.days)) {
        if (Number(iso.slice(0, 4)) !== year) continue;
        const row = rows[Number(iso.slice(5, 7)) - 1];
        if (!row) continue;
        row[workStatusTone(code)] += 1;
        row.recorded += 1;
      }
    } else {
      for (const m of work.months) {
        if (m.year !== year) continue;
        const row = rows[m.month - 1];
        if (!row) continue;
        row.work = m.days;
        row.recorded = m.days;
      }
    }

    return rows;
  }, [work, year]);

  const [openMonth, setOpenMonth] = useState<number | null>(() => {
    const latest = work.latestWorkDateISO;
    if (latest && Number(latest.slice(0, 4)) === year) return Number(latest.slice(5, 7));
    return null;
  });

  const yearTotals = summaries.reduce(
    (acc, row) => ({
      work: acc.work + row.work,
      leave: acc.leave + row.leave,
      exit: acc.exit + row.exit,
      other: acc.other + row.other,
    }),
    { work: 0, leave: 0, exit: 0, other: 0 },
  );

  const hasDaily = Object.keys(work.days).length > 0;
  const index = years.indexOf(year);

  function goYear(step: number) {
    const next = years[index + step];
    if (next === undefined) return;
    setYear(next);
    setOpenMonth(null);
  }

  return (
    <section className="flex flex-col gap-4 rounded-box border border-line bg-base-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={16} strokeWidth={1.8} aria-hidden className="text-primary" />
          <h2 className="text-14 font-semibold">ปฏิทินการทำงาน</h2>
          <span
            title="คอลเลกชันต้นทางของข้อมูลในกล่องนี้"
            className="rounded-full border border-line px-2 py-0.5 font-mono text-10-5 text-mut"
          >
            employee_work_status
          </span>
        </div>

        <div className="flex items-center gap-1">
          <YearStep
            label="ปีก่อนหน้า"
            disabled={index < 0 || index >= years.length - 1}
            onClick={() => goYear(1)}
          >
            <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
          </YearStep>
          <span className="min-w-20 text-center font-mono text-14 font-semibold tabular-nums">
            {year + 543}
          </span>
          <YearStep label="ปีถัดไป" disabled={index <= 0} onClick={() => goYear(-1)}>
            <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
          </YearStep>
        </div>
      </div>

      {/* ── แถบข้อเท็จจริงที่ต้องอ่านก่อนดูปฏิทิน ── */}
      <dl className="grid gap-3 rounded-field bg-base-200 p-3.5 sm:grid-cols-3">
        <Fact
          icon={Flag}
          label="วันเริ่มงาน"
          value={formatThaiDate(driver.startDateISO, "full") || "ไม่มีข้อมูล"}
          note={
            driver.tenureMonths !== null
              ? `อายุงาน ${formatTenure(driver.tenureMonths, driver.tenureDays)}`
              : undefined
          }
          strong
        />
        <Fact
          icon={CalendarDays}
          label="วันทำงานล่าสุด"
          value={formatThaiDate(work.latestWorkDateISO, "full") || "ไม่มีข้อมูล"}
          note={
            work.latestStatus
              ? `${work.latestStatus} — ${workStatusFullLabel(work.latestStatus)}`
              : undefined
          }
        />
        <Fact
          icon={CalendarDays}
          label={`สรุปปี ${year + 543}`}
          value={`ทำงาน ${yearTotals.work.toLocaleString("th-TH")} วัน`}
          note={
            hasDaily
              ? /* วันพ้นสภาพขึ้นเฉพาะตอนมีจริง — ปีที่ไม่มีไม่ต้องอ่านว่า “พ้นสภาพ 0 วัน” */
                [
                  `ลา ${yearTotals.leave} วัน`,
                  `ไม่ได้งาน ${yearTotals.other} วัน`,
                  ...(yearTotals.exit ? [`พ้นสภาพ ${yearTotals.exit} วัน`] : []),
                ].join(" · ")
              : "ต้นทางส่งมาเป็นยอดรวมรายเดือน"
          }
        />
      </dl>

      {/* ── สิบสองเดือน ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {summaries.map((row) => (
          <MonthCard
            key={row.month}
            year={year}
            summary={row}
            startDateISO={driver.startDateISO}
            open={openMonth === row.month}
            clickable={hasDaily}
            onClick={() => setOpenMonth((prev) => (prev === row.month ? null : row.month))}
          />
        ))}
      </div>

      {/* ── รายวันของเดือนที่กด ── */}
      {!hasDaily ? (
        <p className="rounded-field border border-dashed border-line px-4 py-3 text-12-5 text-mut text-pretty">
          ระบบต้นทางส่งมาเฉพาะยอดรวมรายเดือน ยังไม่มีสถานะรายวันให้กางเป็นปฏิทิน —
          ตัวเลขบนการ์ดแต่ละเดือนคือจำนวนวันที่ทำงาน
        </p>
      ) : openMonth ? (
        <MonthDetail
          year={year}
          month={openMonth}
          days={work.days}
          summary={summaries[openMonth - 1]}
          startDateISO={driver.startDateISO}
        />
      ) : (
        <p className="rounded-field border border-dashed border-line px-4 py-3 text-center text-12-5 text-mut">
          กดที่เดือนไหนก็ได้ด้านบน เพื่อกางปฏิทินรายวันของเดือนนั้น
        </p>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- เดือน */

function MonthCard({
  year,
  summary,
  startDateISO,
  open,
  clickable,
  onClick,
}: {
  year: number;
  summary: MonthSummary;
  startDateISO: string;
  open: boolean;
  clickable: boolean;
  onClick: () => void;
}) {
  const monthKey = `${year}-${pad(summary.month)}`;
  // เดือนที่จบไปก่อนวันเริ่มงาน ไม่ใช่ “ไม่มาทำงาน” แต่คือยังไม่ได้เป็นพนักงาน
  const beforeStart = Boolean(startDateISO) && monthKey < startDateISO.slice(0, 7);
  const total = summary.work + summary.leave + summary.other;

  const body = (
    <>
      <span className="flex items-baseline justify-between gap-1">
        <span className={`text-13 font-semibold ${open ? "text-primary" : ""}`}>
          {THAI_MONTHS_SHORT[summary.month - 1]}
        </span>
        {beforeStart ? null : (
          <span className="font-mono text-13-5 font-bold tabular-nums">
            {summary.work || "—"}
          </span>
        )}
      </span>

      {beforeStart ? (
        <span className="text-11 text-mut">ก่อนเริ่มงาน</span>
      ) : (
        <>
          <span aria-hidden className="flex h-2 overflow-hidden rounded-full bg-base-200">
            {(["work", "leave", "exit", "other"] as Tone[]).map((tone) =>
              summary[tone] ? (
                <span
                  key={tone}
                  className={TONE_BAR[tone]}
                  style={{ width: `${(summary[tone] / (total || 1)) * 100}%` }}
                />
              ) : null,
            )}
          </span>
          <span className="text-11 text-mut">
            {total ? `บันทึก ${total} วัน` : "ไม่มีบันทึก"}
          </span>
        </>
      )}
    </>
  );

  const shell = `flex flex-col gap-1.5 rounded-field border p-2.5 text-left transition-colors ${
    beforeStart ? "border-dashed border-line bg-base-200/40" : ""
  }`;

  if (!clickable || beforeStart) {
    return <div className={`${shell} ${beforeStart ? "" : "border-line"}`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title={`ดูปฏิทินรายวันของ ${THAI_MONTHS_SHORT[summary.month - 1]} ${year + 543}`}
      className={`${shell} cursor-pointer ${
        open
          ? "border-primary bg-soft/60"
          : "border-line hover:border-primary/40 hover:bg-base-200/60"
      }`}
    >
      {body}
    </button>
  );
}

function MonthDetail({
  year,
  month,
  days,
  summary,
  startDateISO,
}: {
  year: number;
  month: number;
  days: Record<string, string>;
  summary: MonthSummary;
  startDateISO: string;
}) {
  /** ช่องว่างหน้าวันที่ 1 ให้ตรงคอลัมน์วัน แล้วต่อด้วยวันจริงจนจบเดือน */
  const cells = useMemo(() => {
    const lead = new Date(year, month - 1, 1).getDay();
    const total = new Date(year, month, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: total }, (_, i) => i + 1),
    ];
  }, [year, month]);

  return (
    /*
      **ไม่มีกรอบการ์ดครอบ** — ปฏิทินอยู่ในกล่อง “ปฏิทินการทำงาน” อยู่แล้ว
      การใส่กรอบอีกชั้นคือกรอบซ้อนกรอบที่ไม่ได้แบ่งอะไรเพิ่ม มีแต่บีบช่องวันให้เล็กลง
      ใช้เส้นคั่นบนบาง ๆ บอกว่าเป็นคนละส่วนกับการ์ดเดือนก็พอ
    */
    <div className="flex animate-fade-in flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <h3 className="text-15 font-semibold">
          {THAI_MONTHS_SHORT[month - 1]} {year + 543}
        </h3>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12-5">
          {(["work", "leave", "exit", "other"] as Tone[]).map((tone) => (
            <span key={tone} className="flex items-center gap-1.5">
              <span aria-hidden className={`size-2.5 rounded-full ${TONE_BAR[tone]}`} />
              <span className="text-mut">{TONE_LABEL[tone]}</span>
              <span className="font-semibold tabular-nums">{summary[tone]}</span>
              <span className="text-mut">วัน</span>
            </span>
          ))}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {THAI_WEEKDAYS_SHORT.map((label) => (
          <span key={label} className="pb-0.5 text-center text-12 font-semibold text-mut">
            {label}
          </span>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <span key={`lead-${i}`} aria-hidden />;

          const iso = `${year}-${pad(month)}-${pad(day)}`;
          const code = days[iso];
          const isStart = iso === startDateISO;
          const beforeStart = Boolean(startDateISO) && iso < startDateISO;

          return (
            <span
              key={iso}
              title={
                isStart
                  ? `${formatThaiDate(iso, "full")} — วันเริ่มงาน`
                  : code
                    ? `${formatThaiDate(iso, "full")} — ${code} ${workStatusFullLabel(code)}`
                    : beforeStart
                      ? `${formatThaiDate(iso, "full")} — ยังไม่ได้เริ่มงาน`
                      : `${formatThaiDate(iso, "full")} — ไม่มีบันทึก`
              }
              /*
                ช่องที่มีสถานะถูก **ถมสีทั้งช่อง** ไม่ใช่มีชิปเล็ก ๆ อยู่ข้างใน —
                กวาดตาทั้งเดือนแล้วเห็นรูปแบบทันทีว่าช่วงไหนหายไป · ช่องที่ไม่มีบันทึก
                เป็นพื้นเทาเรียบ และวันก่อนเริ่มงานเป็นเส้นประโปร่ง ไล่ความเข้มลงมา
                สามระดับตามความสำคัญ
              */
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-field px-1 py-1.5 ${
                code
                  ? TONE_BG[workStatusTone(code)]
                  : beforeStart
                    ? "border border-dashed border-line"
                    : "bg-base-200"
              } ${isStart ? "ring-2 ring-primary ring-offset-1 ring-offset-base-100" : ""}`}
            >
              <span
                className={`text-12 leading-none font-semibold tabular-nums ${
                  code ? "opacity-75" : isStart ? "text-primary" : "text-mut"
                }`}
              >
                {day}
              </span>

              {code ? (
                <span className="font-mono text-15 leading-none font-bold">{code}</span>
              ) : isStart ? (
                <span className="text-11 leading-none font-semibold text-primary">เริ่มงาน</span>
              ) : (
                <span aria-hidden className="min-h-4" />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ ชิ้นย่อย */

function Fact({
  icon: Icon,
  label,
  value,
  note,
  strong,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon
        size={15}
        strokeWidth={1.7}
        aria-hidden
        className={`mt-0.5 flex-none ${strong ? "text-primary" : "text-mut"}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-11-5 text-mut">{label}</dt>
        <dd className="m-0 flex flex-col gap-0.5">
          <span className={`text-13 ${strong ? "font-semibold" : ""}`}>{value}</span>
          {note ? <span className="text-11-5 text-mut text-pretty">{note}</span> : null}
        </dd>
      </div>
    </div>
  );
}

function YearStep({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 cursor-pointer items-center justify-center rounded-selector border border-line bg-base-100 text-mut transition-colors hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
