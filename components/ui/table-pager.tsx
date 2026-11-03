"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import { Pager } from "@/components/ui/pager";

/**
 * แบ่งหน้าตารางแบบเลขหน้า (index) — หน้าละ {@link TABLE_PAGE_SIZE} แถว
 *
 * ทำครั้งแรกให้ตารางผู้สมัคร · ขอสรรหา · ติดตามพนักงานใหม่ (2 พ.ย. 2569 · Bew)
 * ตัวที่ช้าจริงของสามตารางนี้คือ**การวาดแถว** — ทุกแถวมีดรอปดาวน์/ปุ่มแก้ในช่องหลายตัว
 * วาดทีละ 25 แถวแทนทั้งหลายร้อยแถวทำให้เปิดหน้า กรอง และเรียงได้ทันที
 *
 * ตัดหน้าหลังกรอง/เรียงแล้ว (ฝั่ง client) โดยตั้งใจ — ตัวเลขในหัวคอลัมน์ การ์ดสรุป และ
 * ปุ่ม Excel ต้องนับจากทุกแถวที่ตรงตัวกรอง ไม่ใช่เฉพาะหน้าที่เห็นอยู่
 *
 * ตารางที่สี่ขึ้นไปใช้ตัวนี้ **อย่าเขียนแถบเลขหน้าขึ้นใหม่**
 */
export const TABLE_PAGE_SIZE = 25;

export interface Paged<T> {
  /** แถวของหน้าที่เปิดอยู่ */
  pageRows: T[];
  current: number;
  count: number;
  /** ลำดับแถวแรก–สุดท้ายของหน้านี้ (นับจาก 1) · ไม่มีแถว = 0–0 */
  from: number;
  to: number;
  total: number;
  go: (page: number) => void;
}

/**
 * `resetKey` — ค่าที่เปลี่ยนเมื่อชุดแถว “เปลี่ยนความหมาย” (ตัวกรอง คำค้น การเรียง แท็บ)
 * → กลับหน้า 1 · การแก้ค่าในแถว (เช่นเปลี่ยนสถานะ) ไม่ได้เปลี่ยน key จึงอยู่หน้าเดิม
 * ถ้าแถวหายจนหน้าปัจจุบันเกินจำนวนหน้า จะหดลงมาหน้าสุดท้ายเอง
 *
 * คืน `[paged, scrollRef]` — ผูก `scrollRef` กับกล่องที่เลื่อนของตาราง เปลี่ยนหน้าแล้ว
 * เลื่อนกลับขึ้นหัวตาราง (แยกจาก `paged` เพราะ React Compiler ห้ามส่ง ref ไปกับค่าที่ใช้วาด)
 */
export function usePaged<T>(
  rows: T[],
  resetKey: string,
  pageSize = TABLE_PAGE_SIZE,
): [Paged<T>, React.RefObject<HTMLDivElement | null>] {
  const [page, setPage] = useState(1);
  const [seenKey, setSeenKey] = useState(resetKey);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ตั้ง state ระหว่าง render ตามแบบที่ React แนะนำ — ไม่ต้องรอ effect อีกรอบ
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPage(1);
  }

  const count = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, count);
  const start = (current - 1) * pageSize;
  const pageRows = useMemo(
    () => rows.slice(start, start + pageSize),
    [rows, start, pageSize],
  );

  function go(next: number) {
    setPage(Math.min(Math.max(1, next), count));
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return [
    {
      pageRows,
      current,
      count,
      from: rows.length ? start + 1 : 0,
      to: start + pageRows.length,
      total: rows.length,
      go,
    },
    scrollRef,
  ];
}

/**
 * แถบใต้ตาราง — “แสดง 1–25 จาก 132 รายการ” ซ้าย · เลขหน้าขวา
 *
 * ช่อง “ไปหน้า” ขึ้นเมื่อเกิน 7 หน้า (ตอนที่ `Pager` เริ่มย่อเลขกลางเป็น …)
 * ไม่มีแถวเลย = ไม่วาดอะไร ปล่อยให้ empty state ของตารางพูดแทน
 * ปุ่ม UAT ลอยมุมขวาล่าง (`data-uat-dock`) — เว้นขวาให้เฉพาะตอนที่ปุ่มนั้นขึ้นอยู่
 */
export function TablePager<T>({
  paged,
  unit = "รายการ",
  className = "",
}: {
  paged: Paged<T>;
  unit?: string;
  className?: string;
}) {
  const { from, to, total, current, count, go } = paged;
  const [jump, setJump] = useState("");

  if (!total) return null;

  const th = (n: number) => n.toLocaleString("th-TH");

  function submitJump(e: FormEvent) {
    e.preventDefault();
    const n = Number.parseInt(jump, 10);
    if (Number.isFinite(n)) go(n);
    setJump("");
  }

  return (
    <div
      className={`table-pager flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-base-100 px-(--sheet-px) py-2.5 ${className}`}
    >
      <p role="status" aria-live="polite" className="text-12 text-mut tabular-nums">
        แสดง{" "}
        <span className="font-medium text-ink">
          {th(from)}–{th(to)}
        </span>{" "}
        จาก <span className="font-medium text-ink">{th(total)}</span> {unit}
      </p>

      {count > 1 ? (
        <div className="ms-auto flex items-center gap-3">
          <span className="hidden text-12 text-mut tabular-nums sm:inline">
            หน้า {th(current)} / {th(count)}
          </span>

          {count > 7 ? (
            <form
              onSubmit={submitJump}
              className="hidden items-center gap-1.5 text-12 text-mut md:flex"
            >
              <label htmlFor="table-pager-jump">ไปหน้า</label>
              <input
                id="table-pager-jump"
                inputMode="numeric"
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
                placeholder={String(current)}
                className="field-ring h-8 w-12 rounded-selector border border-line bg-base-100 px-2 text-center text-12-5 text-ink tabular-nums placeholder:text-mut/60"
              />
            </form>
          ) : null}

          <Pager current={current} count={count} onGo={go} />
        </div>
      ) : null}
    </div>
  );
}
