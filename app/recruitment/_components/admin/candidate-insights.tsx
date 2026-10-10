"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  TriangleAlert,
} from "lucide-react";

import type { SortDir } from "@/components/ui/column-menu";
import { SummaryPanel, SummaryStat, SummaryStats } from "@/components/ui/summary-panel";
import { thaiDate } from "@/app/recruitment/_lib/form";
import {
  EXIT_REASONS,
  isHiredStatus,
  STATUS_LABEL,
  type ApplicationStatus,
  type ApplicationSummary,
} from "@/app/recruitment/_lib/types";

/**
 * แถบสรุปเหนือตารางผู้สมัคร — **หนึ่งบรรทัด แล้วหลีกทางให้ตาราง**
 *
 * (23 ก.ย. 2026) ย้ายมาใช้การ์ดกลาง `components/ui/summary-panel.tsx` แบบ `compact`
 * ให้หน้าตาเดียวกับทะเบียน พจส. และหน้าเหตุผลการลาออก — สูงขึ้นเป็นสองชั้น (ตัวเลข ·
 * แถบเครื่องมือ) แต่ยังเตี้ยพอที่ตารางได้พื้นที่ส่วนใหญ่ของจอ
 *
 * ตารางคือพระเอกของหน้านี้ ทุกพิกเซลเหนือมันคือพิกเซลที่ตารางไม่ได้ใช้ · แถบนี้จึง
 * ถูกบีบเหลือ **บรรทัดเดียวสูงราว 36px** ที่รวมของเดิมสามแถวเข้าด้วยกัน: ตัวเลขสรุป
 * ตามสถานะ · ปุ่มกรองสถานะ · ยอดที่เหลือหลังกรองกับปุ่มล้างตัวกรอง — เดิมสามอย่างนี้
 * อยู่คนละแถวและกินความสูงรวมเกือบ 400px ทั้งที่อ่านจบใน 2 วินาที
 *
 * ของที่ **ต้องใช้พื้นที่จริง ๆ** (ปฏิทินนัดสัมภาษณ์ · กราฟใบเข้าใหม่ · เหตุผลที่ยกเลิก)
 * ย้ายไปอยู่ในแผงที่**พับไว้ตั้งแต่เปิดหน้า** กดปุ่ม “ปฏิทิน” ที่ปลายแถบถึงจะกางลงมา ·
 * เกณฑ์ที่ใช้ตัดสินว่าอะไรอยู่บรรทัดบนกับอะไรอยู่ในแผง: *ต้องเห็นทุกครั้งที่เปิดหน้า
 * หรือเปิดดูเป็นรอบ ๆ* — ยอดค้างรายสถานะคืออย่างแรก ปฏิทินทั้งเดือนคืออย่างหลัง
 *
 * กติกาเดิมยังอยู่ครบ: **ทุกชิ้นที่วาดต้องกดแล้วกรองตารางได้จริง** ไม่มีตัวเลขที่มีไว้ดู
 * เฉย ๆ · และตัวเลขทุกตัวนับจาก **ชุดที่โหลดมาแล้ว** (≤ `LIST_LIMIT` = 500 ใบล่าสุด)
 * ไม่ได้ถามฐานข้อมูลใหม่ — ทะลุเพดานเมื่อไหร่ต้องย้ายไปรวมยอดฝั่งเซิร์ฟเวอร์
 */

/**
 * การเรียงของตารางผู้สมัคร — **นิยามอยู่ที่นี่ ไม่ใช่ที่ `candidates-view.tsx`**
 * เพราะแถบสรุปเป็นฝ่ายสั่งเรียง (ปุ่ม “นัดวันนี้” เรียงตามวันนัดให้เอง) และ
 * `candidates-view` เป็นฝ่ายนำเข้าไฟล์นี้อยู่แล้ว วางไว้ทางนี้จึงไม่ต้องอ้างวน
 *
 * `column` เป็น `string` ไม่ใช่ union ของชื่อคอลัมน์ — ตัวแถบสรุปไม่ได้ถือนิยาม
 * คอลัมน์ของตาราง และไม่ควรต้องถือ
 */
export interface TableSort {
  column: string;
  dir: SortDir;
}

/** วันที่ล้วนแบบไทย — **ต้องตรงกับ facet ของคอลัมน์ประทับเวลา** ถึงจะกรองติด */
export const stampDay = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

/** `YYYY-MM-DD` ตามเวลาไทย — ใช้เทียบกับ `interview.date` ที่เก็บเป็น ISO */
const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayOfMonth = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  timeZone: "Asia/Bangkok",
});

/** หัวปฏิทิน — `th-TH` ให้ปี พ.ศ. มาเองตามปฏิทินที่ฝ่ายบุคคลใช้พูดกันจริง */
const monthTitle = new Intl.DateTimeFormat("th-TH", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

const INFLOW_DAYS = 14;

/** อา–ส · เขียนเป็นค่าคงที่แทน `Intl` เพราะเป็นป้ายเจ็ดตัวที่ไม่เคยเปลี่ยน
 *  และการเรียกฟอร์แมตเตอร์เจ็ดรอบทุกครั้งที่เปลี่ยนเดือนคือการจ่ายฟรี ๆ */
const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

/**
 * ลำดับช่องบนแถบ — **ตามทางเดินจริงของใบสมัครหนึ่งใบ** ไม่ใช่ตามตัวอักษรหรือ
 * ตามจำนวน · แถบนี้จึงอ่านเป็นสายพานเดียวจากซ้ายไปขวา และตำแหน่งของแต่ละช่อง
 * ไม่ขยับไปมาเวลายอดเปลี่ยน
 */
const PIPELINE: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "training",
  "working",
  "cancelled",
];

