"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FileUp, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { NumberField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import { StatusPill } from "@/app/recruitment/_components/status-pill";
import type {
  ApplicationSummary,
  ImportReport,
  ImportSkipReason,
} from "@/app/recruitment/_lib/types";

/**
 * ปุ่ม + กล่อง “นำเข้าจาก Google Form” บนแท็บผู้สมัคร
 *
 * สองจังหวะเสมอ: **ตรวจไฟล์** (ไม่เขียนอะไร) → เห็นตัวเลขว่าจะได้กี่ใบ สถานะอะไร
 * ข้ามกี่แถวเพราะอะไร → ค่อยกด **นำเข้า** · ตัวนำเข้าตัวเดียวกับที่ใช้ลงข้อมูลรอบแรก
 * (`form-import.ts`) กติกาจึงตรงกันทุกครั้ง และแถวที่เคยนำเข้าแล้วถูกข้ามให้เอง
 * อัปไฟล์ที่ export ใหม่ทั้งชีตซ้ำได้โดยไม่เกิดใบซ้ำ
 *
 * ไฟล์ไม่ได้ถูกเก็บไว้ที่ไหน — ตอนนำเข้าจริงส่งไฟล์เดิมขึ้นไปอีกรอบแล้วเซิร์ฟเวอร์
 * คำนวณใหม่ทั้งหมด ไม่ได้เชื่อผลตรวจที่หน้าจอถืออยู่ (ระหว่างนั้นอาจมีใบใหม่เข้ามา)
 *
 * `<input type="file">` ดิบเป็นข้อยกเว้นที่ CLAUDE.md อนุญาต (ท่าเดียวกับ
 * `attachment-field.tsx`) — ซ่อนด้วย `sr-only` แล้วให้ปุ่มจริงเป็นตัวกด
 */

const MAX_MB = 10;

const SKIP_LABEL: Record<ImportSkipReason, string> = {
  already_imported: "นำเข้าไปแล้วรอบก่อน",
  resigned: "พ้นสภาพแล้ว",
  not_found_old: "ไม่พบในทะเบียน และเก่ากว่ากำหนด",
  duplicate: "ส่งซ้ำ — เก็บใบล่าสุด",
  invalid: "อ่านชื่อหรือเวลาส่งไม่ได้",
};

const MATCH_LABEL = { "name+phone": "ชื่อ+เบอร์", name: "ชื่อ", phone: "เบอร์" } as const;

