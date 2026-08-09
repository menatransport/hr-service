"use client";

import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "hrs-theme";

/**
 * สลับธีมสว่าง / มืด — เขียน `data-theme` ที่ `<html>` ตรง ๆ แล้วจำไว้ใน
 * localStorage (`app/layout.tsx` อ่านค่านี้ก่อน paint แรก)
 *
 * ตัวไอคอนไม่ได้ผูกกับ React state เลย — หน้าตาเปลี่ยนด้วย CSS ที่มองจาก
 * attribute บน root (`.theme-icon-*` ใน globals.css) จึงไม่มี hydration
 * mismatch และไม่กระพริบตอน mount
 */
function toggle() {
  const root = document.documentElement;
  const next = root.dataset.theme === "hrs-dark" ? "hrs" : "hrs-dark";
  root.dataset.theme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* โหมดส่วนตัวของบางเบราว์เซอร์ปิด localStorage — ธีมยังสลับได้ตามปกติ */
  }
}

/** ไอคอนสองชั้นที่สลับกันด้วย CSS — ใช้ร่วมกันทั้งสองแบบของปุ่ม */
function ThemeIcons({ size = 18 }: { size?: number }) {
  return (
    <span className="relative grid place-items-center transition-transform duration-300 group-hover:scale-115 group-hover:-rotate-12">
      <Sun size={size} strokeWidth={1.6} className="theme-icon theme-icon-sun" aria-hidden />
      <Moon size={size} strokeWidth={1.6} className="theme-icon theme-icon-moon" aria-hidden />
    </span>
  );
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggle}
      title="สลับธีมสว่าง / มืด"
      aria-label="สลับธีมสว่าง / มืด"
      className="group relative flex size-9 items-center justify-center rounded-selector text-mut transition-colors hover:bg-base-200 hover:text-ink"
    >
      {/* วงเรืองแสงบาง ๆ ตอน hover — ใช้ soft ซึ่งเป็น primary ผสมพื้นหลัง */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-75 rounded-selector bg-soft opacity-0 transition-all duration-300 group-hover:scale-100 group-hover:opacity-100"
      />
      <ThemeIcons />
    </button>
  );
}

/**
 * แบบแถวเต็มความกว้าง สำหรับรายการ “อื่น ๆ” ในหน้าโปรไฟล์ฝั่งมือถือ
 * ข้อความก็สลับด้วย CSS เช่นกัน เพื่อไม่ให้ต่างกันระหว่าง server กับ client
 */
export function ThemeToggleRow() {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="สลับธีมสว่าง / มืด"
      className="flex items-center gap-3 rounded-box border border-line bg-base-100 px-3.5 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="flex-none text-mut">
        <ThemeIcons size={17} />
      </span>
      <span className="flex-1 text-[13.5px]">
        <span className="theme-label theme-label-light">โหมดสว่าง</span>
        <span className="theme-label theme-label-dark">โหมดมืด</span>
      </span>
      <span className="flex-none text-[12px] text-mut">แตะเพื่อสลับ</span>
    </button>
  );
}
