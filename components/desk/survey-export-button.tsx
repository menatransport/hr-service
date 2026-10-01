"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { downloadFile } from "@/lib/http";
import { runAction } from "@/lib/swal";
import {
  hasSurveyFilters,
  surveyFiltersToParams,
  type SurveyFilters,
} from "@/lib/survey-filter";

/**
 * ปุ่มส่งออก Excel ของผลแบบสอบถาม — หน้าตาและพฤติกรรมเดียวกับ
 * `export-button.tsx` / `record-export-button.tsx` แยกไฟล์เพราะผูกกับ
 * `SurveyFilters` / `/api/survey/export` คนละชุด
 *
 * **ส่งออก “สิ่งที่เห็นอยู่” ไม่ใช่ทั้งหมดเสมอ** — ตัวกรองปัจจุบันถูกส่งไปกับคำขอ
 * แล้วเซิร์ฟเวอร์กรองซ้ำด้วยกฎชุดเดียวกัน (`lib/survey-filter.ts`)
 */
export function SurveyExportButton({
  surveyId,
  filters,
  count,
}: {
  surveyId: string;
  filters: SurveyFilters;
  /** จำนวนแถวที่ตรงกับตัวกรองตอนนี้ — `0` = ไม่มีอะไรให้ส่งออก */
  count: number;
}) {
  const [busy, setBusy] = useState(false);

  const scope = hasSurveyFilters(filters) ? "ตามตัวกรองปัจจุบัน" : "ทั้งหมด";

  async function download() {
    setBusy(true);
    const params = surveyFiltersToParams(filters);
    params.set("survey_id", surveyId);

    await runAction({
      confirm: false,
      pending: "กำลังสร้างไฟล์ Excel…",
      success: (name) => `บันทึก ${name} แล้ว`,
      failureTitle: "ส่งออก Excel ไม่สำเร็จ",
      run: async () => {
        try {
          return await downloadFile(
            `/api/survey/export?${params.toString()}`,
            "hr-survey.xlsx",
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
          ? "ไม่มีคำตอบที่ตรงกับเงื่อนไขให้ส่งออก"
          : `ส่งออกผลแบบสอบถาม ${scope} ${count} คน เป็นไฟล์ Excel (ชีต Raw data + Pivot)`
      }
      className="flex flex-none items-center gap-1.5 cursor-pointer rounded-md bg-lime-600 px-3.5 py-1.5 text-14 font-semibold text-primary-content shadow-sm transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
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
