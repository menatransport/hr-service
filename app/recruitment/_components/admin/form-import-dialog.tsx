"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ClipboardPaste, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { TextareaField, TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import { StatusPill } from "@/app/recruitment/_components/status-pill";
import { formatThaiDateTime } from "@/app/recruitment/_lib/drivers/types";
import type {
  ApplicationSummary,
  ImportOutcome,
  ImportReport,
  ImportRow,
  ImportSkipReason,
} from "@/app/recruitment/_lib/types";

/**
 * กล่อง Sync ใบสมัครจาก Google Form (ชีต “การตอบแบบฟอร์ม 1”) — เปิดจากเมนูปุ่ม Excel บนหน้าผู้สมัคร
 * - `path` (เฉพาะ `next dev`) — ชี้ path ไฟล์ .xlsx บนเครื่องนี้ · ใบใหม่ = ส่งหลังใบล่าสุดที่เคยนำเข้า
 * - `paste` — คัดลอกแถวจากชีตมาวาง (ทุกแถวที่วาง = ใบใหม่)
 *
 * สองจังหวะเสมอ: **ตรวจ** (ไม่เขียน) → **นำเข้า** ส่งข้อมูลเดิมขึ้นไปให้เซิร์ฟเวอร์คิดใหม่ (`form-import.ts`)
 * · แถวที่เคยนำเข้าแล้ว/คนที่มีใบในระบบแล้วถูกข้ามให้เอง Sync ซ้ำได้
 */

export type FormSyncMode = "path" | "paste";

const PATH_KEY = "hr.candidate-form-sync.path";

const SKIP_LABEL: Record<ImportSkipReason, string> = {
  already_imported: "มีในระบบแล้ว",
  resigned: "พ้นสภาพแล้ว (ใบเก่า)",
  not_found_old: "ใบเก่าก่อน Sync ครั้งก่อน",
  duplicate: "ส่งซ้ำ — เก็บใบล่าสุด",
  invalid: "อ่านชื่อหรือเวลาส่งไม่ได้",
};

const MATCH_LABEL = { "name+phone": "ชื่อ+เบอร์", name: "ชื่อ", phone: "เบอร์" } as const;

const TILES: ImportOutcome[] = ["pending_contact", "training", "working", "blacklist"];

function readSaved() {
  try {
    return localStorage.getItem(PATH_KEY) ?? "";
  } catch {
    return "";
  }
}

function BlacklistChip() {
  return (
    <span className="chip chip-alert inline-flex items-center gap-1 self-start">
      <Ban size={11} strokeWidth={2.4} aria-hidden />
      Blacklist
    </span>
  );
}

function OutcomeChip({ outcome }: { outcome: ImportOutcome }) {
  return outcome === "blacklist" ? <BlacklistChip /> : <StatusPill status={outcome} />;
}

/** หมายเหตุต่อแถว — ชนกับ Blacklist มาก่อนเสมอ เพราะคือสิ่งที่คนโทรต้องรู้ก่อน */
function rowNote(r: ImportRow): { text: string; alert: boolean } {
  if (r.blacklistHit) return { text: `ตรงกับ Blacklist ${r.blacklistHit}`, alert: true };
  if (r.outcome === "blacklist") return { text: `ชีต: ${r.sheetStatus ?? ""}`, alert: true };
  if (r.driverCode) {
    const by = r.matchedBy ? ` · ${MATCH_LABEL[r.matchedBy]}` : "";
    const prefix = r.outcome === "pending_contact" ? "เคยเป็น พจส. " : "";
    return { text: `${prefix}${r.driverCode} ${r.driverName}${by}`, alert: false };
  }
  return { text: "", alert: false };
}