/** จุดสีหน้าชื่อสถานะ — ชุดเดียวกับไอคอนคนหน้าชื่อในตาราง (`PersonMark`) */
const DOT: Record<ApplicationStatus, string> = {
  pending_contact: "bg-st-new-ink",
  interview_scheduled: "bg-st-wait-ink",
  interview_waiting: "bg-st-wait-ink",
  interview_passed: "bg-st-live-ink",
  training: "bg-st-live-ink",
  working: "bg-st-done-ink",
  cancelled: "bg-alert",
};

/* ───────────────────────────────────────────────── วันที่แบบ ISO ล้วน

   ปฏิทินทั้งใบคำนวณบน `YYYY-MM-DD` **ไม่ใช่วัตถุ `Date` ของเครื่องผู้ใช้** —
   เครื่องที่ตั้งเขตเวลาไว้คนละที่กับกรุงเทพฯ (โน้ตบุ๊กที่เพิ่งกลับจากต่างประเทศ
   หรือเครื่องที่ตั้งเวลาเพี้ยน) จะได้ “วันนี้” คนละวันกับที่ `interview.date`
   เก็บไว้ ซึ่งแปลว่านัดของวันนี้จะไปโผล่ช่องเมื่อวาน · จุดเดียวที่อ่านเวลาจริง
   คือ `todayIso()` และมันอ่านผ่าน `isoDay` ที่ปักเขตเวลาไทยไว้แล้ว */

function todayIso(): string {
  return isoDay.format(new Date());
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` บวกลบวัน — คิดบน UTC เพื่อไม่ให้ช่วงเปลี่ยนเวลาของเครื่องมาขยับวัน */
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** `YYYY-MM` บวกลบเดือน — ปุ่ม ‹ › ของปฏิทินเรียกตัวนี้ตัวเดียว */
function shiftMonth(anchor: string, months: number): string {
  const [y, m] = anchor.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}`;
}

/** `YYYY-MM-DD` → `Date` ที่ฟอร์แมตเตอร์เขตเวลาไทยอ่านแล้วได้วันเดิมเป๊ะ */
function atBangkok(iso: string): Date {
  return new Date(`${iso}T00:00:00+07:00`);
}

/**
 * ช่องทั้งหมดของเดือนหนึ่ง ๆ เรียงตามสัปดาห์ที่ขึ้นต้นด้วย **วันอาทิตย์**
 * (ตามปฏิทินไทยที่ติดผนังห้องบุคคล ไม่ใช่ ISO ที่ขึ้นต้นวันจันทร์)
 *
 * หัวและท้ายสัปดาห์ที่ล้นออกไปเป็น **วันของเดือนข้างเคียงจาง ๆ** ไม่ใช่ช่องว่าง
 * — ท่าเดียวกับ Google Calendar: ตารางที่ทุกสัปดาห์เต็มเจ็ดช่องอ่านเป็นตะแกรง
 * เดียวกันทั้งใบ ส่วนช่องโหว่ที่หัวกับท้ายทำให้สัปดาห์แรกกับสัปดาห์สุดท้ายดูเหมือน
 * แถวที่ยังโหลดไม่เสร็จ · วันของเดือนข้างเคียงกดไม่ได้ (ดู `inMonth`)
 */
function monthCells(anchor: string): { iso: string; inMonth: boolean }[] {
  const [y, m] = anchor.split("-").map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  /* ปัดขึ้นให้ครบสัปดาห์ — ไม่งั้นแถวสุดท้ายมีช่องไม่ครบเจ็ด แล้ว `grid` จะยืด
     ช่องที่เหลือให้กว้างกว่าช่องอื่นทั้งปฏิทิน */
  const total = Math.ceil((lead + length) / 7) * 7;

  return Array.from({ length: total }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    return {
      iso: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      inMonth: date.getUTCMonth() === m - 1,
    };
  });
}

/** ช่องที่แถบนี้กรองได้ — ทุกตัวเป็น `ColumnId` ของตารางจริง */
export type InsightFilters = {
  createdAt?: string[];
  interview?: string[];
  status?: string[];
  exitReason?: string[];
  contactOwner?: string[];
  fullName?: string[];
};

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

/**
 * ตัวกรองตั้งต้นของตารางผู้สมัคร — **เปิดมาเจอ “รอการติดต่อ” ก่อนเสมอ**
 * (ตามคำสั่งเจ้าของงาน 29 ก.ย. 2026) ใบที่ต้องโทรกลับคืองานของวันนี้ ส่วนการเห็น
 * ทุกสถานะปนกันตั้งแต่เปิดหน้าทำให้งง · การ์ด “ทั้งหมด” จึงเหลือไว้แค่อ่านยอด กดไม่ได้ และ
 * “ล้างตัวกรอง” ทุกปุ่มถอยกลับมาที่ค่านี้ ไม่ใช่ตารางที่ไม่กรองอะไรเลย
 */
