"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** เลขที่ JR — กดเลขเปิดฟอร์มข้อมูล JR · ไอคอนข้าง ๆ คัดลอกเลข (ไม่ใช่ลิงก์ไปหน้าอื่น) */
export function JrCell({ code, onOpen }: { code: string; onOpen: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด — เลขยังลากเลือกเองได้ */
    }
  }

  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        title="เปิดข้อมูล JR"
        className="rounded-selector px-1 py-0.5 font-mono text-12 whitespace-nowrap tracking-wider text-primary transition-colors hover:bg-base-200"
      >
        {code}
      </button>
      <button
        type="button"
        onClick={copy}
        title="คัดลอกเลขที่ JR"
        className="inline-flex size-6 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-primary"
      >
        {copied ? (
          <Check size={12} strokeWidth={2.5} aria-hidden className="text-primary" />
        ) : (
          <Copy size={12} strokeWidth={2} aria-hidden />
        )}
        <span className="sr-only">{copied ? "คัดลอกแล้ว" : `คัดลอก ${code}`}</span>
      </button>
    </span>
  );
}
