"use client";

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * ตาข่ายกันหน้าจอขาว — ก่อนหน้านี้ทั้งแอปไม่มี `error.tsx` เลยสักจุด
 *
 * error ที่เกิดระหว่างเรนเดอร์ฝั่ง client ตรงไหนก็ได้ในเส้นทางนี้ (เช่นร่างเก่าใน
 * `localStorage` ที่ข้อมูลไม่ตรงกับคำถามชุดปัจจุบันแล้ว หลังแอดมินแก้ฟอร์ม) จะทำให้
 * React ถอดทั้งต้นไม้ออกเหลือแต่จอเปล่า — ไม่มีทางกู้กลับมาโดยไม่ปิดแท็บ · กล่องนี้
 * ดักไว้ก่อนถึงจุดนั้น ให้กดลองใหม่หรือกลับหน้าแรกได้แทนจอขาวเงียบ ๆ
 */
export default function RecruitmentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="recruit-canvas flex min-h-dvh flex-col items-center justify-center px-5 py-10 text-center">
      <span className="flex size-14 flex-none items-center justify-center rounded-full bg-alert/10 text-alert">
        <TriangleAlert size={26} strokeWidth={1.8} aria-hidden />
      </span>

      <h1 className="mt-4 text-19 font-semibold text-balance">
        เกิดข้อผิดพลาดบางอย่าง
      </h1>
      <p className="mt-2 max-w-[38ch] text-13-5 leading-relaxed text-mut text-pretty">
        ลองกด “ลองใหม่อีกครั้ง” ก่อน ถ้ายังไม่หายให้กลับไปเริ่มหน้าแรกใหม่ — ข้อมูลที่
        กรอกไว้ในเครื่องนี้ยังอยู่ ไม่ได้หายไปไหน
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2.5">
        <button
          type="button"
          onClick={reset}
          className="btn-pri flex items-center justify-center gap-2 py-3 text-14 font-semibold"
        >
          <RefreshCw size={15} strokeWidth={2} aria-hidden />
          ลองใหม่อีกครั้ง
        </button>
        <Link
          href="/recruitment"
          className="rounded-box border border-line py-3 text-13-5 font-medium text-ink transition-colors hover:border-primary/40"
        >
          กลับไปหน้าแรก
        </Link>
      </div>
    </div>
  );
}
