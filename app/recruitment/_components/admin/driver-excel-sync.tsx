"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";

import { ModalShell } from "@/components/ui/modal-shell";
import { TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/http";
import { runAction } from "@/lib/swal";

/**
 * กล่อง “Sync จากไฟล์” (เฉพาะ `next dev`) บนหน้าทะเบียน พจส. — ชี้ path ไฟล์ทะเบียนฝ่ายบุคคลบนเครื่องนี้
 * → **ตรวจ** (dry run) อ่านสรุปของ `import_driver_registry_xlsx.mjs` → ค่อยกด **อัปเดต** (`/api/drivers/excel-sync`)
 */

const PATH_KEY = "hr.driver-excel-sync.path";

function readSaved() {
  try {
    return localStorage.getItem(PATH_KEY) ?? "";
  } catch {
    return "";
  }
}

export function DriverExcelSyncDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState(readSaved);
  const [log, setLog] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const send = (apply: boolean) =>
    requestJson<{ log: string }>(
      "/api/drivers/excel-sync",
      { method: "POST", body: { path: file, apply } },
      apply ? "อัปเดตไม่สำเร็จ" : "ตรวจไฟล์ไม่สำเร็จ",
    );

  async function check() {
    setChecking(true);
    setError(null);
    try {
      setLog((await send(false)).log);
      try {
        localStorage.setItem(PATH_KEY, file);
      } catch {}
    } catch (err) {
      setLog(null);
      setError(err instanceof Error ? err.message : "ตรวจไฟล์ไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  async function apply() {
    const out = await runAction({
      confirm: { title: "อัปเดตทะเบียนจากไฟล์นี้?", text: "สำรองข้อมูลเดิมลง backups/ ก่อนเขียน", tone: "primary" },
      pending: "กำลังอัปเดต…",
      success: "อัปเดตทะเบียนแล้ว",
      run: () => send(true),
    });
    if (out.status !== "done") return;
    setLog(out.data.log);
    setApplied(true);
    router.refresh();
  }

  return (
    <ModalShell
      title="Sync จากไฟล์ Excel"
      subtitle="โหมด dev · ชีต “ทะเบียน 2026”"
      onClose={onClose}
      width="880px"
      tone="plain"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sec px-3.5 py-2 text-13">
            ปิด
          </button>
          {applied ? null : log ? (
            <button type="button" onClick={apply} className="btn-pri px-3.5 py-2 text-13 font-medium">
              อัปเดตข้อมูล
            </button>
          ) : (
            <button
              type="button"
              onClick={check}
              disabled={!file.trim() || checking}
              className="btn-pri flex items-center gap-1.5 px-3.5 py-2 text-13 font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
              {checking ? "กำลังตรวจ…" : "ตรวจไฟล์"}
            </button>
          )}
        </>
      }
    >
      <TextField
        id="driver-excel-path"
        label="path ไฟล์ .xlsx"
        value={file}
        onChange={(v) => {
          setFile(v);
          setLog(null);
          setError(null);
          setApplied(false);
        }}
        placeholder="C:\Users\…\Downloads\[HR] ทะเบียนประวัติพจส.ลาดกระบัง Mixer.xlsx"
      />

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-box bg-alert-soft px-3 py-2 text-12-5 whitespace-pre-wrap text-alert">
          <TriangleAlert size={15} strokeWidth={2} aria-hidden className="mt-0.5 flex-none" />
          {error}
        </p>
      ) : null}

      {log ? (
        <pre className="max-h-96 overflow-auto rounded-box border border-line bg-base-200/40 p-3 text-12 leading-relaxed whitespace-pre-wrap">
          {log}
        </pre>
      ) : null}
    </ModalShell>
  );
}
