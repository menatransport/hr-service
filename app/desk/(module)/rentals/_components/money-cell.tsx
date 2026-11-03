"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { requestJson } from "@/lib/http";
import { BILL_FIELD_LABEL, type BillField } from "@/lib/rentals/types";
import { toastError } from "@/lib/swal";

const parse = (text: string): number | null | "bad" => {
  const t = text.replace(/[,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "bad";
};
const show = (v: number | null) => (v == null ? "" : v.toLocaleString("th-TH", { maximumFractionDigits: 2 }));

/**
 * ช่องกรอกบิลของห้อง (ค่าไฟ/น้ำ/ส่วนกลาง · ค่าห้องเดือนนี้ในแผงห้อง) — พิมพ์แล้วออกจากช่อง (Tab/Enter/คลิกที่อื่น) = บันทึกทันที
 * · Esc = คืนค่าเดิม · ไม่มีปุ่มบันทึกแยก เพราะงานนี้คือไล่กรอกทีละบิลทั้งเดือน
 */
export function MoneyCell({
  month,
  roomId,
  field,
  value,
  label,
  placeholder = "—",
  className = "",
}: {
  month: string;
  roomId: string;
  field: BillField;
  value: number | null;
  label?: string;
  /** ข้อความตอนช่องว่าง — ค่าห้องเดือนนี้ว่าง = ใช้ค่าห้องตามสัญญา */
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(show(value));
  const [synced, setSynced] = useState(value);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  // ค่าจากเซิร์ฟเวอร์เปลี่ยน (รีเฟรช/เปลี่ยนเดือน) — ตามให้ทันในรอบ render เดียวกัน
  if (synced !== value) {
    setSynced(value);
    setText(show(value));
  }

  async function commit() {
    const next = parse(text);
    if (next === "bad") {
      toastError("กรอกเป็นตัวเลขเท่านั้น");
      setText(show(value));
      return;
    }
    if (next === value) {
      setText(show(value));
      return;
    }
    setSaving(true);
    try {
      await requestJson("/api/rentals/bills", { method: "PUT", body: { month, roomId, [field]: next } });
      setText(show(next));
      startTransition(() => router.refresh());
    } catch (err) {
      toastError("บันทึกไม่สำเร็จ", err instanceof Error ? err.message : undefined);
      setText(show(value));
    } finally {
      setSaving(false);
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={label ?? BILL_FIELD_LABEL[field]}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(show(value));
          e.currentTarget.blur();
        }
      }}
      disabled={saving}
      className={`field-ring h-8 w-full min-w-0 rounded-field border border-transparent bg-transparent px-2 text-right text-13 tabular-nums transition-colors placeholder:text-mut/60 hover:border-line hover:bg-base-100 focus:border-primary/60 focus:bg-base-100 disabled:opacity-50 ${className}`}
    />
  );
}