export const DEFAULT_FILTERS: InsightFilters = {
  status: [STATUS_LABEL.pending_contact],
};

/** ตัวกรองตอนนี้ต่างจากค่าตั้งต้นไหม — ตัดสินว่าจะโชว์ปุ่ม “ล้างตัวกรอง” หรือไม่ */
export function isFiltering(filters: InsightFilters): boolean {
  return Object.entries(filters).some(([key, picked]) => {
    const base = DEFAULT_FILTERS[key as keyof InsightFilters] ?? [];
    return !sameSet(picked ?? [], base);
  });
}

export function CandidateInsights({
  tabs,
  rows,
  visibleCount,
  filters,
  onFilter,
  onSort,
  onClearAll,
  actions,
}: {
  /** แท็บของทั้งหน้า (`recruitment-tabs.tsx`) — วางซ้ายสุดของแถบท้ายการ์ด */
  tabs?: React.ReactNode;
  rows: ApplicationSummary[];
  /** จำนวนแถวที่เหลือหลังกรอง — แถบนี้เป็นที่เดียวที่รายงานยอดนั้น */
  visibleCount: number;
  /** อ่านสถานะ “กำลังกรองอยู่” จากตัวกรองจริงของตาราง ไม่เก็บ state ซ้อน */
  filters: InsightFilters;
  /** รวมเข้ากับตัวกรองเดิม · ส่ง `[]` = ล้างช่องนั้น */
  onFilter: (patch: InsightFilters) => void;
  onSort: (sort: TableSort) => void;
  /** ถอยตัวกรองของ **ทุกคอลัมน์** กลับเป็น `DEFAULT_FILTERS` รวมถึงคอลัมน์ที่แถบนี้ไม่ได้เป็นเจ้าของ */
  onClearAll: () => void;
  /** ปุ่มงานของทั้งตาราง (นำเข้าจาก Google Form) — วางขวาสุดของแถบท้ายการ์ด */
  actions?: React.ReactNode;
}) {
  /* พับไว้ตั้งแต่เปิดหน้า — ค่าเริ่มต้นคือ “ตารางเต็มจอ” ไม่ใช่ “แดชบอร์ดเต็มจอ”
     · ไม่จำค่าที่เคยกางไว้ เพราะการจำต้องอ่าน `localStorage` ซึ่งฝั่งเซิร์ฟเวอร์
     ไม่มี แล้ว HTML สองฝั่งจะไม่ตรงกันตอน hydrate */
  const [open, setOpen] = useState(false);

  const today = todayIso();

  const count = useMemo(() => {
    const map = new Map<ApplicationStatus, number>();
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  /* เลยวันนัดแล้วแต่สถานะยังค้างที่ “นัดสัมภาษณ์” = ใบที่กำลังหลุดมือเงียบ ๆ
     เงื่อนไขเดียวกับที่ `InterviewCell` ใช้ขึ้นคำว่า “เลยนัด” เป็นสีแดงในตาราง */
  const overdue = rows.filter(
    (a) =>
      a.status === "interview_scheduled" && a.interview.date && a.interview.date < today,
  ).length;

  /** นัดที่ยังมาไม่ถึง — ตัวเลขบนปุ่มเปิดปฏิทิน บอกว่าข้างในมีอะไรให้ดูไหม */
  const ahead = rows.filter((a) => a.interview.date && a.interview.date >= today).length;

  const pickedStatus = filters.status ?? [];
  const filtering = isFiltering(filters);

  /* กดช่องสถานะ = กรองด้วยสถานะนั้น · **กดซ้ำไม่ล้าง** (ไม่มีมุมมอง “ทั้งหมด” แล้ว
     ดู `DEFAULT_FILTERS`) · ล้างตัวกรองวันที่ค้างอยู่ไปด้วย
     เพราะถ้าเพิ่งกดวันในปฏิทินไว้แล้วมากดช่อง “รอการติดต่อ” ตารางจะว่างทุกครั้ง
     (ใบที่ยังรอโทรยังไม่มีวันนัด) ซึ่งอ่านเหมือนระบบพัง ไม่ใช่ตัวกรองสองชั้นตัดกัน */
  const pickStatus = (labels: string[]) =>
    onFilter({
      status: labels,
      exitReason: [],
      interview: [],
      createdAt: [],
      fullName: [],
    });

  return (
    <section className="flex flex-col">
      {/* ─────────────────────────────────── บรรทัดเดียวที่เห็นตลอดเวลา */}
      <SummaryPanel label="สรุปใบสมัครตามสถานะ" className="flex-none">
        <SummaryStats className="grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {/* ยอดรวมโชว์ไว้อ่าน **แต่กดไม่ได้** (29 ก.ย. 2026) — ไม่มีมุมมอง “ทั้งหมด”
              ให้กรองแล้ว ดู `DEFAULT_FILTERS` · ไม่ส่ง `onClick` = กล่องเฉย ๆ ไม่ใช่ปุ่ม */}
          <SummaryStat
            lead
            compact
            label="ทั้งหมด"
            value={rows.length}
            className="col-span-2 sm:col-span-4 lg:col-span-1"
          />
          {PIPELINE.map((status) => (
            <SummaryStat
              key={status}
              compact
              label={STATUS_LABEL[status]}
              value={count.get(status) ?? 0}
              share={(count.get(status) ?? 0) / (rows.length || 1)}
              dot={DOT[status]}
              tone={status === "cancelled" ? "alert" : "primary"}
              active={sameSet(pickedStatus, [STATUS_LABEL[status]])}
              onClick={() => pickStatus([STATUS_LABEL[status]])}
              title={`ดูเฉพาะ${STATUS_LABEL[status]}`}
            />
          ))}
        </SummaryStats>

        <div className="flex flex-wrap items-end justify-between gap-x-3 bg-base-200/40 px-4">
          {tabs}
          <div className="flex flex-wrap items-center justify-end gap-2 py-2 text-11-5 text-mut">
          {overdue ? (
            <button
              type="button"
              onClick={() => {
                onFilter({
                  status: [STATUS_LABEL.interview_scheduled],
                  interview: [],
                  exitReason: [],
                });
                onSort({ column: "interview", dir: "asc" });
              }}
              title="ใบที่เลยวันนัดแล้วแต่ยังไม่มีใครอัปเดตผล"
              className="flex items-center gap-1 rounded-full border border-alert/30 bg-alert-soft px-2 py-0.5 text-alert transition-colors hover:border-alert/60"
            >
              <TriangleAlert size={12} strokeWidth={2} aria-hidden className="flex-none" />
              เลยนัด <span className="font-medium tabular-nums">{overdue}</span>
            </button>
          ) : null}

          <span className="tabular-nums">
            แสดง {visibleCount} จาก {rows.length} ใบ
          </span>

          {filtering ? (
            <button
              type="button"
              onClick={onClearAll}
              title={`กลับไปดูเฉพาะ${STATUS_LABEL.pending_contact}`}
              className="btn-sec px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-ink"
            >
              ล้างตัวกรอง
            </button>
          ) : null}

          {/* ปุ่มเดียวที่กางของหนักทั้งหมด — ปิดอยู่ = ตารางได้ความสูงคืนทั้งแผง */}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            className={`flex items-center gap-1.5 rounded-field border px-2 py-0.5 transition-colors ${
              open
                ? "border-primary/50 bg-soft text-primary"
                : "border-line bg-base-100 hover:border-primary/40 hover:text-ink"
            }`}
          >
            <CalendarDays size={13} strokeWidth={2} aria-hidden className="flex-none" />
            ปฏิทิน
            <span className="font-medium tabular-nums">{ahead}</span>
            <ChevronDown
              size={13}
              strokeWidth={2}
              aria-hidden
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {actions}
          </div>
        </div>
      </SummaryPanel>

      {/* ยุบด้วย grid 0fr→1fr — ท่าเดียวที่ยุบความสูงที่ไม่รู้ล่วงหน้าได้จริง
          โดยไม่ต้องวัดความสูงด้วย JS · ระยะห่างอยู่ใน `pt-2` ข้างใน ไม่ใช่ `gap`
          ของ section ไม่งั้นตอนพับจะเหลือช่องว่างลอยอยู่ 8px */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="grid gap-2 pt-2 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <InterviewCalendar
              rows={rows}
              filters={filters}
              onFilter={onFilter}
              onSort={onSort}
            />

            <aside className="flex flex-col gap-2">
              <InflowPanel
                rows={rows}
                today={today}
                picked={filters.createdAt ?? []}
                onFilter={onFilter}
              />
              <ExitPanel
                rows={rows}
                picked={filters.exitReason ?? []}
                onFilter={onFilter}
              />
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════ แผงที่กางออกมา — ด้านข้าง */

/** โครงกล่องเล็กในแผงข้าง — ป้ายหัวโมโน + ยอด แล้วค่อยเป็นภาพ */
function SidePanel({
  label,
  value,
  unit,
  aside,
  children,
}: {
  label: string;
  value: number;
  unit: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-box border border-line bg-base-100 p-3">
      <div className="flex items-baseline gap-1.5">
        <h3 className="font-mono text-10 font-semibold tracking-[0.07em] text-mut uppercase">
          {label}
        </h3>
        <span className="ml-auto text-15 leading-none font-semibold tabular-nums">
          {value}
        </span>
        <span className="text-11 text-mut">{unit}</span>
      </div>
      {children}
      {aside ? <p className="text-10-5 text-mut">{aside}</p> : null}
    </div>
  );
}

/** ใบสมัครเข้าใหม่รายวัน — รูปทรงของ “ประกาศรับสมัครยังมีคนเข้ามาอยู่ไหม” */
function InflowPanel({
  rows,
  today,
  picked,
  onFilter,
}: {
  rows: ApplicationSummary[];
  today: string;
  picked: string[];
  onFilter: (patch: InsightFilters) => void;
}) {
  /* ไล่วันจากปฏิทินไม่ใช่จากข้อมูล — วันที่ไม่มีใครสมัครต้องเป็นแท่งศูนย์ที่เห็นได้
     ไม่ใช่วันที่หายไปจากแกนจนกราฟโกหกว่าใบเข้ามาสม่ำเสมอ */
  const days = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = INFLOW_DAYS - 1; i >= 0; i--) buckets.set(shiftIso(today, -i), 0);
    for (const row of rows) {
      const iso = isoDay.format(new Date(row.createdAt));
      if (buckets.has(iso)) buckets.set(iso, (buckets.get(iso) ?? 0) + 1);
    }
    return [...buckets].map(([iso, count]) => ({
      iso,
      count,
      /* ป้ายต้องเป็นข้อความเดียวกับ facet ของคอลัมน์ประทับเวลา ไม่งั้นกรองไม่ติด */
      label: stampDay.format(atBangkok(iso)),
    }));
  }, [rows, today]);

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(1, ...days.map((day) => day.count));

  return (
    <SidePanel
      label={`ใบเข้าใหม่ ${INFLOW_DAYS} วัน`}
      value={total}
      unit="ใบ"
      aside={`เฉลี่ย ${(total / INFLOW_DAYS).toFixed(1)} ใบ/วัน · แท่งขวาสุดคือวันนี้`}
    >
      <div className="flex h-[34px] items-end gap-[2px]">
        {days.map((day, i) => {
          const on = picked.includes(day.label);
          const isToday = i === days.length - 1;
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onFilter({ createdAt: on ? [] : [day.label] })}
              aria-pressed={on}
              aria-label={`${day.label} มีใบสมัคร ${day.count} ใบ กดเพื่อกรองตาราง`}
              title={`${day.label} · ${day.count} ใบ`}
              className="group flex h-full min-w-0 flex-1 items-end"
            >
              <span
                aria-hidden
                className={`w-full rounded-[2px] transition-colors ${
                  on
                    ? "bg-primary"
                    : isToday
                      ? "bg-primary/80"
                      : day.count
                        ? "bg-primary/30 group-hover:bg-primary/60"
                        : "bg-line group-hover:bg-mut/50"
                }`}
                style={{
                  height: day.count ? `${Math.max(4, (day.count / peak) * 34)}px` : "2px",
                }}
              />
            </button>
          );
        })}
      </div>
    </SidePanel>
  );
}

