"use client";

import { useEffect, useState } from "react";
import { BellRing, Check, Copy, Eye, Loader2, Pencil, RotateCcw, TriangleAlert } from "lucide-react";

import { DateField } from "@/components/ui/field";
import { ModalShell } from "@/components/ui/modal-shell";
import { requestJson } from "@/lib/http";
import { todayInBangkok } from "@/lib/record-case-flow";
import type { TraineeReportSummary } from "@/app/recruitment/_lib/drivers/trainee-report";

type Result = { date: string; text: string; summary: TraineeReportSummary | null; error: string };

/**
 * กล่อง “RC Alert ส่งไลน์” — ข้อความรายงานสถานะฝึกงานประจำวันตาม template ฝ่ายบุคคล
 * ประกอบที่เซิร์ฟเวอร์ (`trainee-report.ts`) · แสดงเป็นบับเบิลแชตแบบไลน์ แก้ได้ก่อนส่ง (ไม่บันทึกกลับ)
 * · “คัดลอก” แล้วไปวางในกลุ่มไลน์เอง
 */
export function TraineeReportDialog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(todayInBangkok());
  /* ผลของวันไหน (`date`) — ยังไม่ตรงกับวันที่เลือก = กำลังโหลด · ข้อความที่แก้เองผูกกับวันเดียวกัน */
  const [result, setResult] = useState<Result | null>(null);
  const [edited, setEdited] = useState<{ date: string; text: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    requestJson<{ text: string; summary: TraineeReportSummary }>(
      `/api/recruitment/trainee-report?date=${date}`,
      {},
      "สรุปรายงานไม่สำเร็จ",
    )
      .then((res) => alive && setResult({ date, text: res.text, summary: res.summary, error: "" }))
      .catch(
        (err) =>
          alive &&
          setResult({ date, text: "", summary: null, error: err instanceof Error ? err.message : "สรุปรายงานไม่สำเร็จ" }),
      );
    return () => {
      alive = false;
    };
  }, [date]);

  const current = result?.date === date ? result : null;
  const loading = Boolean(date) && !current;
  const isEdited = edited?.date === date && edited.text !== current?.text;
  const text = edited?.date === date ? edited.text : (current?.text ?? "");
  const failure = copyError || current?.error || "";
  const summary = current?.summary ?? null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("คัดลอกไม่สำเร็จ — กดแก้ไขแล้วเลือกข้อความคัดลอกเองได้");
    }
  }

  return (
    <ModalShell
      title="RC Alert · ส่งกลุ่มไลน์"
      subtitle={<span className="text-12 text-mut">รายงานสถานะฝึกงานประจำวัน · ตรวจ/แก้ก่อนส่งได้</span>}
      onClose={onClose}
      width="640px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec mr-auto px-4 py-2 text-13">
            ปิด
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={loading || !text}
            className="flex cursor-pointer items-center gap-1.5 rounded-field bg-chat px-4 py-2 text-13 font-semibold text-white shadow-[0_4px_12px_-6px] shadow-chat transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 flex-none">
          <DateField id="trainee-report-date" label="วันที่รายงาน" value={date} onChange={setDate} />
        </div>
        <ul aria-label="สรุป" className="flex flex-wrap gap-1.5 pb-1">
          <SummaryChip label="Issue" value={summary?.issues} tone={summary?.issues ? "alert" : "ok"} />
          <SummaryChip label="เริ่มงานใหม่" value={summary?.starters} tone="info" />
          <SummaryChip label="รอรับรถ" value={summary?.waiting} tone="primary" />
        </ul>
      </div>

      {/* หน้าแชตจำลอง — ให้เห็นว่าข้อความจะขึ้นในกลุ่มไลน์หน้าตาแบบไหน */}
      <section className="flex flex-none flex-col overflow-hidden rounded-box border border-chat/25 bg-chat/6">
        <header className="flex items-center gap-2.5 border-b border-chat/20 bg-chat/10 px-3.5 py-2.5">
          <span className="grid size-8 flex-none place-items-center rounded-full bg-chat text-white">
            <BellRing size={15} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-13 font-semibold">กลุ่มไลน์ RC · ฝ่ายบุคคล</span>
            <span className="text-11 text-mut">ตัวอย่างก่อนส่ง</span>
          </span>
          <span className="ml-auto flex items-center gap-1">
            {isEdited ? (
              <button
                type="button"
                onClick={() => setEdited(null)}
                title="คืนข้อความจากระบบ"
                className="btn-ghost flex items-center gap-1 px-2 py-1 text-12"
              >
                <RotateCcw size={13} aria-hidden />
                คืนค่า
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              disabled={loading}
              aria-pressed={editing}
              className="btn-sec flex items-center gap-1 px-2.5 py-1 text-12 font-medium disabled:opacity-60"
            >
              {editing ? <Eye size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
              {editing ? "ดูตัวอย่าง" : "แก้ไข"}
            </button>
          </span>
        </header>

        <div className="max-h-[52vh] min-h-56 overflow-y-auto px-3.5 py-4">
          {loading ? (
            <div className="ml-auto w-4/5 animate-pulse space-y-2 rounded-2xl rounded-tr-md bg-base-100 p-4">
              {[90, 70, 82, 55, 76, 40].map((w) => (
                <div key={w} className="h-2.5 rounded-full bg-base-300" style={{ width: `${w}%` }} />
              ))}
              <Loader2 size={14} className="mx-auto mt-3 animate-spin text-mut" aria-hidden />
            </div>
          ) : editing ? (
            <textarea
              id="trainee-report-text"
              aria-label="ข้อความ"
              value={text}
              onChange={(e) => setEdited({ date, text: e.target.value })}
              rows={16}
              className="field-ring block w-full resize-y rounded-field border border-line bg-base-100 px-3 py-2.5 text-13 leading-relaxed"
            />
          ) : text ? (
            <div className="flex items-end justify-end gap-1.5">
              <span className="flex-none pb-0.5 text-right text-10-5 leading-tight text-mut">
                {isEdited ? "แก้แล้ว" : "จากระบบ"}
              </span>
              <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[color-mix(in_oklab,var(--color-chat)_24%,var(--color-base-100))] px-4 py-3 text-13 leading-relaxed text-base-content shadow-sm">
                {text}
              </p>
            </div>
          ) : (
            <p className="py-10 text-center text-13 text-mut">ไม่มีข้อความ</p>
          )}
        </div>
      </section>

      {failure ? (
        <p role="alert" className="flex items-start gap-2 rounded-field bg-alert/10 px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={14} strokeWidth={1.9} aria-hidden className="mt-0.5 flex-none" />
          {failure}
        </p>
      ) : null}
    </ModalShell>
  );
}

const CHIP_TONE = {
  alert: "bg-alert/10 text-alert",
  ok: "bg-chat/12 text-chat-ink",
  info: "bg-info/10 text-info",
  primary: "bg-primary/10 text-primary",
} as const;

function SummaryChip({ label, value, tone }: { label: string; value?: number; tone: keyof typeof CHIP_TONE }) {
  return (
    <li className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 font-medium ${CHIP_TONE[tone]}`}>
      {label}
      <span className="min-w-4 text-center font-semibold tabular-nums">{value ?? "–"}</span>
    </li>
  );
}
