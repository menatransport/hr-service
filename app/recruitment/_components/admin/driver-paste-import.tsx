"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { TextareaField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";
import type { PasteImportReport, PasteRowAction } from "@/app/recruitment/_lib/drivers/types";

/**
 * กล่อง “วางจาก Excel” บนหน้าทะเบียน พจส. — คัดลอกแถวจากชีต “ทะเบียน 2026” (แถวเดียวหรือหลายแถว
 * มีหรือไม่มีแถวหัวตารางก็ได้) มาวาง → **ตรวจ** (ไม่เขียน) เห็นว่าแต่ละคนจะเพิ่ม/แก้ช่องไหน → ค่อยกด **นำเข้า**
 * · ตอนนำเข้าจริงส่งข้อความเดิมขึ้นไปให้เซิร์ฟเวอร์คิดใหม่ (`paste-import.ts`)
 */

const ACTION: Record<PasteRowAction, { label: string; chip: string }> = {
  insert: { label: "เพิ่มใหม่", chip: "chip-new" },
  update: { label: "อัปเดต", chip: "chip-live" },
  same: { label: "ตรงแล้ว", chip: "chip-done" },
  skip: { label: "ข้าม", chip: "chip-wait" },
};

/** กล่องวางจาก Excel — เปิดจากเมนูของปุ่ม Excel บนหน้าทะเบียน (`XlsxMenuButton`) */
export function DriverPasteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [report, setReport] = useState<PasteImportReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (value: string, commit: boolean) =>
    requestJson<PasteImportReport>(
      "/api/drivers/paste-import",
      { method: "POST", body: { text: value, commit } },
      commit ? "นำเข้าไม่สำเร็จ" : "ตรวจข้อมูลไม่สำเร็จ",
    );

  async function check(value = text) {
    if (!value.trim()) return;
    setChecking(true);
    setError(null);
    try {
      setReport(await send(value, false));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "ตรวจข้อมูลไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      setReport(null);
      void check(value);
    } catch {
      setError("เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด — คลิกในช่องแล้วกด Ctrl+V แทน");
    }
  }

  const total = report ? report.counts.insert + report.counts.update : 0;

  async function commit() {
    if (!report || !total) return;
    const out = await runAction({
      confirm: {
        title: `นำเข้าทะเบียน ${total.toLocaleString("th-TH")} คน?`,
        text: [
          report.counts.insert ? `เพิ่มใหม่ ${report.counts.insert}` : "",
          report.counts.update ? `อัปเดต ${report.counts.update}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "primary",
      },
      pending: "กำลังนำเข้า…",
      success: (done: PasteImportReport) =>
        `นำเข้าแล้ว ${(done.counts.insert + done.counts.update).toLocaleString("th-TH")} คน`,
      run: () => send(text, true),
    });
    if (out.status !== "done") return;
    router.refresh();
    onClose();
  }

  return (
    <ModalShell
      title="วางข้อมูลจาก Excel"
      subtitle="คัดลอกแถวจากชีต “ทะเบียน 2026” — แถวเดียวหรือหลายแถว"
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
              นำเข้า {total.toLocaleString("th-TH")} คน
            </button>
          ) : (
            <button
              type="button"
              onClick={() => check()}
              disabled={!text.trim() || checking}
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
        <li>
          เลือกแถวใน Excel (คลิกเลขแถว) → <b className="text-ink">Ctrl+C</b> → วางในช่องด้านล่าง · ติดแถวหัวตารางมาด้วยก็ได้
        </li>
        <li>นำเข้าเฉพาะช่องที่ทะเบียนเก็บ · ช่องว่างไม่ลบค่าเดิม · ช่องที่แก้บนเว็บแล้วไม่ถูกทับ</li>
      </ul>

      <div className="flex flex-col gap-2">
        <TextareaField
          id="driver-paste"
          label="ข้อมูลที่วาง"
          value={text}
          onChange={(v) => {
            setText(v);
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

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 text-alert">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : null}

      {report ? <PasteReport report={report} /> : null}
    </ModalShell>
  );
}

function PasteReport({ report }: { report: PasteImportReport }) {
  return (
    <section aria-label="ผลตรวจข้อมูล" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-12-5">
        {(Object.keys(ACTION) as PasteRowAction[]).map((action) =>
          report.counts[action] ? (
            <span key={action} className={`chip ${ACTION[action].chip}`}>
              {ACTION[action].label} <b className="tabular-nums">{report.counts[action].toLocaleString("th-TH")}</b>
            </span>
          ) : null,
        )}
        <span className="text-mut">
          {report.mode === "header" ? "อ่านตามหัวตาราง" : "อ่านตามตำแหน่งคอลัมน์"} · {report.columns.join(" · ")}
        </span>
      </div>

      <div className="max-h-80 overflow-auto rounded-box border border-line">
        <table className="w-full border-collapse text-12-5">
          <thead>
            <tr className="sticky top-0 bg-head text-left">
              <th className="px-3 py-1.5 font-medium">บรรทัด</th>
              <th className="px-3 py-1.5 font-medium">รหัส</th>
              <th className="px-3 py-1.5 font-medium">ชื่อ</th>
              <th className="px-3 py-1.5 font-medium">สถานะ</th>
              <th className="px-3 py-1.5 font-medium">ผล</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.line} className="border-t border-line align-top">
                <td className="px-3 py-1.5 tabular-nums text-mut">{r.line}</td>
                <td className="px-3 py-1.5 tabular-nums">{r.code || "—"}</td>
                <td className="px-3 py-1.5">{r.name || "—"}</td>
                <td className="px-3 py-1.5 text-mut">{r.status || "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className={`chip ${ACTION[r.action].chip} self-start`}>{ACTION[r.action].label}</span>
                    {r.reason ? <span className="text-mut">{r.reason}</span> : null}
                    {r.changes.length ? <span className="text-mut">{r.changes.join(" · ")}</span> : null}
                    {r.kept.length ? <span className="text-mut">คงค่าบนเว็บ: {r.kept.join(" · ")}</span> : null}
                    {r.notes.map((n) => (
                      <span key={n} className="text-st-wait-ink">⚠ {n}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