/**
 * ไล่ความเข้มของสีเตือนสีเดียว **ไม่ใช่หลายสี**
 *
 * เหตุผลที่ยกเลิกทั้งหมดอยู่หมวดเดียวกันคือ “ออกจากกระบวนการ” ไม่ได้เป็นคนละชนิด
 * ของข้อมูล การให้หลาย hue จึงบังคับให้ต้องจำ legend ฟรี ๆ · ความเข้มที่ไล่ลง
 * ตามอันดับอ่านออกทันทีว่าอันไหนเยอะกว่าโดยไม่ต้องเทียบตัวเลข
 */
const SHADE = ["bg-alert", "bg-alert/70", "bg-alert/45", "bg-alert/30"];

/** ลายทางของช่วง “ยังไม่ระบุเหตุผล” — เขียนเป็น style เพราะ gradient ที่ยัดเป็น
    คลาส arbitrary ของ Tailwind ถ้าพิมพ์ผิดจะเงียบ ไม่มี error ให้เห็น */
const PENDING_STRIPE: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-alert) 0 3px, transparent 3px 6px)",
  opacity: 0.6,
};

/** เหตุผลที่ยกเลิก — ยอดที่ `EXIT_REASONS` ตั้งใจให้รวมดูตอนสิ้นเดือน */
function ExitPanel({
  rows,
  picked,
  onFilter,
}: {
  rows: ApplicationSummary[];
  picked: string[];
  onFilter: (patch: InsightFilters) => void;
}) {
  const { bars, total } = useMemo(() => {
    const cancelled = rows.filter((a) => a.status === "cancelled");
    const counted = EXIT_REASONS.map((reason) => ({
      label: reason.label,
      count: cancelled.filter((a) => a.exitReason === reason.value).length,
      pending: false,
    }))
      .filter((r) => r.count)
      .sort((a, b) => b.count - a.count);

    /* ใบที่ยกเลิกแล้วแต่ยังไม่มีใครใส่เหตุผล — เป็นงานค้างของฝ่ายบุคคล ไม่ใช่
       หมวดหนึ่งของสถิติ จึงอยู่ท้ายสุดเสมอและใช้ลายทางแทนพื้นทึบ */
    const blank = cancelled.filter((a) => !a.exitReason).length;

    return {
      bars: [
        ...counted,
        ...(blank ? [{ label: "ยังไม่ระบุเหตุผล", count: blank, pending: true }] : []),
      ],
      total: cancelled.length,
    };
  }, [rows]);

  /* กรองสถานะเป็น “ยกเลิก” ด้วยเสมอ เพราะคอลัมน์เหตุผลโผล่ในตารางเฉพาะตอนนั้น
     (ดู `showReason` ใน `candidates-view`) */
  const pick = (label: string, on: boolean) =>
    onFilter(
      on
        ? { exitReason: [] }
        : { status: [STATUS_LABEL.cancelled], exitReason: [label], interview: [] },
    );

  return (
    <SidePanel
      label="เหตุผลที่ยกเลิก"
      value={total}
      unit="ใบ"
      aside={
        total
          ? `${Math.round((total / Math.max(1, rows.length)) * 100)}% ของใบทั้งหมด`
          : undefined
      }
    >
      {bars.length === 0 ? (
        <p className="py-1 text-11-5 text-mut">ยังไม่มีใบที่ยกเลิก</p>
      ) : (
        <div className="flex flex-col gap-2">
          {/* แถบเดียวแบ่งเป็นช่วง — สัดส่วนอ่านได้ในแวบเดียวโดยไม่กินความสูง
              เท่าการวางแถบนอนเรียงกันหลายแถว */}
          <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
            {bars.map((bar, i) => {
              const on = picked.includes(bar.label);
              return (
                <button
                  key={bar.label}
                  type="button"
                  onClick={() => pick(bar.label, on)}
                  aria-pressed={on}
                  aria-label={`${bar.label} ${bar.count} ราย กดเพื่อกรองตาราง`}
                  title={`${bar.label} · ${bar.count} ราย`}
                  style={{
                    width: `${(bar.count / total) * 100}%`,
                    ...(bar.pending ? PENDING_STRIPE : null),
                  }}
                  className={`h-full min-w-[3px] transition-opacity hover:opacity-80 ${
                    bar.pending ? "" : (SHADE[i] ?? "bg-alert/20")
                  } ${on ? "ring-1 ring-ink/40 ring-inset" : ""}`}
                />
              );
            })}
          </div>

          <ul className="flex flex-col gap-0.5">
            {bars.map((bar, i) => {
              const on = picked.includes(bar.label);
              return (
                <li key={bar.label}>
                  <button
                    type="button"
                    onClick={() => pick(bar.label, on)}
                    aria-pressed={on}
                    className="flex w-full items-center gap-1.5 rounded-selector px-1 py-0.5 text-left transition-colors hover:bg-base-200"
                  >
                    <span
                      aria-hidden
                      className={`size-2 flex-none rounded-[2px] ${
                        bar.pending ? "bg-alert/35" : (SHADE[i] ?? "bg-alert/20")
                      }`}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate text-11 ${
                        on ? "font-medium text-ink" : "text-mut"
                      }`}
                    >
                      {bar.label}
                    </span>
                    <span className="flex-none font-mono text-11 tabular-nums">
                      {bar.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SidePanel>
  );
}

/* ══════════════════════════════════ แผงที่กางออกมา — ปฏิทินนัดสัมภาษณ์ */

/**
 * มุมมองเดือนแบบ Google Calendar — **อ่านอย่างเดียว**
 *
 * ยืมท่าของ Google Calendar มาทั้งหมดโดยตั้งใจ เพราะฝ่ายบุคคลเปิดปฏิทินนั้นอยู่
 * ทุกวันและไม่มีอะไรที่ระบบนี้จะสอนเขาได้ดีกว่าเครื่องมือที่เขาใช้คล่องอยู่แล้ว:
 *
 * - **ตะแกรงเส้นกริดเต็มความกว้าง** ไม่ใช่ช่องมนที่มีช่องไฟ — ช่องที่ติดกันสนิท
 *   ทำให้กวาดตาตามสัปดาห์ได้เป็นแถว และเทียบความแน่นของแต่ละวันได้ทันที
 * - **หัวปฏิทินเรียง `วันนี้ → ‹ › → ชื่อเดือน`** ตำแหน่งเดียวกับที่มือไปหยิบอยู่แล้ว
 * - **เลขวันอยู่มุมบนซ้ายของช่อง วันนี้เป็นวงกลมทึบ**
 * - **นัดแต่ละรายเป็นแถบในช่อง (เวลา + ชื่อ)** เกิน `MAX_CHIPS` พับเป็น “+N”
 *   — ตัวเลขนับรวมบอกว่าวันนั้นแน่นแค่ไหน แต่ไม่ได้บอกว่าใคร ซึ่งเป็นคำถามถัดไป
 *   ของคนที่กำลังจะเสนอวันสัมภาษณ์ให้ผู้สมัครทางโทรศัพท์เสมอ
 * - **วันของเดือนข้างเคียงยังอยู่ให้ครบสัปดาห์ แต่จางและกดไม่ได้**
 *
 * สิ่งที่ **ไม่ยืมมา**: สร้าง/ลาก/แก้นัด — ปฏิทินนี้เป็นกระจกส่องตาราง วันนัดแก้ที่
 * ช่อง “นัดสัมภาษณ์” ในตารางที่เดียว (ดู `InterviewCell`) การมีสองที่ที่แก้ค่าเดียวกัน
 * ได้คือที่มาของค่าที่ไม่ตรงกัน · และ **ไม่มีมุมมองสัปดาห์/วัน** เพราะคำถามที่
 * ปฏิทินนี้ต้องตอบคือ “เดือนนี้วันไหนแน่น จะเสนอวันไหนได้” ซึ่งมุมมองเดือนตอบจบ
 *
 * สิ่งเดียวที่กดได้คือ **ตัวช่องวัน = กรองตารางข้างล่างให้เหลือนัดของวันนั้น**
 * (กติกาของแถบสรุปทั้งแถบ: ทุกชิ้นที่วาดต้องกดแล้วกรองได้จริง) กดซ้ำ = ล้าง
 */

/** จำนวนแถบนัดที่ขึ้นในช่องได้ก่อนพับเป็น “+N” — เพดานที่ช่องสูง ~76px รับได้
 *  โดยที่ทุกแถวของปฏิทินยังสูงเท่ากัน */
const MAX_CHIPS = 3;

/**
 * โทนของแถบนัด — แจกตาม **สิ่งที่ต้องทำต่อ** ไม่ใช่ตามสถานะตัวต่อตัว
 * (กติกาเดียวกับ `status-pill.tsx`): เขียว = ยังต้องตามต่อ · แดง = เลยนัดแล้ว
 * ยังไม่มีใครอัปเดตผล · เทา = ปิดงานแล้ว ไม่ต้องทำอะไรอีก
 */
function chipTone(row: ApplicationSummary, today: string): string {
  if (row.status === "interview_scheduled" && row.interview.date < today) {
    return "bg-alert/12 text-alert";
  }
  if (row.status === "interview_passed" || isHiredStatus(row.status)) {
    return "bg-base-200 text-mut";
  }
  if (row.status === "cancelled") return "bg-base-200 text-mut line-through";
  return "bg-soft text-primary";
}

function InterviewCalendar({
  rows,
  filters,
  onFilter,
  onSort,
}: {
  rows: ApplicationSummary[];
  filters: InsightFilters;
  onFilter: (patch: InsightFilters) => void;
  onSort: (sort: TableSort) => void;
}) {
  const today = todayIso();
  const [anchor, setAnchor] = useState(() => today.slice(0, 7));

  /** นัดทั้งหมดจัดเข้าวัน — เรียงตามเวลาในวัน ใบที่ยังไม่ระบุเวลาไปท้ายสุด */
  const byDay = useMemo(() => {
    const map = new Map<string, ApplicationSummary[]>();
    for (const row of rows) {
      if (!row.interview.date) continue;
      const list = map.get(row.interview.date);
      if (list) list.push(row);
      else map.set(row.interview.date, [row]);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        (a.interview.time || "99:99").localeCompare(b.interview.time || "99:99"),
      );
    }
    return map;
  }, [rows]);

  const cells = useMemo(() => monthCells(anchor), [anchor]);
  const monthTotal = cells.reduce(
    (sum, cell) => sum + (cell.inMonth ? (byDay.get(cell.iso)?.length ?? 0) : 0),
    0,
  );

  const picked = filters.interview ?? [];

  const overdue = rows.filter(
    (a) =>
      a.status === "interview_scheduled" && a.interview.date && a.interview.date < today,
  ).length;

  /* กดวัน = กรองตารางด้วยวันนั้น · กดซ้ำวันเดิม = ล้าง · ล้างตัวกรองสถานะที่ค้าง
     อยู่ไปด้วย เพราะวันที่กดมาจากปฏิทินย่อมหมายถึง “ทุกคนที่นัดวันนี้” ไม่ใช่
     “ทุกคนที่นัดวันนี้ *และ* ยังอยู่สถานะที่เผอิญกดไว้เมื่อกี้” */
  function pickDay(iso: string) {
    const on = picked.includes(thaiDate(iso));
    onFilter({ interview: on ? [] : [thaiDate(iso)], status: [], exitReason: [] });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-box border border-line bg-base-100">
      {/* ─────────────────────────── หัวปฏิทิน — ลำดับเดียวกับ Google Calendar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setAnchor(today.slice(0, 7))}
          className="btn-sec px-2.5 py-1 text-12 text-mut transition-colors hover:border-primary/40 hover:text-ink"
        >
          วันนี้
        </button>

        <div className="flex items-center gap-0.5">
          <MonthStep
            label="เดือนก่อนหน้า"
            onClick={() => setAnchor((prev) => shiftMonth(prev, -1))}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden />
          </MonthStep>
          <MonthStep
            label="เดือนถัดไป"
            onClick={() => setAnchor((prev) => shiftMonth(prev, 1))}
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden />
          </MonthStep>
        </div>

        <h3 className="text-15 font-medium">
          {monthTitle.format(atBangkok(`${anchor}-01`))}
        </h3>

        <span className="ml-auto text-11-5 text-mut tabular-nums">
          {monthTotal} นัดในเดือนนี้
        </span>
      </div>

      {/* ───────────────────────────────────────────── หัวคอลัมน์วันในสัปดาห์ */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((day, i) => (
          <span
            key={day}
            className={`border-t border-line bg-base-200/40 py-1 text-center font-mono text-10 font-semibold tracking-[0.06em] text-mut uppercase ${
              i === 6 ? "" : "border-r"
            }`}
          >
            {day}
          </span>
        ))}
      </div>

      {/* ───────────────────────────────────────────────────── ตะแกรงของเดือน */}
      <div className="grid grid-cols-7">
        {cells.map(({ iso, inMonth }, i) => {
          const list = byDay.get(iso) ?? [];
          const on = picked.includes(thaiDate(iso));
          const isToday = iso === today;
          const edge = i % 7 === 6;

          /* พับเมื่อเกินเพดานจริง ๆ เท่านั้น — รายการที่สี่ที่ถูกซ่อนเพื่อขึ้นคำว่า
             “+1” ไม่ได้ประหยัดที่ แต่ทำให้ต้องกดไปหาในตารางเพิ่มอีกหนึ่งครั้ง */
          const shown = list.length > MAX_CHIPS ? list.slice(0, MAX_CHIPS - 1) : list;
          const rest = list.length - shown.length;

          const frame = `flex min-h-[4.5rem] flex-col gap-1 border-t border-line p-1.5 text-left sm:min-h-[4.75rem] ${
            edge ? "" : "border-r"
          }`;

          const number = `flex size-[18px] flex-none items-center justify-center rounded-full text-11 tabular-nums ${
            isToday
              ? "bg-primary font-semibold text-primary-content"
              : on
                ? "font-semibold text-primary"
                : inMonth
                  ? "text-ink"
                  : "text-mut/55"
          }`;

          /* วันของเดือนข้างเคียง — วาดไว้ให้สัปดาห์ครบเจ็ดช่อง แต่ไม่ใช่ปุ่ม
             ช่องที่กดได้แล้วกรองไปเป็นวันที่ไม่ได้อยู่ในเดือนบนหัวปฏิทินคือกับดัก */
          if (!inMonth) {
            return (
              <div key={iso} className={`${frame} bg-base-200/25`}>
                <span className={number}>{dayOfMonth.format(atBangkok(iso))}</span>
              </div>
            );
          }

          return (
            <button
              key={iso}
              type="button"
              onClick={() => pickDay(iso)}
              aria-pressed={on}
              aria-label={`${thaiDate(iso)} มีนัดสัมภาษณ์ ${list.length} ราย กดเพื่อกรองตาราง`}
              className={`${frame} transition-colors ${
                on ? "bg-soft ring-1 ring-primary/55 ring-inset" : "hover:bg-base-200/60"
              }`}
            >
              <span className="flex items-center gap-1">
                <span className={number}>{dayOfMonth.format(atBangkok(iso))}</span>
                {/* ต่ำกว่า sm ช่องกว้างราว 50px อ่านชื่อไม่ออก — เหลือเลขนับ
                    ท่าเดียวกับ Google Calendar บนมือถือที่เหลือแค่จุด */}
                {list.length ? (
                  <span className="font-mono text-9-5 text-mut tabular-nums sm:hidden">
                    {list.length}
                  </span>
                ) : null}
              </span>

              <span className="hidden min-w-0 flex-col gap-[3px] sm:flex">
                {shown.map((a) => (
                  <span
                    key={a.id}
                    title={`${a.interview.time || "ยังไม่ระบุเวลา"} · ${a.fullName} · ${STATUS_LABEL[a.status]}`}
                    className={`flex items-center gap-1 overflow-hidden rounded-[4px] px-1 py-[1px] text-10-5 leading-[1.45] ${chipTone(a, today)}`}
                  >
                    <span className="flex-none font-mono tabular-nums opacity-75">
                      {a.interview.time || "--:--"}
                    </span>
                    <span className="min-w-0 truncate">{a.fullName}</span>
                  </span>
                ))}
                {rest ? (
                  <span className="pl-1 text-10 text-mut">+{rest} รายการ</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* ───────────────────────────────── ท้ายปฏิทิน — ความหมายของสี + งานค้าง */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-base-200/30 px-3 py-2">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-10-5 text-mut">
          <Swatch className="bg-soft ring-1 ring-primary/45 ring-inset">รอถึงวันนัด / รอผล</Swatch>
          <Swatch className="bg-alert/25">เลยนัด</Swatch>
          <Swatch className="bg-base-300">ปิดงานแล้ว</Swatch>
        </span>

        {picked.length === 1 ? (
          <button
            type="button"
            onClick={() => onFilter({ interview: [] })}
            className="rounded-field border border-primary/40 px-2 py-0.5 text-11 text-primary transition-colors hover:bg-soft"
          >
            กำลังดู {picked[0]} · ล้าง
          </button>
        ) : (
          <span className="text-10-5 text-mut">กดวันเพื่อกรองตารางข้างล่าง</span>
        )}

        {overdue ? (
          <button
            type="button"
            onClick={() => {
              onFilter({
                status: [STATUS_LABEL.interview_scheduled],
                interview: [],
                exitReason: [],
              });
              onSort({ column: "interview", dir: "asc" });
            }}
            className="ml-auto flex items-center gap-1.5 rounded-field px-1.5 py-0.5 text-11-5 text-alert transition-colors hover:bg-alert/10"
          >
            <TriangleAlert size={12} strokeWidth={2} aria-hidden className="flex-none" />
            เลยนัดแล้วยังไม่อัปเดตผล{" "}
            <span className="font-medium tabular-nums">{overdue}</span> ราย
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** ตัวอย่างสีท้ายปฏิทิน — สี่เหลี่ยมเล็กหน้าคำอธิบาย ขนาดเดียวกับแถบนัดในช่อง */
function Swatch({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`size-2.5 flex-none rounded-[3px] ${className}`} />
      {children}
    </span>
  );
}
/** ปุ่ม ‹ › ของหัวปฏิทิน — ขนาดเท่ากันทั้งคู่ ไม่มีป้ายข้อความให้อ่าน */
function MonthStep({
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
      title={label}
      className="flex size-7 items-center justify-center rounded-field border border-line text-mut transition-colors hover:border-primary/40 hover:text-primary"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
