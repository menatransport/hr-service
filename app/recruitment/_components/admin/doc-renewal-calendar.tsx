"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Popover as RPopover } from "radix-ui";
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

import { Nickname } from "@/app/recruitment/_components/admin/nickname";
import { useOverlayCount } from "@/components/ui/field";
import {
  LICENSE_WARN_DAYS,
  THAI_MONTHS_FULL,
  THAI_WEEKDAYS_SHORT,
  expiryDocKind,
  formatLicenseGap,
  formatThaiDate,
  licenseState,
  primaryPhone,
  type DriverListRecord,
  type ExpiryDocKind,
  type LicenseState,
} from "@/app/recruitment/_lib/drivers/types";

/**
 * ปฏิทินเอกสารต้องต่ออายุ — ขึ้น**แทนตาราง**ในหน้าทะเบียนเมื่อกรอง “เอกสารต้องต่ออายุ” (Bew 21 พ.ย. 2569 · แบบ rain)
 *
 * | ส่วน | หน้าที่ |
 * |---|---|
 * | ซ้าย — ปฏิทินเดือน | ใครหมดวันไหน: badge วงไอคอนชนิดเอกสาร + รหัส + ชื่อ · หมดแล้ว = วงทึบแดง ตัวหนา |
 * | ขวา — รายการเดียวต่อเนื่อง | **หมดอายุแล้ว** (ค้างนานสุดก่อน) แล้วต่อด้วย **ใกล้หมด** (ใกล้สุดก่อน) · กดวัน = เหลือวันนั้น |
 *
 * **ไม่มีแท็บ** (Bew ไม่เอาแท็บขีดเส้นใต้/ปุ่มสลับ) — รายการขวาไม่ขึ้นกับเดือนที่เปิด ใบที่หมดมาหลายเดือน
 * จึงไม่หลุดจากสายตา · เดือนเลือกจากเมนูที่ชื่อเดือน · อ่านจาก `drivers` ที่หน้าทะเบียนกรองมาแล้ว
 * และนับเฉพาะใบที่ตรงแท็กใน `tags` (`license:expired` …) ตารางไขว้ด้านบนจึงหุบปฏิทินตามได้
 *
 * แผ่นเดียวตามกติกา design-system — ไม่มีการ์ดซ้อน แบ่งสองฝั่งด้วยเส้นคั่น
 */

const pad = (n: number) => String(n).padStart(2, "0");
const MAX_VISIBLE = 3;
const DAY_MS = 86_400_000;

/** ชนิดเอกสารฝั่งทะเบียน (`license`/`idCard`) ↔ ชนิดของศูนย์เอกสาร — สี/ไอคอนชุดเดียวกับ /recruitment/admin/documents */
const KINDS = [
  { tag: "license", kind: "driver-license" },
  { tag: "idCard", kind: "id-card" },
] as const satisfies readonly { tag: string; kind: ExpiryDocKind }[];

interface Due {
  driver: DriverListRecord;
  kind: ExpiryDocKind;
  iso: string;
  days: number;
  state: LicenseState;
}


/** วันที่ล้วน ๆ บนแกน UTC — บวกลบวันโดยไม่โดนโซนเวลา/เวลาออมแสงของเครื่อง */
const isoToUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const utcToIso = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/**
 * วันนี้ — **ถอยกลับจากตัวเลขที่เซิร์ฟเวอร์คิดมาแล้ว** (`วันหมดอายุ − daysLeft`) ไม่อ่านนาฬิกาเครื่อง
 * ช่อง “วันนี้” จึงตรงกับ “เหลือ N วัน” ในตารางเสมอ แม้นาฬิกาเครื่องผู้ใช้จะเพี้ยน
 */
function todayOf(drivers: DriverListRecord[]): string {
  for (const d of drivers) {
    if (d.licenseExpiryISO && d.licenseDaysLeft !== null) return utcToIso(isoToUtc(d.licenseExpiryISO) - d.licenseDaysLeft * DAY_MS);
    if (d.idCardExpiryISO && d.idCardDaysLeft !== null) return utcToIso(isoToUtc(d.idCardExpiryISO) - d.idCardDaysLeft * DAY_MS);
  }
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

/** 42 ช่อง (6 สัปดาห์) เสมอ — ความสูงไม่กระโดดตอนเปลี่ยนเดือน */
function buildCells(year: number, month: number) {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => {
    const t = Date.UTC(year, month - 1, 1 - lead + i);
    const d = new Date(t);
    return { iso: utcToIso(t), dayNo: d.getUTCDate(), inMonth: d.getUTCMonth() === month - 1 };
  });
}

