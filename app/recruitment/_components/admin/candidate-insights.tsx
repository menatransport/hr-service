"use client";

import { useMemo } from "react";

import type { SortDir } from "@/components/ui/column-menu";
import { SummaryPanel, SummaryStat, SummaryStats } from "@/components/ui/summary-panel";
import {
  STATUS_LABEL,
  type ApplicationStatus,
  type ApplicationSummary,
} from "@/app/recruitment/_lib/types";

/**
 * แถบสรุปเหนือตารางผู้สมัคร — **การ์ดตัวเลขแถวเดียว แล้วหลีกทางให้ตาราง**
 *
 * (23 ก.ย. 2026) ใช้การ์ดกลาง `components/ui/summary-panel.tsx` แบบ `compact`
 * ให้หน้าตาเดียวกับทะเบียน พจส. และหน้าเหตุผลการลาออก
 *
 * (14 ต.ค. 2026 · Bew) ถอดแถบเครื่องมือใต้การ์ดออกทั้งแถบ (ยอดที่แสดง · ปุ่มปฏิทินที่กาง
 * ปฏิทินนัด/กราฟใบเข้าใหม่/เหตุผลที่ยกเลิก · นำเข้าจาก Google Form) และถอดการ์ด
 * “ปฏิบัติงาน” — คนที่พ้นช่วงฝึกงานแล้วไปอยู่ในทะเบียนประวัติ พจส. ขององค์กรเลย
 * ไม่ใช่งานของหน้าผู้สมัคร · ของเดิมดูได้ใน git ก่อนวันนั้น
 *
 * กติกาเดิมยังอยู่ครบ: **ทุกการ์ดที่กดได้ต้องกรองตารางได้จริง** และตัวเลขทุกตัวนับจาก
 * **ชุดที่โหลดมาแล้ว** (≤ `LIST_LIMIT` = 500 ใบล่าสุด) ไม่ได้ถามฐานข้อมูลใหม่
 */

/**
 * การเรียงของตารางผู้สมัคร — `candidates-view` นำเข้าไฟล์นี้อยู่แล้ว วางไว้ทางนี้จึงไม่ต้องอ้างวน
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

/**
 * ลำดับการ์ด — **ตามทางเดินจริงของใบสมัครหนึ่งใบ** ไม่ใช่ตามตัวอักษรหรือตามจำนวน
 * · ไม่มี “ปฏิบัติงาน” (ดูหัวไฟล์)
 */
const PIPELINE: ApplicationStatus[] = [
  "pending_contact",
  "interview_scheduled",
  "interview_waiting",
  "interview_passed",
  "training",
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
  rows,
  filters,
  onFilter,
  onClearAll,
}: {
  rows: ApplicationSummary[];
  /** อ่านสถานะ “กำลังกรองอยู่” จากตัวกรองจริงของตาราง ไม่เก็บ state ซ้อน */
  filters: InsightFilters;
  /** รวมเข้ากับตัวกรองเดิม · ส่ง `[]` = ล้างช่องนั้น */
  onFilter: (patch: InsightFilters) => void;
  /** ถอยตัวกรองของ **ทุกคอลัมน์** กลับเป็น `DEFAULT_FILTERS` */
  onClearAll: () => void;
}) {
  const filtering = isFiltering(filters);
  const count = useMemo(() => {
    const map = new Map<ApplicationStatus, number>();
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return map;
  }, [rows]);

  const pickedStatus = filters.status ?? [];

  /* กดการ์ดสถานะ = กรองด้วยสถานะนั้น · **กดซ้ำไม่ล้าง** (ไม่มีมุมมอง “ทั้งหมด” แล้ว
     ดู `DEFAULT_FILTERS`) · ล้างตัวกรองวันที่/ชื่อที่ค้างอยู่ไปด้วย ไม่งั้นตารางว่าง
     เพราะตัวกรองสองชั้นตัดกัน ซึ่งอ่านเหมือนระบบพัง */
  const pickStatus = (labels: string[]) =>
    onFilter({
      status: labels,
      exitReason: [],
      interview: [],
      createdAt: [],
      fullName: [],
    });

  return (
    <SummaryPanel label="สรุปใบสมัครตามสถานะ" className="flex-none">
      <SummaryStats className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
        {/* ยอดรวมไม่ใช่ตัวกรอง (29 ก.ย. 2026) — ไม่มีมุมมอง “ทั้งหมด” ดู `DEFAULT_FILTERS`
            · **ตอนกรองอยู่ช่องนี้กลายเป็นปุ่ม “ล้างตัวกรอง”** (14 ต.ค. 2026) แทนแถวปุ่มเหนือตาราง
            ไม่ได้กรองอยู่ = ไม่ส่ง `onClick` = กล่องเฉย ๆ */}
        <SummaryStat
          lead
          compact
          label="ทั้งหมด"
          value={rows.length}
          sub={filtering ? "↺ ล้างตัวกรอง" : undefined}
          onClick={filtering ? onClearAll : undefined}
          title={filtering ? "ล้างตัวกรองทั้งหมด กลับไปดูเฉพาะรอการติดต่อ" : undefined}
          className={`col-span-2 sm:col-span-3 lg:col-span-1 ${filtering ? "hover:brightness-[0.97]" : ""}`}
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
    </SummaryPanel>
  );
}
