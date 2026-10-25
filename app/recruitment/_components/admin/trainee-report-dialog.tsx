"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";

import { DateField, TextareaField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { todayInBangkok } from "@/lib/record-case-flow";

/**
 * กล่อง “คัดลอกสรุปฝึกงาน” — ข้อความรายงานสถานะฝึกงานประจำวัน (RC Alert) ตาม template ฝ่ายบุคคล
 * ประกอบที่เซิร์ฟเวอร์ (`trainee-report.ts`) · แก้ข้อความก่อนคัดลอกได้ (ไม่บันทึกกลับ)
 */
export function TraineeReportDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayInBangkok());
  /* ผลของวันไหน (`date`) — ยังไม่ตรงกับวันที่เลือก = กำลังโหลด · ข้อความที่แก้เองผูกกับวันเดียวกัน */
  const [result, setResult] = useState<{ date: string; text: string; error: string } | null>(null);
  const [edited, setEdited] = useState<{ date: string; text: string } | null>(null);
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    requestJson<{ text: string }>(`/api/recruitment/trainee-report?date=${date}`, {}, "สรุปรายงานไม่สำเร็จ")
      .then((res) => alive && setResult({ date, text: res.text, error: "" }))
      .catch(
        (err) =>
          alive && setResult({ date, text: "", error: err instanceof Error ? err.message : "สรุปรายงานไม่สำเร็จ" }),
      );
    return () => {
      alive = false;
    };
  }, [date]);

  const loading = Boolean(date) && result?.date !== date;
  const text = edited?.date === date ? edited.text : result?.date === date ? result.text : "";
  const failure = copyError || (result?.date === date ? result.error : "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วคัดลอกเองได้");
    }
  }

  return (
    <ModalShell
      title="สรุปฝึกงานประจำวัน"
      subtitle={<span className="text-12 text-mut">ข้อความสำหรับส่งกลุ่มไลน์ · แก้ได้ก่อนคัดลอก</span>}
      onClose={onClose}
      width="620px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-4 py-2 text-13">
            ปิด
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={loading || !text}
            className="btn-pri flex items-center gap-1.5 px-4 py-2 text-13 font-medium disabled:opacity-60"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
          </button>
        </>
      }
    >
      <DateField id="trainee-report-date" label="วันที่รายงาน" value={date} onChange={setDate} />
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-mut" aria-hidden />
        </div>
      ) : (
        <TextareaField
          id="trainee-report-text"
          label="ข้อความ"
          value={text}
          onChange={(v) => setEdited({ date, text: v })}
          rows={16}
        />
      )}
      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}
    </ModalShell>
  );
}
