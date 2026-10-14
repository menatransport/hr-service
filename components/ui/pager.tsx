"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * แถบเลขหน้า — แสดงหน้าแรก/หน้าสุดท้ายเสมอ และขยับหน้าต่างรอบหน้าปัจจุบัน
 * เพื่อให้ความกว้างคงที่ ไม่ว่าจะมีกี่หน้า
 *
 * ย้ายออกมาจาก `case-table.tsx` ตอนทำตารางบันทึกเคส (20 ส.ค. 2026) — ตอนนี้ทั้ง
 * คิวคำร้องและคิวบันทึกเคสใช้ตัวเดียวกัน **อย่าก๊อปไปทำใหม่ในตารางที่สาม**
 */
function pageWindow(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);

  const around = [current - 1, current, current + 1].filter(
    (n) => n > 1 && n < count,
  );
  const pages = [1, ...around, count];

  const out: (number | "gap")[] = [];
  for (const [i, n] of pages.entries()) {
    if (i && n - (pages[i - 1] as number) > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

export function Pager({
  current,
  count,
  onGo,
}: {
  current: number;
  count: number;
  onGo: (page: number) => void;
}) {
  // หน้าเดียวก็ไม่ต้องมีปุ่มให้กด
  if (count <= 1) return null;

  return (
    <nav aria-label="แบ่งหน้า" className="flex items-center gap-1">
      <Step
        label="หน้าก่อนหน้า"
        disabled={current <= 1}
        onClick={() => onGo(current - 1)}
      >
        <ChevronLeft size={15} strokeWidth={1.9} aria-hidden />
      </Step>

      {pageWindow(current, count).map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="px-1 text-12-5 text-mut"
          >
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onGo(n)}
            aria-label={`หน้า ${n}`}
            aria-current={n === current ? "page" : undefined}
            className={`size-8 flex-none rounded-selector text-12-5 transition-colors ${
              n === current
                ? "border border-primary bg-primary font-semibold text-primary-content"
                : "border border-line bg-base-100 text-mut hover:border-ink/30 hover:text-ink"
            }`}
          >
            {n}
          </button>
        ),
      )}

      <Step
        label="หน้าถัดไป"
        disabled={current >= count}
        onClick={() => onGo(current + 1)}
      >
        <ChevronRight size={15} strokeWidth={1.9} aria-hidden />
      </Step>
    </nav>
  );
}

function Step({
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
      className="flex size-8 flex-none items-center justify-center rounded-selector border border-line bg-base-100 text-mut transition-colors hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}
