"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";

/**
 * ปุ่ม “คู่มือ” บนแถบบน — Home กับหน้าในทุกหน้า (6 พ.ย. 2569 · Bew)
 * เม็ดทอง (สีเน้นของระบบ) แบบนิ่ง ไม่มี animation — Bew ขอให้ดูทางการ
 * สูงเท่าเมนูผู้ใช้ข้าง ๆ: หน้าใน (`compact`) 40px · Home 48px / 52px ตั้งแต่ sm
 * แสดงคู่มือเฉพาะเมนูที่ผู้ใช้เห็น (กรองที่ `/desk/manual`)
 */
export function ManualButton({ compact = false }: { compact?: boolean }) {
  const here = usePathname().startsWith("/desk/manual");

  return (
    <Link
      href="/desk/manual"
      title="คู่มือการใช้งาน"
      aria-current={here ? "page" : undefined}
      className={`manual-btn flex flex-none items-center justify-center gap-2 rounded-xl font-semibold ${
        compact ? "h-10 min-w-10 px-2.5 text-13" : "h-12 min-w-12 px-3 text-14 sm:h-13 sm:px-4"
      }`}
    >
      <BookOpen size={compact ? 17 : 19} strokeWidth={2} aria-hidden />
      <span className="hidden sm:inline">คู่มือ</span>
      <span className="sr-only sm:hidden">คู่มือการใช้งาน</span>
    </Link>
  );
}
