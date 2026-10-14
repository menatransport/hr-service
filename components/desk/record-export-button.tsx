"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import {
  hasRecordFilters,
  recordFiltersToParams,
  type RecordCaseFilters,
} from "@/lib/record-case-filter";
import { downloadFile } from "@/lib/http";
import { runAction } from "@/lib/swal";

/**
 * ปุ่มส่งออก Excel ของคิวบันทึกเคส — คู่ขนานกับ `ExportExcelButton` ของฝั่งคำร้อง พจส.
 * (`components/desk/export-button.tsx`) ทั้งหน้าตาและพฤติกรรม แยกไฟล์กันเพราะผูกกับ
 * `RecordCaseFilters` / `/api/record-cases/export` คนละชุดกับฝั่งคำร้อง
 *
 * **ส่งออก “สิ่งที่เห็นอยู่” ไม่ใช่ทั้งคิวเสมอ** — ตัวกรองปัจจุบันถูกส่งไปกับคำขอ
 * แล้วเซิร์ฟเวอร์กรองซ้ำด้วยกฎชุดเดียวกัน (`lib/record-case-filter.ts`)
 */
export function RecordExportExcelButton({
  filters,
  count,
}: {
  filters: RecordCaseFilters;
  /** จำนวนแถวที่ตรงกับตัวกรองตอนนี้ — `0` = ไม่มีอะไรให้ส่งออก */
  count: number;
}) {
  const [busy, setBusy] = useState(false);

  const scope = hasRecordFilters(filters) ? "ตามตัวกรองปัจจุบัน" : "ทั้งคิว";

  async function download() {
    setBusy(true);
    const params = recordFiltersToParams(filters);
    const query = params.toString();

    await runAction({
      confirm: false,
      pending: "กำลังสร้างไฟล์ Excel…",
      success: (name) => `บันทึก ${name} แล้ว`,
      failureTitle: "ส่งออก Excel ไม่สำเร็จ",
      run: async () => {
        try {
          return await downloadFile(
            `/api/record-cases/export${query ? `?${query}` : ""}`,
            "hr-record-cases.xlsx",
            "ส่งออก Excel ไม่สำเร็จ",
          );
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy || count === 0}
      title={
        count === 0
          ? "ไม่มีบันทึกเคสที่ตรงกับเงื่อนไขให้ส่งออก"
          : `ส่งออกบันทึกเคส ${scope} ${count} รายการเป็นไฟล์ Excel`
      }
      className="btn-sec flex flex-none items-center gap-1.5 px-3.5 py-1.5 text-13 font-medium text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {busy ? (
        <Loader2 size={15} strokeWidth={1.9} className="animate-spin" aria-hidden />
      ) : (
        <ExcelIcon />
      )}
      Excel
    </button>
  );
}

/** วาดเอง ไม่ได้เอาโลโก้ Microsoft มาใช้ — เหตุผลเดียวกับ `export-button.tsx` */
function ExcelIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className="flex-none text-excel"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="m8.5 13 5 5" />
      <path d="m13.5 13-5 5" />
    </svg>
  );
}
