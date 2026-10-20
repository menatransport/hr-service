import { Wrench } from "lucide-react";

import { todayInBangkok } from "@/lib/record-case-flow";
import type { RepairStatus } from "@/app/recruitment/_lib/requisitions/repair-status";

/**
 * ป้ายสถานะซ่อมของรถ — ใช้ทั้งในฟอร์มขอสรรหาและคอลัมน์ทะเบียนรถของตาราง
 * ขึ้นเฉพาะคันที่อยู่บนบอร์ดซ่อม (คันปกติไม่มีป้าย) · `compact` = แค่ป้ายสั้นในแถวตาราง
 *
 * **เลยกำหนด** = กำหนดเสร็จก่อนวันนี้ (ปฏิทินไทย) แต่งานยังไม่ปิด — ส่วนใหญ่คือบอร์ดซ่อม
 * ไม่มีใครอัปเดต จึงต้องบอกให้รู้ว่าวันที่นั้นเชื่อไม่ได้แล้ว (เจ้าของงานขอ 14 ต.ค. 2026)
 */
export function RepairBadge({
  repair,
  compact = false,
  className = "ml-1.5",
}: {
  repair: RepairStatus;
  compact?: boolean;
  /** ระยะห่างของป้าย `compact` — ค่าเริ่มต้นสำหรับวางต่อท้ายทะเบียนในช่องเดียวกัน */
  className?: string;
}) {
  /* `YYYY-MM-DD` เทียบเป็นสตริงได้ตรง · นับเป็นวันตามปฏิทิน ค่าจึงคงที่ทั้งวัน (ไม่ทำให้ hydrate เพี้ยน) */
  const overdue = Boolean(repair.due) && repair.due < todayInBangkok();
  const due = repair.due ? `กำหนดเสร็จ ${thaiDate(repair.due)}` : "ยังไม่มีกำหนดเสร็จ";
  const title = [repair.mrCode && `ใบแจ้งซ่อม ${repair.mrCode}`, due, overdue && "เลยกำหนด"]
    .filter(Boolean)
    .join(" · ");

  if (compact)
    return (
      <span
        title={title}
        className={`${className} inline-flex cursor-help items-center gap-1 rounded-selector bg-alert/12 px-1.5 py-0.5 text-11-5 font-medium whitespace-nowrap text-alert`}
      >
        <Wrench size={11} aria-hidden />
        {repair.label}
        {overdue ? <span className="font-normal">· เลยกำหนด</span> : null}
      </span>
    );

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-12" title={repair.mrCode || undefined}>
      <span className="inline-flex items-center gap-1 rounded-full bg-alert/12 px-2 py-0.5 font-medium text-alert">
        <Wrench size={12} aria-hidden />
        {repair.label}
      </span>
      <span className="text-mut">{due}</span>
      {overdue ? (
        <span className="rounded-full border border-alert/30 px-2 py-0.5 font-medium text-alert">
          เลยกำหนด
        </span>
      ) : null}
    </p>
  );
}

/** `2026-10-31` → `31 ต.ค. 69` */
function thaiDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}