const weekdayOf = (iso: string) => THAI_WEEKDAYS_SHORT[new Date(isoToUtc(iso)).getUTCDay()];
const monthKey = (year: number, month: number) => `${year}-${pad(month)}`;

export function DocRenewalCalendar({ drivers, tags }: { drivers: DriverListRecord[]; tags: readonly string[] }) {
  const todayISO = useMemo(() => todayOf(drivers), [drivers]);
  const windowEndISO = useMemo(() => utcToIso(isoToUtc(todayISO) + LICENSE_WARN_DAYS * DAY_MS), [todayISO]);

  /** หนึ่งรายการ = หนึ่งใบ เรียงตามวันหมดอายุ */
  const dues = useMemo(() => {
    const out: Due[] = [];
    for (const driver of drivers) {
      for (const { tag, kind } of KINDS) {
        const days = tag === "license" ? driver.licenseDaysLeft : driver.idCardDaysLeft;
        const iso = tag === "license" ? driver.licenseExpiryISO : driver.idCardExpiryISO;
        const state = licenseState(days);
        if (days === null || !iso || !tags.includes(`${tag}:${state}`)) continue;
        out.push({ driver, kind, iso, days, state });
      }
    }
    return out.sort((a, b) => a.iso.localeCompare(b.iso) || a.driver.name.localeCompare(b.driver.name, "th"));
  }, [drivers, tags]);

  const [year, setYear] = useState(() => +todayISO.slice(0, 4));
  const [month, setMonth] = useState(() => +todayISO.slice(5, 7));
  const [day, setDay] = useState("");

  const prefix = monthKey(year, month);
  const byDay = useMemo(() => {
    const map = new Map<string, Due[]>();
    for (const due of dues) {
      if (!due.iso.startsWith(prefix)) continue;
      const list = map.get(due.iso);
      if (list) list.push(due);
      else map.set(due.iso, [due]);
    }
    return map;
  }, [dues, prefix]);

  /** เมนูเดือน — ทุกเดือนที่มีใบต้องตาม + เดือนนี้ถึงสิ้นช่วงเตือน · เดือนเก่าสุดขึ้นก่อน */
  const months = useMemo(() => {
    const map = new Map<string, number>();
    for (let t = isoToUtc(todayISO.slice(0, 8) + "01"); utcToIso(t) <= windowEndISO; ) {
      map.set(utcToIso(t).slice(0, 7), 0);
      const d = new Date(t);
      t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    for (const due of dues) map.set(due.iso.slice(0, 7), (map.get(due.iso.slice(0, 7)) ?? 0) + 1);
    return [...map].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dues, todayISO, windowEndISO]);

  /** รายการขวา — สองกลุ่มต่อกัน ไม่มีแท็บ · เลือกวัน = เหลือเฉพาะวันนั้น */
  const groups = useMemo(() => {
    if (day) return [{ key: "day", title: `${weekdayOf(day)}. ${formatThaiDate(day, "full")}`, tone: "text-ink", items: byDay.get(day) ?? [] }];
    return [
      {
        key: "expired",
        title: "หมดอายุแล้ว",
        tone: "text-alert",
        items: dues.filter((d) => d.state === "expired").sort((a, b) => a.days - b.days),
      },
      { key: "soon", title: `ใกล้หมด ภายใน ${LICENSE_WARN_DAYS} วัน`, tone: "text-sla", items: dues.filter((d) => d.state === "soon") },
    ].filter((g) => g.items.length);
  }, [day, byDay, dues]);

  const cells = useMemo(() => buildCells(year, month), [year, month]);
  const thisMonth = prefix === todayISO.slice(0, 7);
  const monthLabel = `${THAI_MONTHS_FULL[month - 1]} ${year + 543}`;

  function jump(key: string) {
    setYear(+key.slice(0, 4));
    setMonth(+key.slice(5, 7));
    setDay("");
  }
  function step(by: number) {
    const d = new Date(Date.UTC(year, month - 1 + by, 1));
    jump(monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }

  let row = 0;

  return (
    <div className="grid items-start border-t border-line lg:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)]">
      {/* ══════════ ซ้าย — ปฏิทิน ══════════ */}
      <section aria-label="ปฏิทินวันหมดอายุ" className="@container flex min-w-0 flex-col lg:sticky lg:top-0">
        <div className="flex items-center gap-1 px-(--sheet-px) py-2.5">
          <Step label="เดือนก่อนหน้า" onClick={() => step(-1)}>
            <ChevronLeft size={16} strokeWidth={1.8} aria-hidden />
          </Step>
          <MonthMenu label={monthLabel} months={months} current={prefix} onPick={jump} />
          <Step label="เดือนถัดไป" onClick={() => step(1)}>
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
          </Step>
          {thisMonth ? null : (
            <button
              type="button"
              onClick={() => jump(todayISO.slice(0, 7))}
              className="ml-2 cursor-pointer text-12-5 text-primary hover:underline"
            >
              กลับเดือนนี้
            </button>
          )}
        </div>

        <div className="border-t border-line">
          <div className="grid grid-cols-7 border-b border-line">
            {THAI_WEEKDAYS_SHORT.map((label) => (
              <span key={label} className="py-2 text-center text-11-5 font-medium text-mut">
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
            {cells.map((cell) => (
              <DayCell
                key={cell.iso}
                iso={cell.iso}
                dayNo={cell.dayNo}
                inMonth={cell.inMonth}
                items={cell.inMonth ? (byDay.get(cell.iso) ?? []) : []}
                today={cell.iso === todayISO}
                windowEnd={cell.iso === windowEndISO}
                selected={cell.iso === day}
                onPick={(iso) => setDay((prev) => (prev === iso ? "" : iso))}
              />
            ))}
          </div>
        </div>

        {/* คำอธิบายสัญลักษณ์ — ใช้ badge ตัวเดียวกับในช่องวัน */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-(--sheet-px) py-2.5 text-11-5 text-mut">
          {KINDS.map(({ kind }) => (
            <span key={kind} className="flex items-center gap-1.5">
              <KindBadge kind={kind} expired={false} />
              {expiryDocKind(kind).label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <KindBadge kind="driver-license" expired />
            หมดอายุแล้ว (วงทึบ)
          </span>
          <span>ช่วงเตือน {LICENSE_WARN_DAYS} วัน ถึง {formatThaiDate(windowEndISO)}</span>
        </div>
      </section>

      {/* ══════════ ขวา — รายการเดียวต่อเนื่อง ══════════ */}
      <section
        aria-label="รายการเอกสารต้องต่ออายุ"
        className="flex min-w-0 flex-col border-t border-line lg:border-t-0 lg:border-l"
      >
        {day ? (
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <span className="text-12-5 text-mut">เฉพาะวันที่เลือกในปฏิทิน</span>
            <button
              type="button"
              onClick={() => setDay("")}
              className="flex cursor-pointer items-center gap-1 text-12-5 text-primary hover:underline"
            >
              <X size={13} strokeWidth={2} aria-hidden />
              ดูทั้งหมด
            </button>
          </div>
        ) : null}

        {groups.length ? (
          <div key={`${day}-${dues.length}`} className="lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.title}>
                <h3 className="sticky top-0 z-1 flex items-baseline justify-between gap-2 border-b border-line bg-base-100 px-4 pt-3 pb-2">
                  <span className={`text-12-5 font-semibold ${g.tone}`}>{g.title}</span>
                  <span className="font-mono text-11-5 text-mut tabular-nums">{g.items.length} ใบ</span>
                </h3>
                <ul className="divide-y divide-line border-b border-line">
                  {g.items.map((due) => (
                    <li key={`${due.driver.drivercode}-${due.kind}`}>
                      <DueRow due={due} index={row++} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 px-5 py-14 text-center">
            <CalendarCheck2 size={20} strokeWidth={1.6} aria-hidden className="text-mut" />
            <p className="text-13 font-medium">ไม่มีเอกสารต้องต่อในช่วงนี้</p>
          </div>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------- badge ชนิดเอกสาร */

/**
 * วงไอคอนชนิดเอกสาร — รูปไอคอนบอกชนิด (รถ/บัตร) · **ทึบแดง = หมดแล้ว, จาง = ใกล้หมด**
 * แยกสถานะด้วยความทึบ ไม่ใช่ด้วยสีอย่างเดียว (แบบ rain 21 พ.ย. 2569)
 */
function KindBadge({ kind, expired }: { kind: ExpiryDocKind; expired: boolean }) {
  const meta = expiryDocKind(kind);
  return (
    <span
      aria-hidden
      className={`flex size-4 flex-none items-center justify-center rounded-full ${expired ? "bg-alert text-ink-content" : meta.chip}`}
    >
      <meta.icon size={10} strokeWidth={2.3} />
    </span>
  );
}

/* ------------------------------------------------------------- ช่องวัน */

/** หนึ่งวัน — เส้นคั่นบาง ไม่มีพื้นสี · badge: วงไอคอน → รหัส (ไม่ตัด) → ชื่อ (ตัดได้) · ช่องว่างกดไม่ได้ */
function DayCell({
  iso,
  dayNo,
  inMonth,
  items,
  today,
  windowEnd,
  selected,
  onPick,
}: {
  iso: string;
  dayNo: number;
  inMonth: boolean;
  items: Due[];
  today: boolean;
  windowEnd: boolean;
  selected: boolean;
  onPick: (iso: string) => void;
}) {
  const kinds = KINDS.filter(({ kind }) => items.some((d) => d.kind === kind)).map(({ kind }) => expiryDocKind(kind));

  const shell = `relative flex h-12 min-w-0 flex-col items-center justify-center gap-1 border-r border-b border-line text-left transition-shadow @2xl:h-auto @2xl:min-h-[5.75rem] @2xl:items-stretch @2xl:justify-start @2xl:p-2 ${
    selected ? "shadow-[inset_0_0_0_1.5px_var(--color-primary)]" : ""
  }`;

  const body = (
    <>
      <span className="flex items-center justify-between gap-1">
        <span
          className={`flex size-6 flex-none items-center justify-center rounded-full text-12-5 leading-none tabular-nums ${
            today
              ? "bg-primary font-semibold text-primary-content"
              : !inMonth
                ? "text-mut/35"
                : items.length
                  ? "font-semibold text-ink"
                  : "text-mut"
          }`}
        >
          {dayNo}
        </span>
        {windowEnd && inMonth ? <span className="hidden truncate text-10-5 text-mut @2xl:inline">สิ้นช่วงเตือน</span> : null}
      </span>

      {/* ปฏิทินแคบ: จุดสีต่อชนิดเอกสาร */}
      <span className="flex h-1.5 items-center gap-0.75 @2xl:hidden" aria-hidden>
        {kinds.map((k) => (
          <span key={k.kind} className={`size-1.5 rounded-full ${k.dot}`} />
        ))}
      </span>

      {items.length ? (
        <span className="hidden min-w-0 flex-col gap-1 @2xl:flex">
          {items.slice(0, MAX_VISIBLE).map((due) => {
            const expired = due.state === "expired";
            return (
              <span key={`${due.driver.drivercode}-${due.kind}`} className="flex min-w-0 items-center gap-1.5 leading-snug">
                <KindBadge kind={due.kind} expired={expired} />
                <span
                  className={`flex-none font-mono text-11 tabular-nums ${expired ? "font-semibold text-alert" : "text-mut"}`}
                >
                  {due.driver.drivercode}
                </span>
                <span className={`truncate text-11-5 ${expired ? "font-semibold text-alert" : "text-ink"}`}>
                  {due.driver.nickname || due.driver.name}
                </span>
              </span>
            );
          })}
          {items.length > MAX_VISIBLE ? (
            <span className="pl-5.5 text-11 text-mut">+{items.length - MAX_VISIBLE} คน</span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (!items.length) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onPick(iso)}
      aria-pressed={selected}
      aria-label={`${formatThaiDate(iso, "full")} — ${items.length} ใบ`}
      title={items.map((d) => `${expiryDocKind(d.kind).short}: ${d.driver.drivercode} ${d.driver.name}`).join("\n")}
      className={`${shell} cursor-pointer hover:shadow-[inset_0_0_0_1px_var(--color-line-strong)]`}
    >
      {body}
    </button>
  );
}

/* ----------------------------------------------------------- แถวรายการ */

function DueRow({ due, index }: { due: Due; index: number }) {
  const meta = expiryDocKind(due.kind);
  const { driver } = due;
  const phone = primaryPhone(driver.phone);
  const expired = due.state === "expired";

  return (
    <Link
      href={`/recruitment/admin/drivers/${encodeURIComponent(driver.drivercode)}?tab=docs`}
      style={{ animationDelay: `${Math.min(index, 12) * 20}ms` }}
      className="grid animate-fade-in grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-base-200/45"
    >
      <KindBadge kind={due.kind} expired={expired} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-13 font-medium text-ink">
          <span className="mr-1.5 font-mono text-12 text-mut tabular-nums">{driver.drivercode}</span>
          {driver.name} <Nickname value={driver.nickname} />
        </span>
        <span className="truncate text-11-5 text-mut">
          {meta.label}
          {phone ? <span className="font-mono"> · {phone}</span> : null}
        </span>
      </span>
      <span className="flex flex-col items-end gap-0.5 text-right">
        <span className={`text-12 font-medium whitespace-nowrap ${expired ? "text-alert" : "text-sla"}`}>
          {formatLicenseGap(due.days).replace("หมดอายุแล้ว", "หมดแล้ว")}
        </span>
        <span className="font-mono text-11 whitespace-nowrap text-mut tabular-nums">{formatThaiDate(due.iso)}</span>
      </span>
    </Link>
  );
}

/* ----------------------------------------------------------- ชิ้นย่อย */

function Step({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-7 cursor-pointer items-center justify-center rounded-field border border-line text-mut transition-colors hover:border-line-strong hover:text-ink"
    >
      {children}
    </button>
  );
}

/** ชื่อเดือน = ปุ่มเปิดเมนูเดือน (แทนแถบทางลัดขีดเส้นใต้) · ตัวเลข = จำนวนใบของเดือนนั้น */
function MonthMenu({
  label,
  months,
  current,
  onPick,
}: {
  label: string;
  months: [string, number][];
  current: string;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useOverlayCount(open);

  return (
    <RPopover.Root open={open} onOpenChange={setOpen}>
      <RPopover.Trigger asChild>
        <button
          type="button"
          aria-label={`เลือกเดือน (ตอนนี้ ${label})`}
          className="flex min-w-40 cursor-pointer items-center justify-center gap-1 rounded-field px-2.5 py-1 text-15 font-semibold tabular-nums transition-colors hover:bg-base-200/60"
        >
          {label}
          <ChevronDown size={14} strokeWidth={2} aria-hidden className="text-mut" />
        </button>
      </RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          data-hrs-dropdown=""
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-60 flex max-h-[min(360px,var(--radix-popover-content-available-height))] w-60 flex-col overflow-y-auto rounded-box border border-line bg-base-100 p-1 text-ink shadow-[0_18px_44px_-18px_rgba(21,32,29,0.38)] max-sm:w-full"
        >
          <p className="px-2.5 pt-1.5 pb-1 text-11-5 text-mut">เดือนที่มีเอกสารต้องต่ออายุ</p>
          {months.map(([key, n]) => {
            const on = key === current;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onPick(key);
                  setOpen(false);
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-field px-2.5 py-2 text-13 ${
                  on ? "bg-soft font-semibold text-primary" : "hover:bg-base-200/50"
                }`}
              >
                {THAI_MONTHS_FULL[+key.slice(5, 7) - 1]} {+key.slice(0, 4) + 543}
                <span className="flex items-center gap-1.5">
                  <span className={`font-mono text-11-5 tabular-nums ${n ? "text-ink" : "text-mut/50"}`}>{n} ใบ</span>
                  <Check size={14} strokeWidth={2.2} aria-hidden className={on ? "text-primary" : "invisible"} />
                </span>
              </button>
            );
          })}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}