export function FormImportButton({
  onImported,
}: {
  /** รายการใบสมัครชุดใหม่หลังนำเข้า — ตารางเอาไปแทนของเดิมทั้งชุด */
  onImported: (rows: ApplicationSummary[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-sec flex items-center gap-1.5 px-2 py-0.5 transition-colors hover:border-primary/40 hover:text-ink"
      >
        <FileUp size={13} strokeWidth={2} aria-hidden className="flex-none" />
        นำเข้าจาก Google Form
      </button>
      {open ? (
        <FormImportDialog onClose={() => setOpen(false)} onImported={onImported} />
      ) : null}
    </>
  );
}

function FormImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (rows: ApplicationSummary[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recentDays, setRecentDays] = useState<number | null>(5);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = Math.min(60, Math.max(1, recentDays ?? 5));

  function pick(next: File | undefined) {
    setReport(null);
    setError(null);
    if (!next) return;
    if (!/\.xlsx$/i.test(next.name)) {
      setError("รับเฉพาะไฟล์ .xlsx ที่ดาวน์โหลดจาก Google Sheets");
      return;
    }
    if (next.size > MAX_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_MB} MB`);
      return;
    }
    setFile(next);
  }

  const body = (commit: boolean) => {
    const form = new FormData();
    form.set("file", file as File);
    form.set("recentDays", String(days));
    form.set("commit", commit ? "true" : "false");
    return form;
  };

  /* ตรวจไฟล์ไม่เขียนอะไรลงฐาน — ไม่ผ่าน `runAction` เพราะไม่ต้องถามยืนยัน
     และผลแสดงอยู่ในกล่องนี้เอง · ข้อผิดพลาดขึ้นในกล่องเดียวกันแทนกล่องเด้ง */
  async function check() {
    if (!file) return;
    setChecking(true);
    setError(null);
    try {
      setReport(
        await requestJson<ImportReport>(
          "/api/recruitment/import",
          { method: "POST", body: body(false) },
          "ตรวจไฟล์ไม่สำเร็จ",
        ),
      );
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "ตรวจไฟล์ไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  const total = report
    ? report.counts.training + report.counts.working + report.counts.pending_contact
    : 0;

  async function commit() {
    if (!file || !report || !total) return;
    const out = await runAction({
      confirm: {
        title: `นำเข้าใบสมัคร ${total.toLocaleString("th-TH")} ใบ?`,
        text: "ย้อนกลับได้ด้วยการลบทั้งรอบ (importBatch) เท่านั้น — ตรวจตัวเลขในกล่องให้แน่ใจก่อน",
        tone: "primary",
      },
      pending: "กำลังนำเข้า…",
      loud: true,
      success: (done: ImportReport) =>
        `นำเข้าแล้ว ${(
          done.counts.training +
          done.counts.working +
          done.counts.pending_contact
        ).toLocaleString("th-TH")} ใบ`,
      run: () =>
        requestJson<ImportReport>(
          "/api/recruitment/import",
          { method: "POST", body: body(true) },
          "นำเข้าไม่สำเร็จ",
        ),
    });
    if (out.status !== "done") return;

    /* อ่านรายการใหม่จากฐานจริง ไม่ประกอบแถวเองจากผลนำเข้า — ตารางต้องตรงกับที่
       บันทึกไว้ ไม่ใช่กับสิ่งที่หน้าจอคิดว่าบันทึก */
    try {
      onImported(await requestJson<ApplicationSummary[]>("/api/recruitment/applications"));
    } catch {
      window.location.reload();
    }
    onClose();
  }

  const skippedRows = report
    ? (Object.entries(report.skipped) as [ImportSkipReason, number][]).filter(([, n]) => n > 0)
    : [];
  const incoming = report?.rows.filter((r) => r.outcome) ?? [];
  const weak = incoming.filter((r) => r.matchedBy === "name" || r.matchedBy === "phone");

  return (
    <ModalShell
      title="นำเข้าใบสมัครจาก Google Form"
      subtitle="ไฟล์ .xlsx ที่ดาวน์โหลดจากชีต “การตอบแบบฟอร์ม 1”"
      onClose={onClose}
      width="820px"
      tone="plain"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="btn-sec px-3.5 py-2 text-13 transition-colors hover:bg-base-200"
          >
            ปิด
          </button>
          {report ? (
            <button
              type="button"
              onClick={commit}
              disabled={!total}
              className="btn-pri px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              นำเข้า {total.toLocaleString("th-TH")} ใบ
            </button>
          ) : (
            <button
              type="button"
              onClick={check}
              disabled={!file || checking}
              className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
              {checking ? "กำลังตรวจไฟล์…" : "ตรวจไฟล์"}
            </button>
          )}
        </>
      }
    >
      {/* ───────────────────────────── กติกา — ให้เห็นก่อนเลือกไฟล์ทุกครั้ง */}
      <ul className="flex list-disc flex-col gap-1 rounded-box border border-line bg-base-200/40 py-3 pr-4 pl-8 text-12-5 text-mut">
        <li>
          เทียบกับทะเบียน พจส. ด้วยชื่อ-นามสกุล หรือเบอร์โทร — ฝึกงานอยู่ = <b className="text-ink">เริ่มฝึกงาน</b> ·
          ทำงานอยู่ = <b className="text-ink">ปฏิบัติงาน</b> · พ้นสภาพแล้ว = ไม่นำเข้า
        </li>
        <li>
          ไม่พบในทะเบียน — นำเข้าเป็น <b className="text-ink">รอการติดต่อ</b> เฉพาะใบที่ส่งมาภายในจำนวนวันที่ตั้งไว้
        </li>
        <li>แถวที่เคยนำเข้าแล้วถูกข้ามให้เอง อัปไฟล์ทั้งชีตซ้ำได้</li>
      </ul>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <span className="text-12-5 font-medium">ไฟล์ Excel</span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex min-h-[42px] items-center gap-2 rounded-field border border-dashed border-line-strong bg-base-100 px-3.5 py-2 text-left text-13 transition-colors hover:border-primary/50"
          >
            <FileSpreadsheet size={17} strokeWidth={1.8} aria-hidden className="flex-none text-primary" />
            <span className={`truncate ${file ? "text-ink" : "text-mut"}`}>
              {file ? file.name : "เลือกไฟล์ .xlsx"}
            </span>
          </button>
        </div>
        <NumberField
          id="import-recent-days"
          label="ใบใหม่ย้อนหลัง (วัน)"
          value={recentDays}
          onChange={(v) => {
            setRecentDays(v);
            setReport(null);
          }}
          placeholder="5"
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : null}

      {report ? (
        <section aria-label="ผลตรวจไฟล์" className="flex flex-col gap-3">
          <p className="text-12-5 text-mut">
            ชีต “{report.sheet}” · อ่านได้ {report.totalRows.toLocaleString("th-TH")} แถว · ใบใหม่ย้อนหลัง{" "}
            {report.recentDays} วัน
          </p>

          <div className="grid grid-cols-3 gap-2">
            {(["working", "training", "pending_contact"] as const).map((status) => (
              <div key={status} className="flex flex-col gap-1.5 rounded-box border border-line px-3 py-2.5">
                <StatusPill status={status} className="self-start" />
                <span className="text-22 font-semibold tabular-nums">
                  {report.counts[status].toLocaleString("th-TH")}
                </span>
              </div>
            ))}
          </div>

          {skippedRows.length ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-12-5 text-mut">
              <span className="font-medium text-ink">ข้าม</span>
              {skippedRows.map(([reason, n]) => (
                <span key={reason}>
                  {SKIP_LABEL[reason]} <span className="tabular-nums">{n.toLocaleString("th-TH")}</span>
                </span>
              ))}
            </div>
          ) : null}

          {report.warnings.length || weak.length ? (
            <ul className="flex flex-col gap-1 rounded-box border border-st-wait-line bg-st-wait px-3 py-2 text-12-5 text-st-wait-ink">
              {weak.length ? (
                <li>
                  จับคู่ด้วยชื่อหรือเบอร์อย่างเดียว {weak.length} ใบ — ตรวจรายชื่อด้านล่าง (แถบเหลือง)
                </li>
              ) : null}
              {report.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}

          {incoming.length ? (
            <div className="max-h-72 overflow-auto rounded-box border border-line">
              <table className="w-full border-collapse text-12-5">
                <thead>
                  <tr className="sticky top-0 bg-head text-left">
                    <th className="px-3 py-1.5 font-medium">แถว</th>
                    <th className="px-3 py-1.5 font-medium">ชื่อ</th>
                    <th className="px-3 py-1.5 font-medium">สถานะ</th>
                    <th className="px-3 py-1.5 font-medium">พจส. ที่ตรงกัน</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((r) => (
                    <tr
                      key={r.row}
                      className={`border-t border-line ${
                        r.matchedBy === "name" || r.matchedBy === "phone" ? "bg-st-wait/60" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 tabular-nums text-mut">{r.row}</td>
                      <td className="px-3 py-1.5">{r.fullName}</td>
                      <td className="px-3 py-1.5">
                        {r.outcome ? <StatusPill status={r.outcome} /> : null}
                      </td>
                      <td className="px-3 py-1.5 text-mut">
                        {r.driverCode ? (
                          <>
                            {r.driverCode} {r.driverName}
                            {r.matchedBy ? ` · ${MATCH_LABEL[r.matchedBy]}` : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-13 text-mut">ไม่มีใบที่ต้องนำเข้าจากไฟล์นี้</p>
          )}
        </section>
      ) : null}
    </ModalShell>
  );
}
