"use client";

import { EXIT_TYPES, type ExitType } from "@/app/recruitment/_lib/resign-reasons/types";

/**
 * ตัวเลือกประเภทการออก (Vol / Inv / Disap) แบบปุ่มแบ่งช่อง — สามตัวเลือกตายตัว
 * เห็นครบทุกตัวในแวบเดียวดีกว่าดรอปดาวน์ที่ต้องกดเปิดก่อน
 *
 * ใช้สองที่: ฟอร์มพ้นสภาพในทะเบียน พจส. และฟอร์มหมวด/รหัสในหน้าตั้งค่า
 */
export function ExitTypePicker({
  value,
  onChange,
  label = "ประเภทการออก",
  hint,
}: {
  value: ExitType | "";
  onChange: (next: ExitType) => void;
  label?: string;
  hint?: string;
}) {
  const active = EXIT_TYPES.find((t) => t.value === value);

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-12-5 font-medium text-mut">{label}</span>
      <div className="grid grid-cols-3 gap-1 rounded-field border border-line bg-base-200 p-1">
        {EXIT_TYPES.map((t) => {
          const on = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(t.value)}
              className={`flex min-h-9 cursor-pointer flex-col items-center justify-center rounded-selector px-2 py-1.5 text-center transition-colors ${
                on ? "elev-card bg-base-100 text-ink" : "text-mut hover:text-ink"
              }`}
            >
              <span className="font-mono text-11 font-semibold tracking-wide">{t.code}</span>
              <span className="text-11-5 leading-tight">{t.label}</span>
            </button>
          );
        })}
      </div>
      <span className="text-11-5 text-mut text-pretty">{hint ?? active?.hint ?? ""}</span>
    </div>
  );
}