export function FormSyncDialog({
  mode,
  onClose,
  onImported,
}: {
  mode: FormSyncMode;
  onClose: () => void;
  /** รายการใบสมัครชุดใหม่หลังนำเข้า — ตารางเอาไปแทนของเดิมทั้งชุด */
  onImported: (rows: ApplicationSummary[]) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => (mode === "path" ? readSaved() : ""));
  const [report, setReport] = useState<ImportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (input: string, commit: boolean) =>
    requestJson<ImportReport>(
      "/api/recruitment/import",
      { method: "POST", body: { [mode === "path" ? "path" : "text"]: input, commit } },
      commit ? "นำเข้าไม่สำเร็จ" : "ตรวจข้อมูลไม่สำเร็จ",
    );

  async function check(input = value) {
    if (!input.trim()) return;
    setChecking(true);
    setError(null);
    try {
      setReport(await send(input, false));
      if (mode === "path") {
        try {
          localStorage.setItem(PATH_KEY, input);
        } catch {}
      }
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "ตรวจข้อมูลไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      setValue(text);
      setReport(null);
      void check(text);
    } catch {
      setError("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — คลิกในช่องแล้วกด Ctrl+V แทน");
    }
  }

  const total = report ? TILES.reduce((n, k) => n + report.counts[k], 0) : 0;

  async function commit() {
    if (!report || !total) return;
    const out = await runAction({
      confirm: {
        title: `นำเข้าใบสมัคร ${total.toLocaleString("th-TH")} ใบ?`,
        text: "ย้อนกลับได้ด้วยการลบทั้งรอบ (importBatch) เท่านั้น",
        tone: "primary",
      },
      pending: "กำลังนำเข้า…",
      loud: true,
      success: (done: ImportReport) =>
        `นำเข้าแล้ว ${TILES.reduce((n, k) => n + done.counts[k], 0).toLocaleString("th-TH")} ใบ`,
      run: () => send(value, true),
    });
    if (out.status !== "done") return;

    /* อ่านรายการใหม่จากฐานจริง · refresh ให้รายชื่อ Blacklist ฝั่งเซิร์ฟเวอร์ตามมาด้วย */
    try {
      onImported(await requestJson<ApplicationSummary[]>("/api/recruitment/applications"));
    } catch {}
    router.refresh();
    onClose();
  }

  const skippedRows = report
    ? (Object.entries(report.skipped) as [ImportSkipReason, number][]).filter(([, n]) => n > 0)
    : [];
  const incoming = report?.rows.filter((r) => r.outcome) ?? [];
  const hits = incoming.filter((r) => r.blacklistHit).length;

  return (
    <ModalShell
      title={mode === "path" ? "Sync ใบสมัครจากไฟล์" : "วางใบสมัครจาก Excel"}
      subtitle={
        mode === "path"
          ? "โหมด dev · ชีต “การตอบแบบฟอร์ม 1”"
          : "คัดลอกแถวจากชีต “การตอบแบบฟอร์ม 1” — แถวเดียวหรือหลายแถว"
      }
      onClose={onClose}
      width="880px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-3.5 py-2 text-13">
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
              onClick={() => check()}
              disabled={!value.trim() || checking}
              className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
              {checking ? "กำลังตรวจ…" : "ตรวจข้อมูล"}
            </button>
          )}
        </>
      }
    >
      <ul className="flex list-disc flex-col gap-1 rounded-box border border-line bg-base-200/40 py-3 pr-4 pl-8 text-12-5 text-mut">
        {mode === "paste" ? (
          <li>
            คลิกเลขแถวในชีต → <b className="text-ink">Ctrl+C</b> → วางด้านล่าง · ต้องเริ่มคอลัมน์ A หรือติดแถวหัวตารางมาด้วย
          </li>
        ) : null}
        <li>
          ใบใหม่ → <b className="text-ink">รอการติดต่อ</b> · เวลาตามคอลัมน์ “ประทับเวลา” · ฝึกงาน/ทำงานอยู่ในทะเบียน พจส. ={" "}
          <b className="text-ink">ฝึกงาน</b>/<b className="text-ink">ปฏิบัติงาน</b>
        </li>
        <li>
          “สถานะสัมภาษณ์” เป็นแบล็คลิส/Black List → <b className="text-ink">ยกเลิก + Blacklist</b> · ใบใหม่ที่ชื่อ/เบอร์ตรงกันมีป้ายเตือน
        </li>
      </ul>

      {mode === "path" ? (
        <TextField
          id="candidate-sync-path"
          label="path ไฟล์ .xlsx"
          value={value}
          onChange={(v) => {
            setValue(v);
            setReport(null);
            setError(null);
          }}
          placeholder="C:\Users\…\Desktop\HR0221-04 ใบสมัครงาน พจส.xlsx"
        />
      ) : (
        <div className="flex flex-col gap-2">
          <TextareaField
            id="candidate-paste"
            label="ข้อมูลที่วาง"
            value={value}
            onChange={(v) => {
              setValue(v);
              setReport(null);
              setError(null);
            }}
            rows={6}
            mono
            placeholder="วางที่นี่ (Ctrl+V)"
          />
          <button
            type="button"
            onClick={pasteFromClipboard}
            className="btn-ghost flex items-center gap-1.5 self-start px-2 py-1 text-12-5"
          >
            <ClipboardPaste size={13} strokeWidth={2} aria-hidden />
            วางจากคลิปบอร์ด
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 whitespace-pre-wrap text-alert">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : null}

      {report ? (
        <section aria-label="ผลตรวจ" className="flex flex-col gap-3">
          <p className="text-12-5 text-mut">
            อ่านได้ {report.totalRows.toLocaleString("th-TH")} แถว
            {report.since ? ` · ใบใหม่ = ส่งหลัง ${formatThaiDateTime(report.since)} (ใบล่าสุดที่เคยนำเข้า)` : ""}
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TILES.map((k) => (
              <div key={k} className="flex flex-col gap-1.5 rounded-box border border-line px-3 py-2.5">
                <OutcomeChip outcome={k} />
                <span className="text-22 font-semibold tabular-nums">{report.counts[k].toLocaleString("th-TH")}</span>
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

          {hits ? (
            <p className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 text-alert">
              <Ban size={15} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
              ใบใหม่ {hits} ใบ ชื่อหรือเบอร์ตรงกับคนติด Blacklist — นำเข้าเป็นรอการติดต่อพร้อมป้ายเตือน
            </p>
          ) : null}

          {incoming.length ? (
            <div className="max-h-80 overflow-auto rounded-box border border-line">
              <table className="w-full border-collapse text-12-5">
                <thead>
                  <tr className="sticky top-0 bg-head text-left">
                    <th className="px-3 py-1.5 font-medium">แถว</th>
                    <th className="px-3 py-1.5 font-medium">ประทับเวลา</th>
                    <th className="px-3 py-1.5 font-medium">ชื่อ</th>
                    <th className="px-3 py-1.5 font-medium">สถานะ</th>
                    <th className="px-3 py-1.5 font-medium">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {incoming.map((r) => {
                    const note = rowNote(r);
                    return (
                      <tr key={r.row} className={`border-t border-line ${note.alert ? "bg-alert-soft/60" : ""}`}>
                        <td className="px-3 py-1.5 tabular-nums text-mut">{r.row}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-mut">
                          {formatThaiDateTime(r.submittedAt)}
                        </td>
                        <td className="px-3 py-1.5">{r.fullName}</td>
                        <td className="px-3 py-1.5">{r.outcome ? <OutcomeChip outcome={r.outcome} /> : null}</td>
                        <td className={`px-3 py-1.5 ${note.alert ? "text-alert" : "text-mut"}`}>{note.text || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-13 text-mut">ไม่มีใบใหม่ที่ต้องนำเข้า</p>
          )}

          {report.warnings.length ? (
            <details className="text-12-5 text-mut">
              <summary className="cursor-pointer">ข้อสังเกตจากไฟล์ {report.warnings.length} ข้อ</summary>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </ModalShell>
  );
}
