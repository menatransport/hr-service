"use client";

import { useState } from "react";
import { Loader2, ScanText, X } from "lucide-react";

import { toastError } from "@/lib/swal";
import { mediaKeyOf } from "@/lib/media";
import { readImageText, type ScanStep } from "@/app/recruitment/_lib/id-card-ocr";

/**
 * “ดึงข้อความ” ของรูปเอกสารหนึ่งใบ — ปุ่มม่วงโปร่ง + กล่องข้อความให้แอดมินเลือกคัดลอก
 * (Bew 8 พ.ย. 2569 · อยู่ในกล่อง “เอกสารและข้อมูลจากเอกสาร”)
 *
 * อ่านในเบราว์เซอร์ทั้งหมด (`readImageText` — tesseract ไทย+อังกฤษ) รูปไม่ออกไปไหน ·
 * ไฟล์ของระบบดึงผ่าน `/api/media/{key}?raw=1` (ต้นทางเดียวกัน อ่านพิกเซลได้ ไม่ติด CORS ของ
 * bucket) · ข้อความไม่ถูกบันทึกที่ไหน แก้ในกล่องได้เพื่อเกลาก่อนคัดลอก
 */

type State =
  | { status: "reading"; url: string; step: ScanStep }
  | { status: "done"; url: string; text: string };

const STEP_LABEL: Partial<Record<ScanStep, string>> = {
  load: "เตรียมตัวอ่าน…",
  text: "กำลังอ่านรูป…",
  rotate: "ลองหมุนรูป…",
};

function rawUrl(url: string): string {
  return mediaKeyOf(url) ? `${url}${url.includes("?") ? "&" : "?"}raw=1` : url;
}

/** สถานะการอ่านของรูป `url` — เปลี่ยนรูปแล้วผลเก่าหายเอง (ผูกกับ url ที่อ่าน) */
export function useImageText(url: string | null) {
  const [state, setState] = useState<State | null>(null);
  const current = state && state.url === url ? state : null;

  async function read() {
    if (!url) return;
    setState({ status: "reading", url, step: "load" });
    try {
      const res = await fetch(rawUrl(url));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `โหลดรูปไม่สำเร็จ (${res.status})`);
      }
      const text = await readImageText(await res.blob(), (step) =>
        setState((prev) => (prev?.status === "reading" && prev.url === url ? { ...prev, step } : prev)),
      );
      setState((prev) => (prev?.url === url ? { status: "done", url, text } : prev));
    } catch (err) {
      setState(null);
      toastError("ดึงข้อความไม่สำเร็จ", err instanceof Error ? err.message : undefined);
    }
  }

  return {
    state: current,
    read,
    setText: (text: string) => setState((prev) => (prev?.status === "done" ? { ...prev, text } : prev)),
    clear: () => setState(null),
  };
}

/** ปุ่มม่วงโปร่ง — ระหว่างอ่านบอกขั้นจริงจากตัวอ่าน */
export function ImageTextButton({ state, onClick }: { state: State | null; onClick: () => void }) {
  const reading = state?.status === "reading";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={reading}
      title="อ่านข้อความทั้งหมดบนรูปนี้ แล้วเลือกคัดลอก"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-ocr/25 bg-ocr/10 px-3 py-1.5 text-12 font-medium text-ocr-ink shadow-[0_2px_10px_-4px] shadow-ocr/40 backdrop-blur-sm transition-[background-color,border-color,box-shadow,translate] duration-200 hover:-translate-y-px hover:border-ocr/45 hover:bg-ocr/16 hover:shadow-[0_6px_16px_-6px] hover:shadow-ocr/50 active:translate-y-0 disabled:cursor-wait disabled:hover:translate-y-0"
    >
      {reading ? (
        <Loader2 size={13} strokeWidth={2.2} aria-hidden className="animate-spin" />
      ) : (
        <ScanText size={13} strokeWidth={2} aria-hidden />
      )}
      {reading ? (STEP_LABEL[state.step] ?? "กำลังอ่าน…") : state ? "อ่านใหม่" : "ดึงข้อความ"}
    </button>
  );
}

/** ข้อความที่อ่านได้ — แก้/ลากเลือกแล้วคัดลอกเอง (ไม่มีปุ่มคัดลอกทั้งหมด — Bew) */
export function ImageTextPanel({
  label,
  text,
  onChange,
  onClose,
}: {
  label: string;
  text: string;
  onChange: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-box border border-ocr/20 bg-ocr/6 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ScanText size={14} strokeWidth={2} aria-hidden className="text-ocr-ink" />
        <span className="text-12-5 font-semibold text-ocr-ink">ข้อความจาก{label}</span>
        <span className="text-11-5 text-mut">อ่านอัตโนมัติ ตรวจก่อนใช้ · ไม่บันทึกลงระบบ</span>
        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดข้อความ"
            className="flex size-7 cursor-pointer items-center justify-center rounded-full text-mut transition-colors hover:bg-ocr/12 hover:text-ocr-ink"
          >
            <X size={14} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(12, Math.max(4, text.split("\n").length + 1))}
        placeholder="ไม่พบข้อความที่อ่านได้ชัดบนรูปนี้ — ลองถ่ายใหม่ให้ตรงและสว่างขึ้น"
        spellCheck={false}
        className="w-full resize-y rounded-field border border-ocr/20 bg-base-100 px-3 py-2 text-13 leading-relaxed outline-none transition-colors focus:border-ocr/50 focus:ring-2 focus:ring-ocr/15"
      />
    </div>
  );
}
